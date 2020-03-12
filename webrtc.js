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

  const ConnectionChange = (e, pc, id) => {
    stateHandler(calls[id], {
      "type":"connectionchange",
      "state":pc.connectionState
    });
  };

  function PEER(id, to) {

    let pc = new RTCPeerConnection(config);

    pc.onclose = (e) => {
      Disconnected(e, pc, id);
    };

    pc.ondatachannel = (e) => {
      ChannelAdded(e, pc, id);
    };

    pc.ontrack = (e) => {
      remoteTrackAdded(e, pc, id);
    };

    let call = {
      id,
      "to":to.toString(),
      pc,
      "channels":{},
      "localTracks":[],
      "remoteTracks":[]
    };

    calls[id] = call;

    return call;
  }

  // CALL

  function CALL(to, stream = null) {
    return new Promise(async (resolve, reject) => {

      let id = crypto.getRandomValues(new Uint8Array(128)).join('').toString().slice(32, 96);

      calls[id] = PEER(id, to);
      let pc = calls[id].pc;

      calls[id].channels.chat = calls[id].pc.createDataChannel('chat');
      calls[id].channels.chat.onopen = (e) => {
        ChannelOpen(e, pc, id);
      };

      if (stream) {
        localTrackAdded(stream, pc, id);
      }

      calls[id].pc.createOffer().then(async desc => {
        await calls[id].pc.setLocalDescription(desc);
        send({
          "id": id,
          "to": to,
          "type": "call",
          "stream": (stream) ? true : false,
          "call": {
            "desc": calls[id].pc.localDescription
          }
        });
        calls[id].pc.onicecandidate = (e) => {
          if (e.candidate) {
            send({
              "id": id,
              "to": to,
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

  // LISTEN

  async function LISTEN(call) {
    if (!call && !call.id && !call.type === 'call') {
      return null;
    }

    if (!calls[call.id]) {
      calls[call.id] = PEER(call.id, call.from);
    }

    if (call.call.desc) {
      const offerDesc = new RTCSessionDescription(call.call.desc);
      await calls[call.id].pc.setRemoteDescription(offerDesc);
      stateHandler(calls[call.id], {"type":"incoming", "call":call});
    }

    if (call.call.candidate) {
      await calls[call.id].pc.addIceCandidate(new RTCIceCandidate(call.call.candidate)).catch(err=>{console.log(err);return null;});
    }

  }

  // ANSWER

  function ANSWER(call, stream) {
    return new Promise(async (resolve, reject) => {

      let id = call.id || null;

      if (!calls[id]) {
        return null;
      }

      if (stream) {
        localTrackAdded(stream, calls[id].pc, id);
      }

      calls[id].pc.createAnswer().then(async answerDesc=>{
        await calls[id].pc.setLocalDescription(answerDesc);
        send({
          "id": id,
          "to": calls[id].to,  
          "type": "answer",
          "answer": {
            "desc": answerDesc
          }
        });
        calls[id].pc.onicecandidate = (e) => {
          if (e.candidate) {
            send({
              "id": id,
              "to": calls[id].to,
              "type": "answer",
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

  // GOT ANSWER

  async function gotAnswer(answer) {
    if (!answer && !answer.id && !calls[answer.id] && answer.type !== 'answer') {
      return null;
    }
    const conn = calls[answer.id];

    if (answer.answer && answer.answer.desc) {
      const answerDesc = new RTCSessionDescription(answer.answer.desc);
      await conn.pc.setRemoteDescription(answerDesc);
    }

    if (answer.answer && answer.answer.candidate) {
      await conn.pc.addIceCandidate(new RTCIceCandidate(answer.answer.candidate)).catch(err=>{console.log(err);return null;});
    }

  }

  return {
    "calls": calls,
    "call": CALL,
    "listen": LISTEN,
    "answer": ANSWER,
    "gotAnswer": gotAnswer,
    "onState": (cb) => {
      onState = cb;
    }
  };

}
