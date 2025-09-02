import React, { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router';
import { io } from 'socket.io-client';
import Peer from 'simple-peer';
import toast from 'react-hot-toast';
import useAuthUser from '../hooks/useAuthUser';

const VideoCall = () => {
  const { meetingId } = useParams();
  const navigate = useNavigate();
  const { authUser } = useAuthUser();
  
  // Refs
  const socketRef = useRef();
  const myVideo = useRef();
  const userVideo = useRef();
  const connectionRef = useRef();
  
  // State
  const [stream, setStream] = useState();
  const [receivingCall, setReceivingCall] = useState(false);
  const [caller, setCaller] = useState("");
  const [callerSignal, setCallerSignal] = useState();
  const [callAccepted, setCallAccepted] = useState(false);
  const [callEnded, setCallEnded] = useState(false);
  const [name, setName] = useState(authUser?.fullName || "");
  const [remoteName, setRemoteName] = useState("Remote User");
  const [me, setMe] = useState("");
  
  // Media toggle states
  const [isVideoOn, setIsVideoOn] = useState(true);
  const [isAudioOn, setIsAudioOn] = useState(true);
  
  // Caption and translation states
  const [captionMode, setCaptionMode] = useState('off'); // 'off', 'self', 'remote'
  const [captionLanguage, setCaptionLanguage] = useState('en-US'); // Language for speech recognition
  const [targetLanguage, setTargetLanguage] = useState('en-US'); // Will be set after mapLanguageToCode is defined
  const [currentCaption, setCurrentCaption] = useState('');
  const [translatedCaption, setTranslatedCaption] = useState('');
  const [showTranslation, setShowTranslation] = useState(false);
  const [autoTranslate, setAutoTranslate] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [captionHistory, setCaptionHistory] = useState([]);
  const [showCaptionSettings, setShowCaptionSettings] = useState(false);
  const [remoteAudioContext, setRemoteAudioContext] = useState(null);
  const [isSelfSpeaking, setIsSelfSpeaking] = useState(false);
  const [isRemoteSpeaking, setIsRemoteSpeaking] = useState(false);
  const [shouldShowCallButton, setShouldShowCallButton] = useState(false);
  const [otherPersonSocketId, setOtherPersonSocketId] = useState(null);
  
  // Speech recognition ref
  const recognition = useRef(null);
  const autoTranslateRef = useRef(false);
  
  // Languages (matching chat implementation)
  const languages = [
    { code: 'en-US', name: 'English (US)', flag: '🇺🇸' },
    { code: 'en-GB', name: 'English (UK)', flag: '🇬🇧' },
    { code: 'es-ES', name: 'Spanish', flag: '🇪🇸' },
    { code: 'fr-FR', name: 'French', flag: '🇫🇷' },
    { code: 'de-DE', name: 'German', flag: '🇩🇪' },
    { code: 'it-IT', name: 'Italian', flag: '🇮🇹' },
    { code: 'pt-BR', name: 'Portuguese', flag: '🇧🇷' },
    { code: 'zh-CN', name: 'Chinese', flag: '🇨🇳' }
  ];

  // Map language names to codes
  const mapLanguageToCode = (language) => {
    const mapping = {
      'english': 'en-US',
      'spanish': 'es-ES', 
      'french': 'fr-FR',
      'german': 'de-DE',
      'italian': 'it-IT',
      'portuguese': 'pt-BR',
      'chinese': 'zh-CN'
    };
    return mapping[language?.toLowerCase()] || language || 'en-US';
  };

  // Set user's target language from their profile
  useEffect(() => {
    if (authUser?.nativeLanguage) {
      const mappedTargetLanguage = mapLanguageToCode(authUser.nativeLanguage);
      setTargetLanguage(mappedTargetLanguage);
      console.log(`🎯 My target language: ${authUser.nativeLanguage} (${mappedTargetLanguage})`);
    }
  }, [authUser]);

  useEffect(() => {
    const initializeMedia = async () => {
      try {
        console.log("🎥 Trying to get full media access...");
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        console.log("✅ Got full media access");
        setStream(stream);
        if (myVideo.current) {
          myVideo.current.srcObject = stream;
        }
      } catch (error) {
        console.warn("❌ Full media access failed:", error);
        
        // Try video only
        try {
          console.log("📹 Trying video only...");
          const videoStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
          console.log("✅ Got video-only access");
          setStream(videoStream);
          setIsAudioOn(false);
          if (myVideo.current) {
            myVideo.current.srcObject = videoStream;
          }
          toast.warning("Microphone unavailable - video only mode");
        } catch (videoError) {
          console.warn("❌ Video-only failed:", videoError);
          
          // Try audio only
          try {
            console.log("🎤 Trying audio only...");
            const audioStream = await navigator.mediaDevices.getUserMedia({ video: false, audio: true });
            console.log("✅ Got audio-only access");
            setStream(audioStream);
            setIsVideoOn(false);
            toast.warning("Camera unavailable - audio only mode");
          } catch (audioError) {
            console.warn("❌ Audio-only failed:", audioError);
            
            // Create a fake stream for testing
            console.log("🧪 Creating test stream...");
            try {
              const canvas = document.createElement('canvas');
              canvas.width = 640;
              canvas.height = 480;
              const ctx = canvas.getContext('2d');
              
              // Draw a test pattern
              const drawTestPattern = () => {
                ctx.fillStyle = '#1a202c';
                ctx.fillRect(0, 0, 640, 480);
                
                ctx.fillStyle = '#4a5568';
                ctx.fillRect(50, 50, 540, 380);
                
                ctx.fillStyle = '#e2e8f0';
                ctx.font = 'bold 24px Arial';
                ctx.textAlign = 'center';
                ctx.fillText('TEST MODE', 320, 200);
                ctx.font = '16px Arial';
                ctx.fillText('Camera/Mic in use by another tab', 320, 240);
                ctx.fillText(name || 'User', 320, 300);
                
                // Animated indicator
                const time = Date.now() / 1000;
                const radius = 10 + Math.sin(time * 2) * 5;
                ctx.beginPath();
                ctx.arc(320, 350, radius, 0, 2 * Math.PI);
                ctx.fillStyle = '#48bb78';
                ctx.fill();
              };
              
              drawTestPattern();
              setInterval(drawTestPattern, 100);
              
              const fakeStream = canvas.captureStream(30);
              setStream(fakeStream);
              setIsVideoOn(true);
              setIsAudioOn(false);
              
              if (myVideo.current) {
                myVideo.current.srcObject = fakeStream;
              }
              
              console.log("✅ Test stream created");
              toast("Using test mode - perfect for multi-tab testing!", {
                icon: '🧪',
                duration: 3000
              });
              
            } catch (fakeError) {
              console.error("❌ Even fake stream failed:", fakeError);
              toast.error("Could not initialize any media stream");
            }
          }
        }
      }
    };

    initializeMedia();

    const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || 
      (import.meta.env.PROD 
        ? "https://globalingo-e2yi.onrender.com" 
        : "http://localhost:5001");
    
    const socket = io(SOCKET_URL);
    socketRef.current = socket;

    socket.on("me", (id) => {
      setMe(id);
      console.log("My socket ID:", id);
      
      // Join the user context so backend can find us
      if (authUser) {
        console.log("🔗 Joining video call socket with user context:", authUser);
        socket.emit("user:join", authUser);
      }
    });

    socket.on("callUser", (data) => {
      console.log("Receiving call from:", data);
      setReceivingCall(true);
      setCaller(data.from);
      setCallerSignal(data.signal);
      setRemoteName(data.name || "Remote User");
      toast.success(`Incoming call from ${data.name || 'someone'}!`);
    });

    socket.on("callAccepted", (signal) => {
      console.log("Call was accepted");
      setCallAccepted(true);
      connectionRef.current.signal(signal);
      toast.success("Call connected!");
    });

    socket.on("callEnded", () => {
      console.log("Call ended by remote user");
      setCallEnded(true);
      setCallAccepted(false);
      setReceivingCall(false);
      if (connectionRef.current) {
        connectionRef.current.destroy();
      }
      toast.info("Call ended");
    });

    return () => {
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
      if (recognition.current) {
        recognition.current.stop();
      }
      socket.disconnect();
    };
  }, []);

  // Simple room-based approach: first person waits, second person calls
  useEffect(() => {
    if (!meetingId || !authUser || !me) return;
    
    console.log("🏠 Joining video call room:", meetingId, "as", authUser.fullName);
    console.log("👤 User profile debug:", {
      fullName: authUser.fullName,
      nativeLanguage: authUser.nativeLanguage,
      userObject: authUser
    });
    
    // Join the video call room
    socketRef.current.emit("joinVideoCallRoom", {
      meetingId: meetingId,
      socketId: me,
      userName: authUser.fullName,
      userId: authUser._id,
      nativeLanguage: authUser.nativeLanguage || 'en-US'
    });

    // Listen for room role assignment
    socketRef.current.on("roomRole", ({ role, otherSocketId, otherUserName, otherUserLanguage, message }) => {
      console.log("🎭 Room role:", role, message, "Other person:", otherUserName, "Language:", otherUserLanguage);
      
      if (role === "waiter") {
        setShouldShowCallButton(false);
        setRemoteName("Waiting for other participant...");
      } else if (role === "caller") {
        setShouldShowCallButton(true);
        setOtherPersonSocketId(otherSocketId);
        setRemoteName(otherUserName || "Other participant");
        
        // Set translation: from other person's language TO my language
        const mappedFromLanguage = mapLanguageToCode(otherUserLanguage);
        setCaptionLanguage(mappedFromLanguage);
        console.log(`🌐 Translation setup: ${otherUserLanguage} (${mappedFromLanguage}) → ${targetLanguage}`);
        
        // Auto-fill the input with a delay to ensure element exists
        setTimeout(() => {
          const input = document.getElementById('socketIdInput');
          if (input) {
            input.value = otherSocketId;
            console.log("✅ Auto-filled input with:", otherSocketId);
          } else {
            console.log("❌ Input element not found");
          }
        }, 100);
      }
    });

    // Listen for info about who will call you
    socketRef.current.on("expectingCallFrom", ({ socketId, userName, userLanguage }) => {
      console.log("⏳ Expecting call from:", userName, "Language:", userLanguage);
      setRemoteName(`Waiting for ${userName} to start the call...`);
      
      // Set translation: from other person's language TO my language  
      const mappedFromLanguage = mapLanguageToCode(userLanguage);
      setCaptionLanguage(mappedFromLanguage);
      console.log(`🌐 Translation setup: ${userLanguage} (${mappedFromLanguage}) → ${targetLanguage}`);
    });

    return () => {
      socketRef.current?.off("roomRole");
      socketRef.current?.off("expectingCallFrom");
    };
  }, [meetingId, authUser, me]);

  const callUser = (id) => {
    console.log("Calling user:", id);
    console.log("Local stream for call:", stream);
    console.log("Local stream tracks:", stream?.getTracks());
    
    const peer = new Peer({
      initiator: true,
      trickle: false,
      stream: stream,
    });
    
    peer.on("signal", (data) => {
      socketRef.current.emit("callUser", {
        userToCall: id,
        signalData: data,
        from: me,
        name: name
      });
    });
    
    peer.on("stream", (remoteStream) => {
      console.log("✅ Received remote stream:", remoteStream);
      console.log("Remote stream tracks:", remoteStream.getTracks());
      console.log("Video tracks:", remoteStream.getVideoTracks());
      console.log("Audio tracks:", remoteStream.getAudioTracks());
      
      if (userVideo.current) {
        console.log("Setting remote stream to userVideo element");
        userVideo.current.srcObject = remoteStream;
        
        // Force play the video
        userVideo.current.onloadedmetadata = () => {
          console.log("Remote video metadata loaded, attempting to play");
          userVideo.current.play().catch(e => console.error("Error playing remote video:", e));
        };
      } else {
        console.error("❌ userVideo.current is null!");
      }
    });
    
    socketRef.current.on("callAccepted", (signal) => {
      setCallAccepted(true);
      peer.signal(signal);
    });

    connectionRef.current = peer;
  };

  const answerCall = () => {
    console.log("Answering call");
    console.log("Local stream for answer:", stream);
    console.log("Local stream tracks (answer):", stream?.getTracks());
    setCallAccepted(true);
    
    const peer = new Peer({
      initiator: false,
      trickle: false,
      stream: stream,
    });
    
    peer.on("signal", (data) => {
      socketRef.current.emit("answerCall", { signal: data, to: caller });
    });
    
    peer.on("stream", (remoteStream) => {
      console.log("✅ Received remote stream in answer:", remoteStream);
      console.log("Remote stream tracks (answer):", remoteStream.getTracks());
      console.log("Video tracks (answer):", remoteStream.getVideoTracks());
      console.log("Audio tracks (answer):", remoteStream.getAudioTracks());
      
      if (userVideo.current) {
        console.log("Setting remote stream to userVideo element (answer)");
        userVideo.current.srcObject = remoteStream;
        
        // Force play the video
        userVideo.current.onloadedmetadata = () => {
          console.log("Remote video metadata loaded (answer), attempting to play");
          userVideo.current.play().catch(e => console.error("Error playing remote video (answer):", e));
        };
      } else {
        console.error("❌ userVideo.current is null in answer!");
      }
    });

    peer.signal(callerSignal);
    connectionRef.current = peer;
  };

  const leaveCall = () => {
    console.log("Leaving call");
    setCallEnded(true);
    setCallAccepted(false);
    setReceivingCall(false);
    
    if (connectionRef.current) {
      connectionRef.current.destroy();
    }
    
    socketRef.current.emit("callEnded");
    navigate('/');
  };

  const toggleVideo = () => {
    if (stream) {
      const videoTrack = stream.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        setIsVideoOn(videoTrack.enabled);
        toast.success(videoTrack.enabled ? 'Video enabled' : 'Video disabled');
      } else {
        // No video track available
        toast.error('No video track available');
      }
    } else {
      toast.error('No stream available');
    }
  };

  const toggleAudio = () => {
    if (stream) {
      const audioTrack = stream.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setIsAudioOn(audioTrack.enabled);
        toast.success(audioTrack.enabled ? 'Audio enabled' : 'Audio disabled');
      } else {
        // No audio track available
        toast.error('No audio track available - microphone may be in use');
      }
    } else {
      toast.error('No stream available');
    }
  };

  // Translation functions

  const initializeSpeechRecognition = () => {
    // Check for browser compatibility
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    
    if (!SpeechRecognition) {
      toast.error('Speech recognition not supported in this browser');
      return false;
    }
    
    if (recognition.current) {
      return true; // Already initialized
    }
    
    recognition.current = new SpeechRecognition();
    recognition.current.continuous = true;
    recognition.current.interimResults = true;
    recognition.current.lang = captionLanguage;

    recognition.current.onstart = () => {
        setIsListening(true);
        console.log('🎤 Speech recognition started for:', captionLanguage);
        toast.success('🎤 Listening for speech...');
      };

      recognition.current.onresult = (event) => {
        let interimTranscript = '';
        let finalTranscript = '';

        // Process only new results starting from resultIndex
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const transcript = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            finalTranscript += transcript;
          } else {
            interimTranscript += transcript;
          }
        }

        // Show current transcript (prioritize final, fallback to interim)
        const currentText = finalTranscript || interimTranscript;
        
        
        if (currentText.trim()) {
          setCurrentCaption(currentText);
          
          // Set speaking indicator
          if (captionMode === 'self') {
            setIsSelfSpeaking(true);
            setIsRemoteSpeaking(false);
          } else if (captionMode === 'remote') {
            setIsRemoteSpeaking(true);
            setIsSelfSpeaking(false);
          }
          
          // Handle auto-translate - use same logic as manual translation
          console.log('🟡 Final result check:', {finalTranscript: finalTranscript.trim(), autoTranslate: autoTranslateRef.current});
          if (finalTranscript.trim() && autoTranslateRef.current) {
            console.log('🟢 AUTO-TRANSLATING NOW!');
            translateText(finalTranscript.trim());
          }
          
          // Clear caption after final result
          if (finalTranscript.trim()) {
            
            setTimeout(() => {
              setCurrentCaption('');
              setIsSelfSpeaking(false);
              setIsRemoteSpeaking(false);
              if (!autoTranslate) {
                setShowTranslation(false);
                setTranslatedCaption('');
              }
            }, 4000);
          }
        }
      };

      recognition.current.onerror = (event) => {
        console.error('Speech recognition error:', event.error);
        setIsListening(false);
        
        if (event.error === 'not-allowed') {
          toast.error('Microphone access denied for captions');
        } else if (event.error === 'network') {
          toast.error('Network error - check internet connection');
        } else if (event.error === 'no-speech') {
          console.log('No speech detected - this is normal, will retry');
          // Don't show error toast for no-speech, it's normal
        } else if (event.error === 'audio-capture') {
          toast.error('Microphone not available - may be in use by another app');
        } else {
          toast.error(`Speech recognition error: ${event.error}`);
        }
      };

      recognition.current.onend = () => {
        setIsListening(false);
        console.log('🎤 Speech recognition ended');
        
        // Restart if captions are still on (continuous listening)
        if (captionMode !== 'off' && recognition.current) {
          setTimeout(() => {
            try {
              recognition.current.start();
              setIsListening(true);
            } catch (error) {
              console.error('Failed to restart recognition:', error);
            }
          }, 100);
        }
      };
      
    return true;
  };

  const setCaptionModeHandler = async (mode) => {
    // Stop current captions first
    if (captionMode !== 'off') {
      if (recognition.current) {
        recognition.current.stop();
      }
      setIsListening(false);
      setCurrentCaption('');
      setIsSelfSpeaking(false);
      setIsRemoteSpeaking(false);
      setShowTranslation(false);
      setTranslatedCaption('');
    }
    
    setCaptionMode(mode);
    console.log('📝 Caption mode changed to:', mode);
    
    // Test caption display and speaking effect
    if (mode !== 'off') {
      setCurrentCaption('Testing captions...');
      
      // Test speaking indicator
      if (mode === 'self') {
        setIsSelfSpeaking(true);
        setTimeout(() => setIsSelfSpeaking(false), 3000);
      } else if (mode === 'remote') {
        setIsRemoteSpeaking(true);
        setTimeout(() => setIsRemoteSpeaking(false), 3000);
      }
      
      setTimeout(() => setCurrentCaption(''), 2000);
    }
    
    if (mode === 'off') {
      setCaptionHistory([]);
      toast.success('Captions stopped');
      return;
    }
    
    if (mode === 'self') {
      // Initialize speech recognition for self captions
      const initialized = initializeSpeechRecognition();
      if (!initialized) {
        setCaptionMode('off');
        return;
      }
      
      if (recognition.current) {
        recognition.current.lang = captionLanguage;
        try {
          recognition.current.start();
          toast.success(`Self captions started in ${languages.find(l => l.code === captionLanguage)?.name}`);
        } catch (error) {
          console.error('Failed to start recognition:', error);
          toast.error('Failed to start self captions');
          setCaptionMode('off');
        }
      }
    } else if (mode === 'remote') {
      // For remote captions, we need the call to be active
      if (!callAccepted || !userVideo.current || !userVideo.current.srcObject) {
        toast.error('Remote audio not available - call must be active');
        setCaptionMode('off');
        return;
      }
      
      // Start remote captions (same as self but will pick up remote audio)
      const initialized = initializeSpeechRecognition();
      if (!initialized) {
        setCaptionMode('off');
        return;
      }
      
      if (recognition.current) {
        recognition.current.lang = captionLanguage;
        try {
          recognition.current.start();
          toast.success(`Remote captions started - will caption audio from speakers`);
          toast('💡 Make sure remote audio plays through speakers for best results', { duration: 4000 });
        } catch (error) {
          console.error('Failed to start remote captions:', error);
          toast.error('Failed to start remote captions');
          setCaptionMode('off');
        }
      }
    }
  };

  const translateText = async (text) => {
    try {
      const sourceLanguage = captionLanguage.split('-')[0]; // Convert 'en-US' to 'en'
      const targetLang = targetLanguage.split('-')[0]; // Convert 'es-ES' to 'es'
      
      const response = await fetch(
        `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${sourceLanguage}|${targetLang}`
      );
      const data = await response.json();
      
      if (data.responseStatus === 200) {
        const translatedText = data.responseData.translatedText;
        setTranslatedCaption(translatedText);
        setShowTranslation(true);
        console.log('🌍 Auto-translation:', translatedText);
      } else {
        console.error('Translation API error:', data);
      }
    } catch (error) {
      console.error('Auto-translation error:', error);
      // Don't show toast for auto-translation errors to avoid spam
    }
  };


  const translateCurrentCaption = async () => {
    if (!currentCaption.trim()) {
      toast.error('No caption to translate');
      return;
    }

    try {
      console.log(`Translating "${currentCaption}" from ${captionLanguage} to ${targetLanguage}`);
      
      const sourceLanguage = captionLanguage.split('-')[0]; // Convert 'en-US' to 'en'
      const targetLang = targetLanguage.split('-')[0]; // Convert 'es-ES' to 'es'
      
      const response = await fetch(
        `https://api.mymemory.translated.net/get?q=${encodeURIComponent(currentCaption)}&langpair=${sourceLanguage}|${targetLang}`
      );
      const data = await response.json();
      
      if (data.responseStatus === 200) {
        const translatedText = data.responseData.translatedText;
        setTranslatedCaption(translatedText);
        setShowTranslation(true);
        toast.success('Caption translated!');
        console.log('✅ Translation successful:', translatedText);
      } else {
        throw new Error("Translation API returned error");
      }
    } catch (error) {
      console.error('Translation error:', error);
      toast.error('Translation failed');
    }
  };

  const translateCaption = async (caption) => {
    try {
      console.log(`Translating "${caption.text}" from ${caption.language} to ${targetLanguage}`);
      
      const response = await fetch(
        `https://api.mymemory.translated.net/get?q=${encodeURIComponent(caption.text)}&langpair=${caption.language}|${targetLanguage}`
      );
      const data = await response.json();
      
      if (data.responseStatus === 200) {
        const translatedText = data.responseData.translatedText;
        
        // Update the caption in history
        setCaptionHistory(prev => 
          prev.map(c => 
            c.id === caption.id 
              ? { ...c, translatedText, translated: true }
              : c
          )
        );
        
        toast.success('Caption translated!');
        console.log('✅ Translation successful:', translatedText);
      } else {
        throw new Error("Translation API returned error");
      }
    } catch (error) {
      console.error('Translation error:', error);
      toast.error('Translation failed');
    }
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <div className="container mx-auto px-4 py-8">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold mb-2">Video Call</h1>
          <p className="text-gray-300">Room: {meetingId}</p>
          <p className="text-sm text-gray-400">My ID: {me}</p>
          
          {/* Caption Settings */}
          <div className="mt-4 flex justify-center gap-4">
            <button
              onClick={() => setShowCaptionSettings(!showCaptionSettings)}
              className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg text-sm transition-colors"
            >
              ⚙️ Caption Settings
            </button>
            
            {captionMode !== 'off' && (
              <div className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm ${
                isListening 
                  ? 'bg-green-800' 
                  : 'bg-gray-700'
              }`}>
                <div className={`w-2 h-2 rounded-full ${
                  isListening ? 'bg-green-400 animate-pulse' : 'bg-gray-400'
                }`}></div>
                <span>
                  {captionMode === 'self' ? '🎤 Self' : '👥 Remote'} captions 
                  {isListening ? ` - ${languages.find(l => l.code === captionLanguage)?.name}` : ' ready'}
                </span>
              </div>
            )}
          </div>
          
          {showCaptionSettings && (
            <div className="mt-4 bg-gray-800 rounded-lg p-4 max-w-3xl mx-auto">
              {/* Caption Mode Selection */}
              <div className="mb-6">
                <label className="block text-sm text-gray-300 mb-3">Caption Mode:</label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    onClick={() => setCaptionModeHandler('off')}
                    className={`px-4 py-3 rounded-lg text-sm font-medium transition-colors ${
                      captionMode === 'off' 
                        ? 'bg-red-600 text-white' 
                        : 'bg-gray-700 hover:bg-gray-600 text-gray-300'
                    }`}
                  >
                    🚫 Off
                  </button>
                  <button
                    onClick={() => setCaptionModeHandler('self')}
                    className={`px-4 py-3 rounded-lg text-sm font-medium transition-colors ${
                      captionMode === 'self' 
                        ? 'bg-blue-600 text-white' 
                        : 'bg-gray-700 hover:bg-gray-600 text-gray-300'
                    }`}
                    title="Caption what YOU are saying (requires microphone)"
                  >
                    🎤 My Voice
                  </button>
                  <button
                    onClick={() => setCaptionModeHandler('remote')}
                    className={`px-4 py-3 rounded-lg text-sm font-medium transition-colors ${
                      captionMode === 'remote' 
                        ? 'bg-green-600 text-white' 
                        : 'bg-gray-700 hover:bg-gray-600 text-gray-300'
                    }`}
                    title="Caption what the OTHER person is saying (requires active call)"
                  >
                    👥 Remote Voice
                  </button>
                </div>
                <div className="mt-2 text-xs text-gray-400">
                  {captionMode === 'off' && '• No captions will be shown'}
                  {captionMode === 'self' && '• Shows captions for what YOU say (needs your microphone)'}
                  {captionMode === 'remote' && '• Shows captions for what the OTHER person says (needs active call)'}
                </div>
              </div>
              
              {captionMode !== 'off' && (
                <>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm text-gray-300 mb-2">
                        Speech Language:
                      </label>
                      <select
                        value={captionLanguage}
                        onChange={(e) => {
                          setCaptionLanguage(e.target.value);
                          // Restart captions with new language if active
                          if (captionMode !== 'off' && recognition.current && isListening) {
                            recognition.current.lang = e.target.value;
                            recognition.current.stop();
                            setTimeout(() => {
                              if (recognition.current) {
                                recognition.current.start();
                              }
                            }, 100);
                          }
                        }}
                        className="w-full bg-gray-700 text-white px-3 py-2 rounded text-sm"
                      >
                        {languages.map(lang => (
                          <option key={lang.code} value={lang.code}>
                            {lang.flag} {lang.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    
                    <div>
                      <label className="block text-sm text-gray-300 mb-2">
                        Translate To:
                      </label>
                      <select
                        value={targetLanguage}
                        onChange={(e) => setTargetLanguage(e.target.value)}
                        className="w-full bg-gray-700 text-white px-3 py-2 rounded text-sm"
                      >
                        {languages.map(lang => (
                          <option key={lang.code} value={lang.code}>
                            {lang.flag} {lang.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                  
                  {/* Auto-translate toggle */}
                  <div className="mt-4 flex items-center justify-between">
                    <label className="flex items-center gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={autoTranslate}
                        onChange={(e) => {
                          console.log('CHECKBOX CLICKED:', e.target.checked);
                          setAutoTranslate(e.target.checked);
                          autoTranslateRef.current = e.target.checked;
                          console.log('SET autoTranslate to:', e.target.checked);
                        }}
                        className="w-4 h-4 text-blue-600 bg-gray-700 border-gray-600 rounded focus:ring-blue-500"
                      />
                      <span className="text-sm text-gray-300">🌍 Auto-translate captions</span>
                    </label>
                    <div className="text-xs text-gray-500">
                      {autoTranslate ? 'Real-time translation enabled' : 'Click 🌍 button to translate manually'}
                    </div>
                  </div>
                </>
              )}
              
              <div className="mt-4 text-xs text-gray-400 text-center">
                💡 {autoTranslate 
                  ? 'Auto-translation enabled - captions will be translated in real-time' 
                  : 'Enable auto-translate above, or click 🌍 button on captions to translate manually'
                }
              </div>
            </div>
          )}
        </div>

        {/* Video Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          {/* My Video */}
          <div className="relative">
            <div className={`bg-gray-800 rounded-lg overflow-hidden shadow-xl aspect-video transition-all duration-300 ${
              isSelfSpeaking 
                ? 'border-4 border-blue-400 shadow-[0_0_20px_rgba(59,130,246,0.8)] scale-[1.02]' 
                : 'border-2 border-transparent'
            }`}>
              {stream && isVideoOn ? (
                <video
                  ref={myVideo}
                  autoPlay
                  muted
                  playsInline
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <div className="text-center text-gray-400">
                    <div className="text-6xl mb-2">👤</div>
                    <div className="text-sm">
                      {stream ? 'Video Off' : 'No Camera'}
                    </div>
                  </div>
                </div>
              )}
              <div className={`absolute bottom-4 left-4 px-3 py-1 rounded text-sm transition-colors ${
                isSelfSpeaking 
                  ? 'bg-blue-500 bg-opacity-90 text-white' 
                  : 'bg-black bg-opacity-75'
              }`}>
                {isSelfSpeaking && '🎤 '} You ({name})
              </div>
              
              {/* Media status indicators */}
              <div className="absolute top-4 right-4 flex gap-2">
                {!isAudioOn && (
                  <div className="bg-red-500 text-white p-2 rounded-full text-sm">
                    🔇
                  </div>
                )}
                {!isVideoOn && (
                  <div className="bg-red-500 text-white p-2 rounded-full text-sm">
                    📷
                  </div>
                )}
                {captionMode === 'self' && (
                  <div className="bg-blue-500 text-white p-2 rounded-full text-sm">
                    🎤
                  </div>
                )}
              </div>
              
              {/* Live Captions Display - Self */}
              {captionMode === 'self' && (
                <div className="absolute bottom-16 left-4 right-4">
                  {/* Current Caption (real-time) */}
                  {currentCaption && (
                    <div className="bg-black bg-opacity-90 rounded-lg p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1">
                          <div className="text-sm text-white">
                            <span className="text-xs text-blue-400">Speaking:</span> {currentCaption}
                          </div>
                          {showTranslation && translatedCaption && (
                            <div className="text-sm text-green-300 mt-1">
                              → {translatedCaption}
                            </div>
                          )}
                        </div>
                        {!autoTranslate && (
                          <button
                            onClick={() => translateCurrentCaption()}
                            className="text-xs px-2 py-1 rounded bg-blue-600 hover:bg-blue-700 text-white cursor-pointer transition-colors"
                          >
                            🌍
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Remote Video */}
          <div className="relative">
            <div className={`bg-gray-800 rounded-lg overflow-hidden shadow-xl aspect-video transition-all duration-300 ${
              isRemoteSpeaking 
                ? 'border-4 border-green-400 shadow-[0_0_20px_rgba(34,197,94,0.8)] scale-[1.02]' 
                : 'border-2 border-transparent'
            }`}>
              {callAccepted && !callEnded ? (
                <video
                  ref={userVideo}
                  autoPlay
                  playsInline
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-gray-400">
                  <div className="text-center">
                    {receivingCall && !callAccepted ? (
                      <>
                        <div className="text-6xl mb-4">📞</div>
                        <div className="text-xl mb-4">Incoming call...</div>
                        <button
                          onClick={answerCall}
                          className="px-6 py-3 bg-green-600 hover:bg-green-700 rounded-lg font-medium"
                        >
                          Answer Call
                        </button>
                      </>
                    ) : (
                      <div className="text-center">
                        <div className="text-6xl mb-4">📹</div>
                        <div className="text-xl mb-4">
                          {shouldShowCallButton ? "Ready to start call" : "Waiting for call"}
                        </div>
                        <div className="text-sm mb-6 text-gray-400">
                          Meeting ID: {meetingId}
                        </div>
                        <div className="text-xs text-gray-500 mb-4">
                          My Socket ID: <strong>{me || 'Connecting...'}</strong><br/>
                          {remoteName && <span>Other participant: <strong>{remoteName}</strong></span>}
                        </div>
                        
                        {shouldShowCallButton ? (
                          <>
                            <input
                              id="socketIdInput"
                              type="text"
                              value={otherPersonSocketId || ""}
                              placeholder="Other person's socket ID will appear here..."
                              className="px-4 py-2 bg-gray-700 text-white rounded mb-4 w-80 invisible"
                              onChange={(e) => setOtherPersonSocketId(e.target.value)}
                              onKeyPress={(e) => {
                                if (e.key === 'Enter') {
                                  callUser(e.target.value);
                                }
                              }}
                            />
                            <div>
                              <button
                                onClick={() => {
                                  if (otherPersonSocketId) callUser(otherPersonSocketId);
                                }}
                                className="px-6 py-3 bg-blue-600 hover:bg-blue-700 rounded-lg font-medium"
                                disabled={!otherPersonSocketId}
                              >
                                📹 Start Call
                              </button>
                            </div>
                          </>
                        ) : (
                          <div className="text-sm text-gray-400">
                            {remoteName ? `Waiting for ${remoteName} to start the call...` : 'Waiting for other participant...'}
                            <div className="flex items-center justify-center space-x-2 mt-4">
                              <div className="w-3 h-3 bg-blue-500 rounded-full animate-bounce"></div>
                              <div className="w-3 h-3 bg-blue-500 rounded-full animate-bounce" style={{animationDelay: '0.1s'}}></div>
                              <div className="w-3 h-3 bg-blue-500 rounded-full animate-bounce" style={{animationDelay: '0.2s'}}></div>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}
              
              {/* Remote Caption Indicator */}
              {captionMode === 'remote' && callAccepted && (
                <div className="absolute top-4 right-4 bg-green-500 text-white p-2 rounded-full text-sm">
                  👥
                </div>
              )}
              
              {/* Live Captions Display - Remote */}
              {captionMode === 'remote' && callAccepted && (
                <div className="absolute bottom-16 left-4 right-4">
                  {/* Current Caption (real-time) */}
                  {currentCaption && (
                    <div className="bg-black bg-opacity-90 rounded-lg p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1">
                          <div className="text-sm text-white">
                            <span className="text-xs text-green-400">Remote speaking:</span> {currentCaption}
                          </div>
                          {showTranslation && translatedCaption && (
                            <div className="text-sm text-green-300 mt-1">
                              → {translatedCaption}
                            </div>
                          )}
                        </div>
                        {!autoTranslate && (
                          <button
                            onClick={() => translateCurrentCaption()}
                            className="text-xs px-2 py-1 rounded bg-blue-600 hover:bg-blue-700 text-white cursor-pointer transition-colors"
                          >
                            🌍
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}
              
              <div className={`absolute bottom-4 left-4 px-3 py-1 rounded text-sm transition-colors ${
                isRemoteSpeaking 
                  ? 'bg-green-500 bg-opacity-90 text-white' 
                  : 'bg-black bg-opacity-75'
              }`}>
                {isRemoteSpeaking && '🎤 '} {remoteName}
              </div>
            </div>
          </div>
        </div>

        {/* Controls */}
        <div className="flex justify-center gap-4">
          {/* Media Controls - Always show, but disabled if no tracks */}
          <button
            onClick={toggleVideo}
            disabled={!stream?.getVideoTracks()?.length}
            className={`px-6 py-3 rounded-lg font-medium transition-colors ${
              !stream?.getVideoTracks()?.length 
                ? 'bg-gray-500 cursor-not-allowed opacity-50' 
                : isVideoOn 
                  ? 'bg-blue-600 hover:bg-blue-700 text-white' 
                  : 'bg-red-600 hover:bg-red-700 text-white'
            }`}
            title={
              !stream?.getVideoTracks()?.length 
                ? 'Video not available' 
                : isVideoOn ? 'Turn off video' : 'Turn on video'
            }
          >
            {isVideoOn ? '📹' : '📷'} Video
          </button>
          
          <button
            onClick={toggleAudio}
            disabled={!stream?.getAudioTracks()?.length}
            className={`px-6 py-3 rounded-lg font-medium transition-colors ${
              !stream?.getAudioTracks()?.length 
                ? 'bg-gray-500 cursor-not-allowed opacity-50' 
                : isAudioOn 
                  ? 'bg-green-600 hover:bg-green-700 text-white' 
                  : 'bg-red-600 hover:bg-red-700 text-white'
            }`}
            title={
              !stream?.getAudioTracks()?.length 
                ? 'Audio not available' 
                : isAudioOn ? 'Mute audio' : 'Unmute audio'
            }
          >
            {isAudioOn ? '🎤' : '🔇'} Audio
          </button>
          
          {/* Call Controls */}
          {callAccepted && !callEnded && (
            <button
              onClick={leaveCall}
              className="px-6 py-3 bg-red-600 hover:bg-red-700 rounded-lg font-medium transition-colors"
            >
              📞 End Call
            </button>
          )}
          
          <button
            onClick={() => navigate('/')}
            className="px-6 py-3 bg-gray-600 hover:bg-gray-700 rounded-lg font-medium transition-colors"
          >
            🏠 Go Home
          </button>
        </div>

        {/* Debug Info */}
        <div className="mt-8 text-center text-sm text-gray-500 space-y-2">
          <div>My Socket ID: {me}</div>
          <div>Stream: {stream ? 'Available' : 'None'}</div>
          <div>
            Video Tracks: {stream?.getVideoTracks()?.length || 0} | 
            Audio Tracks: {stream?.getAudioTracks()?.length || 0}
          </div>
          <div>Video: {isVideoOn ? 'On' : 'Off'} | Audio: {isAudioOn ? 'On' : 'Off'}</div>
          <div>
            Captions: {captionMode} | 
            Listening: {isListening ? 'Yes' : 'No'} | 
            History: {captionHistory.length}
          </div>
          <div>
            Caption Language: {languages.find(l => l.code === captionLanguage)?.flag} {languages.find(l => l.code === captionLanguage)?.name} → Translate to: {languages.find(l => l.code === targetLanguage)?.flag} {languages.find(l => l.code === targetLanguage)?.name}
          </div>
          <div>Call Status: {callAccepted ? 'Connected' : receivingCall ? 'Receiving' : 'Ready'}</div>
          <div>Call Ended: {callEnded ? 'Yes' : 'No'}</div>
        </div>
      </div>
    </div>
  );
};

export default VideoCall;