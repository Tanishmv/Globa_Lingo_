import { useEffect, useState, useRef } from "react";
import { useParams, useNavigate } from "react-router";
import useAuthUser from "../hooks/useAuthUser";
import socketService from "../lib/socket";
import webrtcService from "../lib/webrtc";
import toast from "react-hot-toast";

const CallPageNew = () => {
  const { id: targetUserId } = useParams();
  const navigate = useNavigate();
  const { authUser } = useAuthUser();
  
  const [callState, setCallState] = useState("initializing"); // initializing, calling, connected, ended
  const [isVideoEnabled, setIsVideoEnabled] = useState(true);
  const [isAudioEnabled, setIsAudioEnabled] = useState(true);
  const [connectionError, setConnectionError] = useState(null);
  const [connectionStats, setConnectionStats] = useState({});
  
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);

  // Initialize connection
  useEffect(() => {
    if (!authUser || !targetUserId) return;

    const initializeCall = async () => {
      try {
        console.log("Initializing call...");
        setConnectionError(null);

        // Connect to socket if not connected
        if (!socketService.isConnected()) {
          await socketService.connect(authUser);
          toast.success("Connected to server");
        }

        // Setup WebRTC event handlers
        setupWebRTCHandlers();
        
        // Setup socket handlers for WebRTC signaling
        setupSignalingHandlers();

        // Start the call
        await startCall();

      } catch (error) {
        console.error("Failed to initialize call:", error);
        setConnectionError(error.message);
        setCallState("ended");
        toast.error(`Call failed: ${error.message}`);
      }
    };

    initializeCall();

    // Cleanup on unmount
    return () => {
      endCall();
    };
  }, [authUser, targetUserId]);

  const setupWebRTCHandlers = () => {
    // Handle remote stream
    webrtcService.onRemoteStream((remoteStream) => {
      console.log("Remote stream received");
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = remoteStream;
      }
      setCallState("connected");
      toast.success("Call connected!");
    });

    // Handle call ended
    webrtcService.onCallEnded(() => {
      console.log("Call ended by remote");
      setCallState("ended");
      toast.info("Call ended by remote user");
      setTimeout(() => navigate("/"), 2000);
    });
  };

  const setupSignalingHandlers = () => {
    // Handle incoming offer (receiver side)
    socketService.on("webrtc:offer", async (data) => {
      try {
        console.log("Received WebRTC offer:", data);
        setCallState("calling");
        
        const { localStream } = await webrtcService.answerCall(
          data.offer,
          data.fromSocketId,
          data.callId
        );

        if (localVideoRef.current) {
          localVideoRef.current.srcObject = localStream;
        }

      } catch (error) {
        console.error("Failed to answer call:", error);
        setConnectionError(error.message);
        setCallState("ended");
        toast.error("Failed to answer call");
      }
    });

    // Handle incoming answer (caller side)
    socketService.on("webrtc:answer", async (data) => {
      try {
        console.log("Received WebRTC answer:", data);
        
        await webrtcService.handleAnswer(data.answer, data.fromSocketId);
        
      } catch (error) {
        console.error("Failed to handle answer:", error);
        setConnectionError(error.message);
        toast.error("Failed to establish connection");
      }
    });

    // Handle ICE candidates
    socketService.on("webrtc:ice-candidate", async (data) => {
      try {
        console.log("Received ICE candidate");
        await webrtcService.handleIceCandidate(data.candidate);
      } catch (error) {
        console.error("Failed to handle ICE candidate:", error);
      }
    });

    // Handle call ended
    socketService.on("call:ended", (data) => {
      console.log("Call ended by remote:", data);
      setCallState("ended");
      webrtcService.cleanup();
      toast.info("Call ended");
      setTimeout(() => navigate("/"), 2000);
    });

    // Handle errors
    socketService.on("error", (error) => {
      console.error("Socket error during call:", error);
      setConnectionError(error.message);
      toast.error(`Connection error: ${error.message}`);
    });
  };

  const startCall = async () => {
    try {
      console.log("Starting call to:", targetUserId);
      setCallState("calling");
      
      const { localStream } = await webrtcService.startCall(targetUserId);
      
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = localStream;
      }

      toast.success("Call initiated");

      // Monitor connection stats
      monitorConnectionStats();

    } catch (error) {
      console.error("Failed to start call:", error);
      throw error;
    }
  };

  const endCall = () => {
    try {
      console.log("Ending call");
      webrtcService.endCall();
      setCallState("ended");
      
      // Navigate back after cleanup
      setTimeout(() => {
        navigate("/");
      }, 1000);
      
    } catch (error) {
      console.error("Error ending call:", error);
    }
  };

  const toggleVideo = () => {
    const newState = webrtcService.toggleVideo();
    setIsVideoEnabled(newState);
    toast.info(newState ? "Video enabled" : "Video disabled");
  };

  const toggleAudio = () => {
    const newState = webrtcService.toggleAudio();
    setIsAudioEnabled(newState);
    toast.info(newState ? "Audio enabled" : "Audio disabled");
  };

  const monitorConnectionStats = () => {
    const interval = setInterval(() => {
      const stats = webrtcService.getConnectionState();
      setConnectionStats(stats);
      
      if (stats.state === "failed" || stats.state === "disconnected") {
        clearInterval(interval);
      }
    }, 2000);

    return () => clearInterval(interval);
  };

  // Loading screen
  if (callState === "initializing") {
    return (
      <div className="h-screen bg-black flex items-center justify-center">
        <div className="text-center text-white">
          <div className="loading loading-spinner loading-lg mb-4"></div>
          <p className="text-lg">Initializing call...</p>
          <p className="text-sm text-gray-300 mt-2">Setting up connection</p>
        </div>
      </div>
    );
  }

  // Call ended screen
  if (callState === "ended") {
    return (
      <div className="h-screen bg-black flex items-center justify-center">
        <div className="text-center text-white">
          <div className="text-6xl mb-4">📞</div>
          <p className="text-xl mb-2">Call Ended</p>
          {connectionError && (
            <p className="text-red-400 text-sm mb-4">Error: {connectionError}</p>
          )}
          <p className="text-gray-300">Returning to chat...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen bg-black relative overflow-hidden">
      {/* Connection Status */}
      <div className="absolute top-4 left-4 z-20">
        <div className={`px-3 py-1 rounded-full text-sm font-medium ${
          callState === "connected" 
            ? 'bg-green-500 text-white' 
            : callState === "calling" 
              ? 'bg-yellow-500 text-black'
              : 'bg-red-500 text-white'
        }`}>
          {callState === "connected" && '🟢 Connected'}
          {callState === "calling" && '🟡 Connecting...'}
          {connectionError && '🔴 Error'}
        </div>
        
        {/* Connection Stats */}
        {callState === "connected" && connectionStats.state && (
          <div className="bg-black bg-opacity-50 text-white text-xs p-2 rounded mt-2">
            <div>State: {connectionStats.state}</div>
            <div>Local: {connectionStats.hasLocalStream ? '✓' : '✗'}</div>
            <div>Remote: {connectionStats.hasRemoteStream ? '✓' : '✗'}</div>
          </div>
        )}
      </div>

      {/* Error Message */}
      {connectionError && (
        <div className="absolute top-4 right-4 z-20 bg-red-500 text-white px-4 py-2 rounded-lg max-w-sm">
          <p className="text-sm">{connectionError}</p>
          <button
            onClick={() => window.location.reload()}
            className="text-xs bg-red-600 hover:bg-red-700 px-2 py-1 rounded mt-2"
          >
            Retry
          </button>
        </div>
      )}

      {/* Remote Video (Main) */}
      <video
        ref={remoteVideoRef}
        autoPlay
        playsInline
        className="w-full h-full object-cover"
        style={{ transform: 'scaleX(-1)' }} // Mirror effect
      />
      
      {/* Remote Video Placeholder */}
      {(!remoteVideoRef.current?.srcObject || callState === "calling") && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-800">
          <div className="text-center text-white">
            <div className="text-6xl mb-4">👤</div>
            <p className="text-xl">
              {callState === "calling" ? "Connecting..." : "Waiting for remote video"}
            </p>
          </div>
        </div>
      )}

      {/* Local Video (Picture-in-Picture) */}
      <div className="absolute top-4 right-4 w-48 h-36 bg-gray-800 rounded-lg overflow-hidden shadow-lg z-10">
        <video
          ref={localVideoRef}
          autoPlay
          playsInline
          muted // Always mute local video to prevent feedback
          className="w-full h-full object-cover"
          style={{ transform: 'scaleX(-1)' }} // Mirror effect
        />
        {!isVideoEnabled && (
          <div className="absolute inset-0 bg-gray-800 flex items-center justify-center">
            <span className="text-white text-2xl">📹</span>
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="absolute bottom-8 left-1/2 transform -translate-x-1/2 z-20">
        <div className="flex items-center space-x-4 bg-black bg-opacity-50 p-4 rounded-full">
          {/* Audio Toggle */}
          <button
            onClick={toggleAudio}
            className={`w-12 h-12 rounded-full flex items-center justify-center text-xl ${
              isAudioEnabled 
                ? 'bg-gray-600 hover:bg-gray-700 text-white' 
                : 'bg-red-500 hover:bg-red-600 text-white'
            }`}
            title={isAudioEnabled ? "Mute" : "Unmute"}
          >
            {isAudioEnabled ? '🎤' : '🔇'}
          </button>

          {/* Video Toggle */}
          <button
            onClick={toggleVideo}
            className={`w-12 h-12 rounded-full flex items-center justify-center text-xl ${
              isVideoEnabled 
                ? 'bg-gray-600 hover:bg-gray-700 text-white' 
                : 'bg-red-500 hover:bg-red-600 text-white'
            }`}
            title={isVideoEnabled ? "Turn off camera" : "Turn on camera"}
          >
            {isVideoEnabled ? '📹' : '📷'}
          </button>

          {/* End Call */}
          <button
            onClick={endCall}
            className="w-12 h-12 rounded-full bg-red-500 hover:bg-red-600 text-white flex items-center justify-center text-xl"
            title="End call"
          >
            📞
          </button>
        </div>
      </div>

      {/* Call Duration (if connected) */}
      {callState === "connected" && (
        <div className="absolute top-1/2 left-4 transform -translate-y-1/2 z-10">
          <CallTimer />
        </div>
      )}
    </div>
  );
};

// Simple call timer component
const CallTimer = () => {
  const [duration, setDuration] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setDuration(prev => prev + 1);
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  const formatTime = (seconds) => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    
    if (hrs > 0) {
      return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="bg-black bg-opacity-50 text-white px-3 py-1 rounded-full text-sm">
      {formatTime(duration)}
    </div>
  );
};

export default CallPageNew;