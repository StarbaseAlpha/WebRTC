'use strict';

function WEBRTC(configuration = null) {

  const config = configuration || {
    iceServers: [{
      "urls": ["stun:stun1.l.google.com:19302", "stun:stun2.l.google.com:19302", "stun:stun3.l.google.com:19302", "stun:stun4.l.google.com:19302"]
    }]
  };

  const peer = new RTCPeerConnection(config);

  let sendHandler = null;

  const onSend = (cb) => {
    sendHandler = cb;
  };

  const send = (e) => {
    if (sendHandler && typeof sendHandler === 'function') {
      sendHandler(e);
    }
  };

  let eventHandler = null;

  const onEvent = (cb) => {
    eventHandler = cb;
  };

  const Event = (m) => {
    if (eventHandler && typeof eventHandler === 'function') {
      eventHandler(m);
    }
  };

  peer.oniceconnectionstatechange = (e) => {
    if (e.target.iceConnectionState === 'connected') {
      Event({
        "type": "connected"
      });
    }
    if (e.target.iceConnectionState === 'disconnected') {
      Event({
        "type": "disconnected"
      });
    }
  };

  peer.onnegotiationneeded = async (e) => {
    const offer = await peer.createOffer();
    await peer.setLocalDescription(offer),
      send({
        "description": peer.localDescription.toJSON()
      })
    peer.onicecandidate = async (e) => {
      if (e.candidate) {
        send({
          "candidate": e.candidate.toJSON()
        });
      }
    };
  };

  peer.ondatachannel = (e => {
    Event(e);
  });

  peer.ontrack = (e) => {
    Event(e);
  };

  const Listen = async ({
    description,
    candidate
  }) => {
    if (description) {
      await peer.setRemoteDescription(description);
      if (description.type === 'offer') {
        await peer.setLocalDescription(await peer.createAnswer());
        send({
          "description": peer.localDescription.toJSON()
        })
        peer.onicecandidate = async (e) => {
          if (e.candidate) {
            send({
              "candidate": e.candidate.toJSON()
            });
          }
        };
      }
    } else if (candidate) {
      await peer.addIceCandidate(candidate);
    }
  };

  const AddTrack = async (track, stream) => {
    await peer.addTrack(track, stream);
  };

  const CreateDataChannel = async (label = null, options = {}) => {
    return peer.createDataChannel(label, options);
  };

  return {
    "pc": peer,
    "createDataChannel": CreateDataChannel,
    "addTrack": AddTrack,
    "listen": Listen,
    "onSend": onSend,
    "onEvent": onEvent
  };

}
