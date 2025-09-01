// WebRTC configuration with STUN servers for NAT traversal
export const webrtcConfig = {
  iceServers: [
    {
      urls: [
        "stun:stun.l.google.com:19302",
        "stun:stun1.l.google.com:19302",
        "stun:stun2.l.google.com:19302",
        "stun:stun3.l.google.com:19302",
        "stun:stun4.l.google.com:19302",
      ],
    },
  ],
  iceCandidatePoolSize: 10,
};

// Test WebRTC connection capability
export const testWebRTCSupport = () => {
  try {
    const isSupported = !!(
      window.RTCPeerConnection &&
      navigator.mediaDevices &&
      navigator.mediaDevices.getUserMedia
    );
    
    return {
      supported: isSupported,
      details: {
        RTCPeerConnection: !!window.RTCPeerConnection,
        getUserMedia: !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia),
        mediaDevices: !!navigator.mediaDevices,
      },
    };
  } catch (error) {
    console.error("WebRTC support test failed:", error);
    return {
      supported: false,
      error: error.message,
    };
  }
};

// Get media with error handling and fallbacks
export const getMediaStream = async (constraints = { video: true, audio: true }) => {
  try {
    // Test basic support first
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new Error("getUserMedia not supported in this browser");
    }

    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    
    console.log("Media stream acquired:", {
      video: stream.getVideoTracks().length > 0,
      audio: stream.getAudioTracks().length > 0,
      tracks: stream.getTracks().length,
    });

    return stream;
  } catch (error) {
    console.error("Failed to get media stream:", error);
    
    // Try fallback with different constraints
    if (constraints.video && constraints.audio) {
      console.log("Trying audio-only fallback...");
      try {
        return await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      } catch (audioError) {
        console.error("Audio-only fallback failed:", audioError);
      }
    }
    
    throw new Error(`Media access failed: ${error.message}`);
  }
};

// Test network connectivity for WebRTC
export const testWebRTCConnectivity = async () => {
  try {
    const pc = new RTCPeerConnection(webrtcConfig);
    
    return new Promise((resolve, reject) => {
      let timeout = setTimeout(() => {
        pc.close();
        reject(new Error("ICE gathering timeout"));
      }, 10000);

      pc.onicecandidate = (event) => {
        if (event.candidate) {
          console.log("ICE candidate gathered:", event.candidate.type);
          clearTimeout(timeout);
          pc.close();
          resolve({
            success: true,
            candidateType: event.candidate.type,
          });
        }
      };

      pc.onicegatheringstatechange = () => {
        console.log("ICE gathering state:", pc.iceGatheringState);
        if (pc.iceGatheringState === "complete") {
          clearTimeout(timeout);
          pc.close();
          resolve({
            success: true,
            state: "complete",
          });
        }
      };

      // Create a data channel to trigger ICE gathering
      pc.createDataChannel("test");
      pc.createOffer()
        .then(offer => pc.setLocalDescription(offer))
        .catch(reject);
    });
  } catch (error) {
    console.error("WebRTC connectivity test failed:", error);
    return {
      success: false,
      error: error.message,
    };
  }
};

// Connection quality monitoring
export const monitorConnection = (peerConnection) => {
  const stats = {
    bytesReceived: 0,
    bytesSent: 0,
    packetsLost: 0,
    rtt: 0,
  };

  const monitor = setInterval(async () => {
    try {
      const statsReport = await peerConnection.getStats();
      
      statsReport.forEach((report) => {
        if (report.type === "inbound-rtp" && report.mediaType === "video") {
          stats.bytesReceived = report.bytesReceived || 0;
          stats.packetsLost = report.packetsLost || 0;
        }
        
        if (report.type === "outbound-rtp" && report.mediaType === "video") {
          stats.bytesSent = report.bytesSent || 0;
        }
        
        if (report.type === "candidate-pair" && report.state === "succeeded") {
          stats.rtt = report.currentRoundTripTime || 0;
        }
      });

      console.log("Connection stats:", stats);
    } catch (error) {
      console.error("Failed to get connection stats:", error);
    }
  }, 5000);

  return {
    stats,
    stop: () => clearInterval(monitor),
  };
};