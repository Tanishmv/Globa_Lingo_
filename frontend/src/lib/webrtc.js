import socketService from "./socket.js";

const webrtcConfig = {
  iceServers: [
    {
      urls: [
        "stun:stun.l.google.com:19302",
        "stun:stun1.l.google.com:19302",
      ],
    },
  ],
  iceCandidatePoolSize: 10,
};

class WebRTCService {
  constructor() {
    this.peerConnection = null;
    this.localStream = null;
    this.remoteStream = null;
    this.callId = null;
    this.remoteSocketId = null;
    this.onRemoteStreamCallback = null;
    this.onCallEndedCallback = null;
    this.connectionState = "disconnected";
  }

  // Initialize WebRTC connection
  async initializePeerConnection() {
    try {
      // Clean up existing connection
      if (this.peerConnection) {
        this.peerConnection.close();
      }

      this.peerConnection = new RTCPeerConnection(webrtcConfig);
      console.log("Peer connection created:", this.peerConnection);

      // Handle remote stream
      this.peerConnection.ontrack = (event) => {
        console.log("Received remote stream");
        this.remoteStream = event.streams[0];
        if (this.onRemoteStreamCallback) {
          this.onRemoteStreamCallback(this.remoteStream);
        }
      };

      // Handle ICE candidates
      this.peerConnection.onicecandidate = (event) => {
        if (event.candidate && this.remoteSocketId) {
          console.log("Sending ICE candidate");
          socketService.sendIceCandidate(
            this.remoteSocketId,
            event.candidate,
            this.callId
          );
        }
      };

      // Connection state monitoring
      this.peerConnection.onconnectionstatechange = () => {
        this.connectionState = this.peerConnection.connectionState;
        console.log("Connection state changed:", this.connectionState);

        if (this.connectionState === "failed") {
          this.handleConnectionFailure();
        }
      };

      this.peerConnection.oniceconnectionstatechange = () => {
        console.log("ICE connection state:", this.peerConnection.iceConnectionState);
      };

      // Verify the connection was created
      if (!this.peerConnection) {
        throw new Error("Failed to create RTCPeerConnection");
      }

      return this.peerConnection;
    } catch (error) {
      console.error("Failed to initialize peer connection:", error);
      this.peerConnection = null;
      throw error;
    }
  }

  // Get user media with error handling
  async getUserMedia(constraints = { video: true, audio: true }) {
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error("getUserMedia not supported");
      }

      this.localStream = await navigator.mediaDevices.getUserMedia(constraints);
      console.log("Local stream acquired:", {
        video: this.localStream.getVideoTracks().length,
        audio: this.localStream.getAudioTracks().length,
      });

