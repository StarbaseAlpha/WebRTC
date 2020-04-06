'use strict';

function WEBRTC(configuration = null) {

  const config = configuration || {
    iceServers: [{
      "urls": ["stun:stun1.l.google.com:19302", "stun:stun2.l.google.com:19302", "stun:stun3.l.google.com:19302", "stun:stun4.l.google.com:19302"]
    }]
  };

  const peer = new RTCPeerConnection(config);

  let dataChannels = {};
  let tracks = {};

  let sendHandler = null;

  const onSend = (cb) => {
    sendHandler = cb;
  };

  const send = (e) => {
    if (sendHandler && typeof sendHandler === 'function') {
      sendHandler(e);
    }
  };

  let dataChannelHandler = null;

  const onDataChannel = (cb) => {
    dataChannelHandler = cb;
  };

  let trackHandler = null;

  const onTrack = (cb) => {
    trackHandler = cb;
  };

  let connectedHandler = null;

  const onConnected = (cb) => {
    connectedHandler = cb;
  };

  let disconnectedHandler = null;

  const onDisconnected = (cb) => {
    disconnectedHandler = cb;
  };

  peer.oniceconnectionstatechange = (e) => {
    if (e.target.iceConnectionState === 'connected' && connectedHandler && typeof connectedHandler === 'function') {
      connectedHandler({
        "type": "connected"
      });
    }
    if (e.target.iceConnectionState === 'disconnected' && disconnectedHandler && typeof disconnectedHandler === 'function') {
      disconnectedHandler({
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
    if (dataChannelHandler && typeof dataChannelHandler === 'function') {
      dataChannelHandler(e);
    }
    dataChannels[e.channel.label] = e.channel;
  });

  peer.ontrack = (e) => {
    if (trackHandler && typeof trackHandler === 'function') {
      trackHandler(e);
    }
    tracks[e.track.id] = e.track;
  };

  const Close = () => {
    peer.close();
    disconnectedHandler({
      "type": "disconnected"
    });
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

  const AddTrack = (track, stream) => {
    return peer.addTrack(track, stream);
  };

  const CreateDataChannel = (label = null, options = {}) => {
    let dataChannel = peer.createDataChannel(label, options);
    dataChannels[label] = dataChannel;
    return dataChannel;
  };

  return {
    "peerConnection": peer,
    "createDataChannel": CreateDataChannel,
    "addTrack": AddTrack,
    "listen": Listen,
    "onSend": onSend,
    "onTrack": onTrack,
    "onDataChannel": onDataChannel,
    "onConnected": onConnected,
    "onDisconnected": onDisconnected,
    "tracks": tracks,
    "dataChannels": dataChannels,
    "close":Close
  };

}
