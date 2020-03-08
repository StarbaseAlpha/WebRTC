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
    calls[id].data[label] = e.channel;
    calls[id].data[label].onopen = (e) => {
      ChannelOpen(e, pc, id);
    };
    return calls[id].data[label];
  };

  const TrackAdded = (e, pc, id) => {
    if (!calls[id].tracks) {
      calls[id].tracks = [];
    }
    calls[id].tracks.push(e.track);
    stateHandler(calls[id], {
      "type": "track",
      "track": e.track,
      "message": "Media track added"
    });
  };

  // CALL

  function CALL(to, stream = null) {
    return new Promise((resolve, reject) => {

      let id = crypto.getRandomValues(new Uint8Array(32)).join('').toString().slice(0, 16);
      let pc = new RTCPeerConnection(config);

      calls[id] = {
        id,
        pc
      };
      calls[id].data = {};
      calls[id].data.chat = pc.createDataChannel('chat');
      calls[id].data.chat.onopen = (e) => {
        ChannelOpen(e, pc, id);
      };

      if (stream) {
        for (let track of stream.getTracks()) {
          pc.addTrack(track);
        }
      }

      pc.ondatachannel = (e) => {
        ChannelAdded(e, pc, id);
      };

      pc.ontrack = (e) => {
        TrackAdded(e, pc, id);
      };

      pc.createOffer().then(function(e) {
        pc.setLocalDescription(e);

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
              "stream": (stream) ? true : false,
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
    return new Promise((resolve, reject) => {

      if (!call && !call.id && !call.type === 'call') {
        return null;
      }

      if (calls[call.id] && call.call && call.call.candidate) {
        calls[call.id].pc.addIceCandidate(call.call.candidate || null);
        return null;
      }

      let id = call.id;
      let to = call.from.toString();
      let pc = new RTCPeerConnection(config);
      calls[id] = {
        id,
        pc,
        "data": {}
      };

      if (stream) {
        for (let track of stream.getTracks()) {
          pc.addTrack(track);
        }
      }

      pc.ondatachannel = (e) => {
        ChannelAdded(e, pc, id);
      };

      pc.ontrack = (e) => {
        TrackAdded(e, pc, id);
      };

      const offerDesc = new RTCSessionDescription(call.call.desc || null);
      pc.setRemoteDescription(offerDesc);

      pc.createAnswer((answerDesc) => {
        pc.setLocalDescription(answerDesc);
        send({
          "id": id,
          "to": to.toString(),
          "type": "answer",
          "answer": {
            "desc": answerDesc
          }
        });
        resolve(call[id]);
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
        }
      }, () => {
        ////////////////////////
        console.warn("Couldn't create offer")
      }, sdpConstraints);
    });
  }

  // GOT ANSWER

  function gotAnswer(answer) {
    if (!answer && !answer.id && !calls[answer.id] && answer.type !== 'answer') {
      return null;
    }
    const conn = calls[answer.id];
    if (answer.answer && answer.answer.candidate) {
      conn.pc.addIceCandidate(answer.answer.candidate);
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
