import React, { useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import { useParams } from "react-router";
import useAuthUser from "../hooks/useAuthUser";
import socketService from "../lib/socket";

const VideoCallNew = () => {
  const { meetingId } = useParams();
  const { authUser } = useAuthUser();
  
  // State
  const [localStream, setLocalStream] = useState(null);
  const [remoteStream, setRemoteStream] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const [callState, setCallState] = useState('waiting'); // waiting, calling, connected
  
  // Refs
  const localVideoRef = useRef();
  const remoteVideoRef = useRef();
  const peerConnection = useRef();
  
  // STUN servers for NAT traversal
  const servers = {
    iceServers: [
      { urls: "stun:stun.l.google.com:19302" },
      { urls: "stun:stun1.l.google.com:19302" }
    ]
  };

  useEffect(() => {
    initializeCall();
    return cleanup;
  }, []);

  const initializeCall = async () => {
    try {
      console.log("🚀 Initializing video call...");
      
      // 1. Check for media devices support
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error("Your browser doesn't support camera/microphone access");
      }
      
      // 2. Get user media with error handling
      console.log("📷 Requesting camera and microphone access...");
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 1280, height: 720 },
        audio: true
      });
      
      setLocalStream(stream);
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }
      
      console.log("✅ Got local stream with tracks:", stream.getTracks().length);
      
      // 3. Connect socket if not already connected
      if (!socketService.isConnected()) {
        console.log("🔗 Connecting to socket...");
        await socketService.connect({
          userId: authUser._id,
          fullName: authUser.fullName
        });
      }
      
      setIsConnected(socketService.isConnected());
      console.log('🔗 Socket status:', socketService.getConnectionStatus());
      
      // 4. Join meeting room
      console.log(`🏠 Joining room: ${meetingId}`);
      socketService.emit('join-room', {
        roomId: meetingId,
        userId: authUser._id,
        userName: authUser.fullName
      });

      // 5. Setup WebRTC peer connection
      setupPeerConnection(stream);
      
      // 6. Setup socket listeners
      setupSocketListeners();
      
    } catch (error) {
      console.error("❌ Error initializing call:", error);
      
      if (error.name === 'NotAllowedError') {
        toast.error("Please allow camera and microphone access to join the call");
      } else if (error.name === 'NotFoundError') {
        toast.error("Camera or microphone not found");
      } else if (error.name === 'NotReadableError') {
        toast.error("Camera or microphone is already in use");
      } else {
        toast.error(`Failed to initialize call: ${error.message}`);
      }
    }
  };

  const setupPeerConnection = (stream) => {
    console.log("🔧 Setting up peer connection...");
    
    peerConnection.current = new RTCPeerConnection(servers);
    
    // Add local stream tracks to peer connection
    stream.getTracks().forEach(track => {
      peerConnection.current.addTrack(track, stream);
    });
    
    // Handle remote stream
    peerConnection.current.ontrack = (event) => {
      console.log("🎥 Received remote stream");
      const [remoteStream] = event.streams;
      setRemoteStream(remoteStream);
      
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = remoteStream;
      }
      
      setCallState('connected');
      toast.success("Video call connected!");
    };
    
    // Handle ICE candidates
    peerConnection.current.onicecandidate = (event) => {
      if (event.candidate && socketService.isConnected()) {
        console.log("🧊 Sending ICE candidate");
        socketService.emit('ice-candidate', {
          candidate: event.candidate,
          roomId: meetingId
        });
      }
    };
    
    // Connection state monitoring
    peerConnection.current.onconnectionstatechange = () => {
      console.log('📡 Connection state:', peerConnection.current.connectionState);
    };
  };

  const setupSocketListeners = () => {
    console.log("👂 Setting up socket listeners...");
    
    // User joined room
    socketService.on('user-joined', async (data) => {
      console.log('👤 User joined:', data.userName);
      toast.success(`${data.userName} joined`);
      
      // Create and send offer
      await createOffer();
    });
    
    // Receive offer
    socketService.on('offer', async (data) => {
      console.log('📨 Received offer');
      await handleOffer(data.offer);
    });
    
    // Receive answer
    socketService.on('answer', async (data) => {
      console.log('📨 Received answer');
      await handleAnswer(data.answer);
    });
    
    // Receive ICE candidate
    socketService.on('ice-candidate', async (data) => {
      console.log('🧊 Received ICE candidate');
      try {
        await peerConnection.current.addIceCandidate(data.candidate);
      } catch (error) {
        console.error('Error adding ICE candidate:', error);
      }
    });
    
    // User left
    socketService.on('user-left', (data) => {
      console.log('👋 User left:', data.userName);
      toast.success(`${data.userName} left the call`);
      setRemoteStream(null);
      setCallState('waiting');
    });
  };

  const createOffer = async () => {
    try {
      console.log("📞 Creating offer...");
      setCallState('calling');
      
      const offer = await peerConnection.current.createOffer();
      await peerConnection.current.setLocalDescription(offer);
      
      socketService.emit('offer', {
        offer: offer,
        roomId: meetingId
      });
      
    } catch (error) {
      console.error('Error creating offer:', error);
    }
  };

  const handleOffer = async (offer) => {
    try {
      console.log("🤝 Handling offer...");
      
      await peerConnection.current.setRemoteDescription(offer);
      
      const answer = await peerConnection.current.createAnswer();
      await peerConnection.current.setLocalDescription(answer);
      
      socketService.emit('answer', {
        answer: answer,
        roomId: meetingId
      });
      
    } catch (error) {
      console.error('Error handling offer:', error);
    }
  };

  const handleAnswer = async (answer) => {
    try {
      console.log("✅ Handling answer...");
      await peerConnection.current.setRemoteDescription(answer);
    } catch (error) {
      console.error('Error handling answer:', error);
    }
  };

  const toggleVideo = () => {
    if (localStream) {
      const videoTrack = localStream.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        toast.success(videoTrack.enabled ? "Video on" : "Video off");
      }
    }
  };

  const toggleAudio = () => {
    if (localStream) {
      const audioTrack = localStream.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        toast.success(audioTrack.enabled ? "Audio on" : "Audio off");
      }
    }
  };

  const endCall = () => {
    cleanup();
    toast.success("Call ended");
    setTimeout(() => window.close(), 1000);
  };

  const cleanup = () => {
    console.log("🧹 Cleaning up...");
    
    if (localStream) {
      localStream.getTracks().forEach(track => track.stop());
    }
    
    if (peerConnection.current) {
      peerConnection.current.close();
    }
    
    // Don't disconnect the shared socket service
    
    setLocalStream(null);
    setRemoteStream(null);
    setCallState('waiting');
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold mb-2">Video Call</h1>
          <p className="text-gray-300">Room: {meetingId}</p>
          
          <div className="mt-4 flex justify-center gap-4">
            <span className={`px-3 py-1 rounded-full text-sm ${
              socketService.isConnected() ? 'bg-green-600' : 'bg-red-600'
            }`}>
              {socketService.isConnected() ? '🟢 Connected' : '🔴 Disconnected'}
            </span>
            
            <span className={`px-3 py-1 rounded-full text-sm ${
              callState === 'connected' ? 'bg-blue-600' : 
              callState === 'calling' ? 'bg-yellow-600' : 'bg-gray-600'
            }`}>
              {callState === 'connected' ? '📞 In Call' :
               callState === 'calling' ? '📱 Calling...' : '⏳ Waiting'}
            </span>
          </div>
        </div>

        {/* Video Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          {/* Local Video */}
          <div className="relative">
            <div className="bg-gray-800 rounded-lg overflow-hidden shadow-xl aspect-video">
              <video
                ref={localVideoRef}
                autoPlay
                muted
                playsInline
                className="w-full h-full object-cover"
              />
              <div className="absolute bottom-4 left-4 bg-black bg-opacity-75 px-3 py-1 rounded text-sm">
                You ({authUser?.fullName})
              </div>
            </div>
          </div>

          {/* Remote Video */}
          <div className="relative">
            <div className="bg-gray-800 rounded-lg overflow-hidden shadow-xl aspect-video">
              {remoteStream ? (
                <video
                  ref={remoteVideoRef}
                  autoPlay
                  playsInline
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-gray-400">
                  <div className="text-center">
                    <div className="text-6xl mb-4">👥</div>
                    <div className="text-xl">Waiting for others to join...</div>
                  </div>
                </div>
              )}
              {remoteStream && (
                <div className="absolute bottom-4 left-4 bg-black bg-opacity-75 px-3 py-1 rounded text-sm">
                  Remote User
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Controls */}
        <div className="flex justify-center gap-4">
          <button
            onClick={toggleVideo}
            className="px-6 py-3 bg-blue-600 hover:bg-blue-700 rounded-lg font-medium transition-colors"
          >
            📹 Video
          </button>
          
          <button
            onClick={toggleAudio}
            className="px-6 py-3 bg-green-600 hover:bg-green-700 rounded-lg font-medium transition-colors"
          >
            🎤 Audio
          </button>
          
          <button
            onClick={endCall}
            className="px-6 py-3 bg-red-600 hover:bg-red-700 rounded-lg font-medium transition-colors"
          >
            📞 End Call
          </button>
        </div>

        {/* Debug Info */}
        {process.env.NODE_ENV === 'development' && (
          <div className="mt-8 text-center text-sm text-gray-500 space-y-2">
            <div>Socket: {socketService.isConnected() ? 'Connected' : 'Disconnected'}</div>
            <div>Local Stream: {localStream ? 'Available' : 'None'}</div>
            <div>Remote Stream: {remoteStream ? 'Available' : 'None'}</div>
            <div>Call State: {callState}</div>
          </div>
        )}
      </div>
    </div>
  );
};

export default VideoCallNew;