      return this.localStream;
    } catch (error) {
      console.error("Failed to get user media:", error);
      
      // Try fallback - audio only
      if (constraints.video) {
        console.log("Trying audio-only fallback...");
        try {
          this.localStream = await navigator.mediaDevices.getUserMedia({
            video: false,
            audio: true,
          });
          return this.localStream;
        } catch (audioError) {
          console.error("Audio-only fallback failed:", audioError);
        }
      }
      
      throw new Error(`Media access denied: ${error.message}`);
    }
  }

  // Start a call (caller side)
  async startCall(targetUserId) {
    try {
      console.log("Starting call to:", targetUserId);
      
      // Generate unique call ID
      this.callId = `call-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

      // Initialize peer connection
      await this.initializePeerConnection();

      // Get user media
      await this.getUserMedia();

      // Add local stream to peer connection
      this.localStream.getTracks().forEach(track => {
        this.peerConnection.addTrack(track, this.localStream);
      });

      // Create and send offer
      const offer = await this.peerConnection.createOffer({
        offerToReceiveVideo: true,
        offerToReceiveAudio: true,
      });

      await this.peerConnection.setLocalDescription(offer);

      // Send offer through signaling server
      socketService.sendOffer(targetUserId, offer, this.callId);

      return {
        callId: this.callId,
        localStream: this.localStream,
      };
    } catch (error) {
      console.error("Failed to start call:", error);
      this.cleanup();
      throw error;
    }
  }

  // Answer a call (receiver side)
  async answerCall(offer, fromSocketId, callId) {
    try {
      console.log("Answering call:", callId);
      
      this.callId = callId;
      this.remoteSocketId = fromSocketId;

      // Initialize peer connection
      await this.initializePeerConnection();

      // Get user media
      await this.getUserMedia();

      // Add local stream to peer connection
      this.localStream.getTracks().forEach(track => {
        this.peerConnection.addTrack(track, this.localStream);
      });

      // Set remote description
      await this.peerConnection.setRemoteDescription(offer);

      // Create and send answer
      const answer = await this.peerConnection.createAnswer();
      await this.peerConnection.setLocalDescription(answer);

      // Send answer through signaling server
      socketService.sendAnswer(fromSocketId, answer, callId);

      return {
        callId: this.callId,
        localStream: this.localStream,
      };
    } catch (error) {
      console.error("Failed to answer call:", error);
      this.cleanup();
      throw error;
    }
  }

  // Handle received answer (caller side)
  async handleAnswer(answer, fromSocketId) {
    try {
      console.log("Handling answer from:", fromSocketId);
      this.remoteSocketId = fromSocketId;
      
      await this.peerConnection.setRemoteDescription(answer);
    } catch (error) {
      console.error("Failed to handle answer:", error);
      throw error;
    }
  }

  // Handle received ICE candidate
  async handleIceCandidate(candidate) {
    try {
      if (this.peerConnection && candidate) {
        await this.peerConnection.addIceCandidate(candidate);
      }
    } catch (error) {
      console.error("Failed to add ICE candidate:", error);
    }
  }

  // End the call
  endCall() {
    try {
      console.log("Ending call:", this.callId);
      
      if (this.remoteSocketId && this.callId) {
        socketService.emit("call:end", {
          targetSocketId: this.remoteSocketId,
          callId: this.callId,
        });
      }

      this.cleanup();
    } catch (error) {
      console.error("Error ending call:", error);
    }
  }

  // Handle connection failure
  handleConnectionFailure() {
    console.log("WebRTC connection failed, attempting to reconnect...");
    
    // You could implement reconnection logic here
    // For now, just clean up
    setTimeout(() => {
      if (this.connectionState === "failed") {
        console.log("Connection still failed, ending call");
        this.endCall();
      }
    }, 5000);
  }

  // Clean up resources
  cleanup() {
    console.log("Cleaning up WebRTC resources");

    if (this.localStream) {
      this.localStream.getTracks().forEach(track => track.stop());
      this.localStream = null;
    }

    if (this.peerConnection) {
      this.peerConnection.close();
      this.peerConnection = null;
    }

    this.remoteStream = null;
    this.callId = null;
    this.remoteSocketId = null;
    this.connectionState = "disconnected";
  }

  // Toggle video
  toggleVideo(enabled = null) {
    if (this.localStream) {
      const videoTracks = this.localStream.getVideoTracks();
      if (videoTracks.length > 0) {
        const newState = enabled !== null ? enabled : !videoTracks[0].enabled;
        videoTracks[0].enabled = newState;
        return newState;
      }
    }
    return false;
  }

  // Toggle audio
  toggleAudio(enabled = null) {
    if (this.localStream) {
      const audioTracks = this.localStream.getAudioTracks();
      if (audioTracks.length > 0) {
        const newState = enabled !== null ? enabled : !audioTracks[0].enabled;
        audioTracks[0].enabled = newState;
        return newState;
      }
    }
    return false;
  }

  // Set callbacks
  onRemoteStream(callback) {
    this.onRemoteStreamCallback = callback;
  }

  onCallEnded(callback) {
    this.onCallEndedCallback = callback;
  }

  // Get connection status
  getConnectionState() {
    return {
      state: this.connectionState,
      hasLocalStream: !!this.localStream,
      hasRemoteStream: !!this.remoteStream,
      callId: this.callId,
    };
  }
}

// Create singleton instance
const webrtcService = new WebRTCService();

export default webrtcService;