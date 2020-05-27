'use strict';

function WEBRTC(configuration = null, polite = false) {

  const config = configuration || {
    iceServers: [{
      "urls": ["stun:stun1.l.google.com:19302", "stun:stun2.l.google.com:19302"]
    }]
  };

  const pc = new RTCPeerConnection(config);

  let sendHandler = null;
  const onSend = (cb) => {
    sendHandler = cb;
  };
  const send = (e) => {
    if (sendHandler && typeof sendHandler === 'function') {
      sendHandler(e);
    }
  };

  let errorHandler = null;
  const onError = (cb) => {
    errorHandler = cb;
  };
  const error = (err) => {
    if (errorHandler && typeof errorHandler === 'function') {
      errorHandler(err);
    }
  };

  let connectedHandler = null;
  const onConnected = (cb) => {
    connectedHandler = cb;
  };

  let disconnectedHandler = null;
  const onDisconnected = (cb) => {
    disconnectedHandler = cb;
  };

  let dataChannels = {};
  let dataChannelHandler = null;
  const onDataChannel = (cb) => {
    dataChannelHandler = cb;
  };

  let tracks = {};
  let trackHandler = null;
  const onTrack = (cb) => {
    trackHandler = cb;
  };

  pc.oniceconnectionstatechange = (e) => {
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
    if (e.target.iceConnectionState === "failed") {
      pc.restartIce();
    }
  };

  let makingOffer = false;
  pc.onnegotiationneeded = async () => {
    try {
      makingOffer = true;
      await pc.setLocalDescription().then().catch(error);
      send({
        "description": pc.localDescription
      });
    } catch (err) {
      error(err);
    } finally {
      makingOffer = false;
    }
  };

  pc.onicecandidate = ({candidate}) => send({"candidate":candidate});

  pc.ondatachannel = (e => {
    if (dataChannelHandler && typeof dataChannelHandler === 'function') {
      dataChannelHandler(e);
    }
    dataChannels[e.channel.label] = e.channel;
  });

  pc.ontrack = (e) => {
    if (trackHandler && typeof trackHandler === 'function') {
      trackHandler(e);
    }
    tracks[e.track.id] = e.track;
  };

  let ignoreOffer = false;
  const Listen = async ({
    description,
    candidate
  }) => {

    try {
      if (description) {
        const offerCollision = (description.type == "offer") && (makingOffer || pc.signalingState != "stable");

        ignoreOffer = !polite && offerCollision;
        if (ignoreOffer) {
          return;
        }

        await pc.setRemoteDescription(description).then().catch(error);
        if (description.type == "offer") {
          await pc.setLocalDescription().then().catch(error);
          send({
            "description": pc.localDescription
          });
        }
      } else if (candidate) {
        try {
          await pc.addIceCandidate(candidate).then().catch(error);
        } catch (err) {
          if (!ignoreOffer) {
            throw err;
          }
        }
      }
    } catch (err) {
      error(err);
    }

  };

  const AddTrack = (track, stream) => {
    return pc.addTrack(track, stream);
  };

  const CreateDataChannel = (label = null, options = {}) => {
    let dataChannel = pc.createDataChannel(label, options);
    dataChannels[label] = dataChannel;
    return dataChannel;
  };

  const Close = () => {
    pc.close();
    if (disconnectedHandler && typeof disconnectedHandler === 'function') {
      disconnectedHandler({
        "type": "disconnected"
      });
    }
  };

  return {
    "peerConnection": pc,
    "createDataChannel": CreateDataChannel,
    "addTrack": AddTrack,
    "listen": Listen,
    "onSend": onSend,
    "onError": onError,
    "onTrack": onTrack,
    "onDataChannel": onDataChannel,
    "onConnected": onConnected,
    "onDisconnected": onDisconnected,
    "tracks": tracks,
    "dataChannels": dataChannels,
    "close": Close
  };

}
