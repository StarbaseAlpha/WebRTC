'use strict';

function WEBRTC(send, stunURLs = []) {

  let onState = null;
  let calls = {};

  let stateHandler = (conn, state) => {
    if (onState && typeof onState === 'function') {
      onState(conn, state);
    }
  };

  const config = {
    "iceServers": [{
      "urls": stunURLs
    }]
  };

  const sdpConstraints = {};

  const ChannelOpen = (e, pc, id) => {
    stateHandler(calls[id], {
      "type": "channel",
      "channel": e.target.label,
      "message": "Data channel open"
    });
  };

  const ChannelAdded = (e, pc, id) => {
    let label = e.channel.label;
    calls[id].channels[label] = e.channel;
    calls[id].channels[label].onopen = (e) => {
      ChannelOpen(e, pc, id);
    };
    return calls[id].channels[label];
  };

  const remoteTrackAdded = (e, pc, id) => {
    if (!calls[id].remoteTracks) {
      calls[id].remoteTracks = [];
    }
    calls[id].remoteTracks.push(e.track);
    stateHandler(calls[id], {
      "type": "remoteTrack",
      "track": e.track,
      "message": "Remote media track added"
    });
  };

  const localTrackAdded = (stream, pc, id) => {
    for (let track of stream.getTracks()) {
      pc.addTrack(track);
      calls[id].localTracks.push(track);
      stateHandler(calls[id], {
        "type":"localTrack",
        "track": track,
        "message":"Local media track added"
      });
    }
  };

  const Disconnected = (e, pc, id) => {
    stateHandler(calls[id], {
      "type":"disconnected"
    });
  };

  // CALL

  function CALL(to, stream = null) {
    return new Promise(async (resolve, reject) => {

      let id = crypto.getRandomValues(new Uint8Array(32)).join('').toString().slice(0, 16);
      let pc = new RTCPeerConnection(config);

      calls[id] = {
        id,
        pc,
        "channels":{},
        "localTracks":[],
        "remoteTracks":[]
      };
      calls[id].channels.chat = pc.createDataChannel('chat');
      calls[id].channels.chat.onopen = (e) => {
        ChannelOpen(e, pc, id);
      };

      pc.onclose = (e) => {
        Disconnected(e, pc, id);
      };

      if (stream) {
        localTrackAdded(stream, pc, id);
      }

      pc.ondatachannel = (e) => {
        ChannelAdded(e, pc, id);
      };

      pc.ontrack = (e) => {
        remoteTrackAdded(e, pc, id);
      };

      pc.createOffer().then(desc => {

        pc.setLocalDescription(desc);
        send({
          "id": id,
          "to": to.toString(),
          "type": "call",
          "stream": (stream) ? true : false,
          "call": {
            "desc": pc.localDescription
          }
        });

        pc.onicecandidate = (e) => {
          if (e.candidate) {
            send({
              "id": id,
              "to": to.toString(),
              "type": "call",
              "call": {
                "candidate": e.candidate
              }
            });
          }
        };

        resolve(calls[id]);

      });
    });
  }

  // ANSWER

  function ANSWER(call, stream) {
    return new Promise(async (resolve, reject) => {

      if (!call && !call.id && !call.type === 'call') {
        return null;
      }

      if (calls[call.id] && call.call && call.call.candidate) {
        await calls[call.id].pc.addIceCandidate(call.call.candidate || null).catch(err=>{return null;});
        return null;
      }

      let id = call.id;
      let to = call.from.toString();
      let pc = new RTCPeerConnection(config);
      calls[id] = {
        id,
        pc,
        "channels": {},
        "localTracks":[],
        "remoteTracks":[]
      };

      if (stream) {
        localTrackAdded(stream, pc, id);
      }

      pc.ondatachannel = (e) => {
        ChannelAdded(e, pc, id);
      };

      pc.ontrack = (e) => {
        remoteTrackAdded(e, pc, id);
      };

      if (!call.call.desc) {
        return null;
      }

      const offerDesc = new RTCSessionDescription(call.call.desc || null);
      await pc.setRemoteDescription(call.call.desc||null);

      pc.createAnswer().then(async answerDesc=>{

        await pc.setLocalDescription(answerDesc);
        send({
          "id": id,
          "to": to.toString(),
          "type": "answer",
          "answer": {
            "desc": answerDesc
          }
        });

        pc.onicecandidate = (e) => {
          if (e.candidate) {
            send({
              "id": id,
              "to": to.toString(),
              "type": "answer",
              "answer": {
                "candidate": e.candidate
              }
            });
          }
        };

        resolve(calls[id]);

      });
    });
  }

  // GOT ANSWER

  async function gotAnswer(answer) {
    if (!answer && !answer.id && !calls[answer.id] && answer.type !== 'answer') {
      return null;
    }
    const conn = calls[answer.id];
    if (answer.answer && answer.answer.candidate) {
      await conn.pc.addIceCandidate(answer.answer.candidate).catch(err=>{return null;});
      return null;
    }

    const answerDesc = new RTCSessionDescription(answer.answer.desc || null);
    conn.pc.setRemoteDescription(answerDesc);
  }

  return {
    "calls": calls,
    "call": CALL,
    "answer": ANSWER,
    "gotAnswer": gotAnswer,
    "onState": (cb) => {
      onState = cb;
    }
  };

}
