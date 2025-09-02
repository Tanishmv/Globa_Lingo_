import { useEffect, useState, useRef } from "react";
import { useParams } from "react-router";
import useAuthUser from "../hooks/useAuthUser";
import socketService from "../lib/socket";
import toast from "react-hot-toast";
import CallButton from "../components/CallButton";

const ChatPageNew = () => {
  const { id: targetUserId } = useParams();
  const { authUser } = useAuthUser();
  
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState("");
  const [isConnected, setIsConnected] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [connectionError, setConnectionError] = useState(null);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  
  // Reply and reaction states
  const [replyingTo, setReplyingTo] = useState(null);
  const [showEmojiPicker, setShowEmojiPicker] = useState(null);
  const [selectedFile, setSelectedFile] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const [showMessageMenu, setShowMessageMenu] = useState(null);
  
  // Edit and delete states
  const [editingMessage, setEditingMessage] = useState(null);
  const [editText, setEditText] = useState('');
  
  // Translation states
  const [isTranslateMode, setIsTranslateMode] = useState(false);
  const [showLanguageSelector, setShowLanguageSelector] = useState(false);
  const [fromLanguage, setFromLanguage] = useState('en-US');
  const [toLanguage, setToLanguage] = useState('es-ES');
  const [translationData, setTranslationData] = useState(null);
  const [translationHistory, setTranslationHistory] = useState({});
  const [translationCache, setTranslationCache] = useState(new Map());
  const [targetUser, setTargetUser] = useState(null); // Store target user info
  
  const messagesEndRef = useRef(null);

  // Map language names to codes (same as VideoCall)
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

  // Language options
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

  // Auto-scroll to bottom
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Close message menu and emoji picker when clicking outside
  useEffect(() => {
    if (!showMessageMenu && !showEmojiPicker) return;

    const handleClickOutside = (event) => {
      const messageMenus = document.querySelectorAll('[data-message-menu]');
      const emojiPickers = document.querySelectorAll('[data-emoji-picker]');
      let clickedInside = false;
      
      messageMenus.forEach(menu => {
        if (menu.contains(event.target)) {
          clickedInside = true;
        }
      });
      
      emojiPickers.forEach(picker => {
        if (picker.contains(event.target)) {
          clickedInside = true;
        }
      });
      
      if (!clickedInside) {
        setShowMessageMenu(null);
        setShowEmojiPicker(null);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showMessageMenu, showEmojiPicker]);

  // Initialize socket connection
  useEffect(() => {
    if (!authUser) return;

    const initializeSocket = async () => {
      try {
        console.log("Initializing socket connection...");
        setConnectionError(null);
        
        await socketService.connect(authUser);
        setIsConnected(true);
        
        console.log("Socket connected successfully");
        toast.success("Connected to chat");

        // Set up event handlers
        setupSocketHandlers();
        
        // Load chat history
        loadChatHistory();

      } catch (error) {
        console.error("Socket connection failed:", error);
        setConnectionError(error.message);
        setIsConnected(false);
        toast.error("Failed to connect to chat");
      }
    };

    initializeSocket();

    // Cleanup on unmount
    return () => {
      socketService.disconnect();
      setIsConnected(false);
    };
  }, [authUser]);

  const setupSocketHandlers = () => {
    // Handle incoming messages
    socketService.on("chat:message", (data) => {
      console.log("Received message:", data);
      
      const messageObj = {
        id: data._id || Date.now() + Math.random(),
        text: data.message,
        senderId: data.senderId,
        senderName: data.senderName,
        senderPic: data.senderPic,
        timestamp: new Date(data.timestamp),
        type: "received",
        conversationId: data.conversationId,
        messageType: data.messageType || "text",
        replyTo: data.replyTo,
        reactions: data.reactions || [],
        fileUrl: data.fileUrl,
        fileName: data.fileName,
        fileSize: data.fileSize,
      };
      
      setMessages(prev => [...prev, messageObj]);
    });

    // Handle message sent confirmation
    socketService.on("chat:message:sent", (data) => {
      console.log("Message sent confirmation:", data);
      
      const messageObj = {
        id: data._id || Date.now() + Math.random(),
        text: data.message,
        senderId: authUser._id,
        timestamp: new Date(data.timestamp),
        type: "sent",
        conversationId: data.conversationId,
        messageType: data.messageType || "text",
        replyTo: data.replyTo,
        reactions: [],
        fileUrl: data.fileUrl,
        fileName: data.fileName,
        fileSize: data.fileSize,
      };
      
      setMessages(prev => [...prev, messageObj]);
    });

    // Handle connection status
    socketService.on("connect", () => {
      setIsConnected(true);
      setConnectionError(null);
      toast.success("Reconnected to chat");
    });

    socketService.on("disconnect", () => {
      setIsConnected(false);
      toast.error("Disconnected from chat");
    });

    // Handle errors
    socketService.on("error", (error) => {
      console.error("Socket error:", error);
      setConnectionError(error.message);
      toast.error(`Chat error: ${error.message}`);
    });

    // Handle chat history
    socketService.on("chat:history", (data) => {
      console.log("Received chat history:", data);
      setIsLoadingHistory(false);
      
      const historyMessages = data.messages.map(msg => ({
        id: msg._id,
        text: msg.message,
        senderId: msg.senderId,
        senderName: msg.senderName,
        senderPic: msg.senderPic,
        timestamp: new Date(msg.timestamp),
        type: msg.senderId === authUser._id ? "sent" : "received",
        conversationId: msg.conversationId,
        messageType: msg.messageType || "text",
        replyTo: msg.replyTo,
        reactions: msg.reactions || [],
        fileUrl: msg.fileUrl,
        fileName: msg.fileName,
        fileSize: msg.fileSize,
        isEdited: msg.isEdited || false,
        editedAt: msg.editedAt ? new Date(msg.editedAt) : null,
        isDeleted: msg.isDeleted || false,
        deletedAt: msg.deletedAt ? new Date(msg.deletedAt) : null,
      }));
      
      setMessages(historyMessages);
    });
    
    // Handle message reactions
    socketService.on("message:reaction", (data) => {
      console.log("Received reaction update:", data);
      setMessages(prev => prev.map(msg => 
        msg.id === data.messageId 
          ? { ...msg, reactions: data.reactions }
          : msg
      ));
    });
    
    // Handle message edit
    socketService.on("message:edited", (data) => {
      console.log("Received message edit:", data);
      setMessages(prev => prev.map(msg => 
        msg.id === data.messageId 
          ? { 
              ...msg, 
              text: data.newText, 
              isEdited: true,
              editedAt: new Date(data.editedAt)
            }
          : msg
      ));
    });
    
    // Handle message delete
    socketService.on("message:deleted", (data) => {
      console.log("Received message delete:", data);
      setMessages(prev => prev.map(msg => 
        msg.id === data.messageId 
          ? { 
              ...msg, 
              text: "This message was deleted", 
              isDeleted: true,
              deletedAt: new Date(data.deletedAt)
            }
          : msg
      ));
    });

    // Video call invitations are now handled as regular chat messages with clickable links
  };

  const setupAutoLanguages = async () => {
    if (!authUser || !targetUserId) return;

    try {
      // Set my target language from my profile
      if (authUser.nativeLanguage) {
        const myLanguage = mapLanguageToCode(authUser.nativeLanguage);
        setToLanguage(myLanguage);
        console.log(`🎯 My language: ${authUser.nativeLanguage} (${myLanguage})`);
      }

      // Fetch target user info to get their language
      const response = await fetch(`/api/users/${targetUserId}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (response.ok) {
        const targetUserData = await response.json();
        setTargetUser(targetUserData);
        
        if (targetUserData.nativeLanguage) {
          const theirLanguage = mapLanguageToCode(targetUserData.nativeLanguage);
          setFromLanguage(theirLanguage);
          console.log(`🎯 Their language: ${targetUserData.nativeLanguage} (${theirLanguage})`);
          console.log(`🌐 Auto-translation setup: ${theirLanguage} → ${toLanguage}`);
        }
      } else {
        console.log('Could not fetch target user info for auto-translation');
      }
    } catch (error) {
      console.error('Error setting up auto-translation:', error);
    }
  };

  const loadChatHistory = () => {
    if (socketService.isConnected() && authUser && targetUserId) {
      console.log("Loading chat history...");
      setIsLoadingHistory(true);
      
      socketService.emit("chat:get-history", {
        userId: authUser._id,
        targetUserId: targetUserId,
        limit: 50
      });
    }
  };

  const sendMessage = async (e) => {
    e.preventDefault();
    
    if ((!newMessage.trim() && !selectedFile) || !isConnected || !targetUserId) {
      return;
    }

    try {
      setIsUploading(true);
      
      let messageData = {
        targetUserId,
        message: newMessage.trim() || (selectedFile ? `Sent ${selectedFile.type.startsWith('image/') ? 'an image' : 'a file'}: ${selectedFile.name}` : ''),
        senderId: authUser._id
      };
      
      // Add reply reference if replying
      if (replyingTo) {
        messageData.replyTo = replyingTo.id;
      }
      
      // Handle file upload
      if (selectedFile) {
        messageData.messageType = selectedFile.type.startsWith('image/') ? 'image' : 'file';
        messageData.fileName = selectedFile.name;
        messageData.fileSize = selectedFile.size;
        
        // Convert file to base64 for sharing across clients
        const base64Data = await convertFileToBase64(selectedFile);
        messageData.fileUrl = base64Data;
      }

      const success = socketService.emit("chat:message", messageData);

      if (success !== false) {
        console.log("Message sent to server");
        setNewMessage("");
        setReplyingTo(null);
        setSelectedFile(null);
      } else {
        toast.error("Failed to send message - not connected");
      }
    } catch (error) {
      console.error("Error sending message:", error);
      toast.error("Failed to send message");
    } finally {
      setIsUploading(false);
    }
  };

  const handleVideoCall = async () => {
    if (!isConnected) {
      toast.error("Not connected to server");
      return;
    }

    try {
      // Create a unique meeting ID for this conversation
      const meetingId = [authUser._id, targetUserId].sort().join('-');
      
      console.log("🚀 Sending video call invitation:", { meetingId, targetUserId, callerName: authUser.fullName });
      
      // Send video call invitation as a regular message with clickable link
      const callUrl = `${window.location.origin}/call/${meetingId}`;
      const success = socketService.emit("chat:message", {
        targetUserId,
        message: `📹 ${authUser.fullName} is inviting you to a video call: ${callUrl}`,
        senderId: authUser._id
      });

      if (success !== false) {
        toast.success("Video call invitation sent!");
      } else {
        toast.error("Failed to send invitation - not connected");
      }
    } catch (error) {
      console.error("Error sending video call invitation:", error);
      toast.error("Failed to send video call invitation");
    }
  };



  // Translation functions
  const toggleTranslateMode = () => {
    const newMode = !isTranslateMode;
    setIsTranslateMode(newMode);
    if (newMode) {
      setShowLanguageSelector(true);
      // Open translation panel if there's any history
      if (Object.keys(translationHistory).length > 0) {
        // Get the most recent translation from any user
        const allTranslations = Object.entries(translationHistory)
          .flatMap(([userId, userHistory]) => userHistory)
          .sort((a, b) => (b.fullTimestamp || 0) - (a.fullTimestamp || 0));
        
        if (allTranslations.length > 0) {
          setTranslationData(allTranslations[0]);
        }
      }
    } else {
      setShowLanguageSelector(false);
      setTranslationData(null);
    }
  };

  const translateText = async (text) => {
    try {
      const response = await fetch(
        `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${fromLanguage}|${toLanguage}`
      );
      const data = await response.json();
      
      if (data.responseStatus === 200) {
        return data.responseData.translatedText;
      }
      throw new Error("Translation failed");
    } catch (error) {
      console.error("Translation error:", error);
      return text;
    }
  };

  const handleMessageClick = async (messageText, messageId) => {
    if (!isTranslateMode || !messageText) return;
    
    // Check cache first
    const cacheKey = `${messageText}-${fromLanguage}-${toLanguage}`;
    if (translationCache.has(cacheKey)) {
      const cachedTranslation = {
        id: messageId,
        originalText: messageText,
        translatedText: translationCache.get(cacheKey),
        fromLang: fromLanguage,
        toLang: toLanguage,
        timestamp: new Date().toLocaleTimeString(),
        fullTimestamp: new Date().getTime()
      };
      setTranslationData(cachedTranslation);
      return;
    }
    
    try {
      // Show loading state
      setTranslationData({
        id: messageId,
        originalText: messageText,
        translatedText: "Translating...",
        isLoading: true,
        fromLang: fromLanguage,
        toLang: toLanguage,
      });

      const translatedText = await translateText(messageText);
      
      // Cache the result
      const newCache = new Map(translationCache);
      newCache.set(cacheKey, translatedText);
      setTranslationCache(newCache);
      
      const newTranslation = {
        id: messageId,
        originalText: messageText,
        translatedText,
        fromLang: fromLanguage,
        toLang: toLanguage,
        timestamp: new Date().toLocaleTimeString(),
        fullTimestamp: new Date().getTime()
      };
      
      setTranslationData(newTranslation);
      
      // Add to user-specific history (keep last 20 per user)
      const messageUserId = messages.find(msg => msg.id === messageId)?.senderId || 'unknown';
      setTranslationHistory(prev => ({
        ...prev,
        [messageUserId]: [newTranslation, ...(prev[messageUserId] || []).slice(0, 19)]
      }));
      
    } catch (error) {
      console.error("Translation error:", error);
      setTranslationData({
        id: messageId,
        originalText: messageText,
        translatedText: "Translation failed",
        error: true,
        fromLang: fromLanguage,
        toLang: toLanguage,
      });
      toast.error("Translation failed");
    }
  };
  
  // Emoji reactions functionality
  const emojis = ['❤️', '😂', '😮', '😢', '😡', '👍', '👎', '🔥', '🎉', '😍'];
  
  const handleReaction = (messageId, emoji) => {
    if (!isConnected) {
      toast.error("Not connected to server");
      return;
    }
    
    socketService.emit("message:react", {
      messageId,
      emoji,
      userId: authUser._id
    });
    
    setShowEmojiPicker(null);
  };
  
  const handleReply = (message) => {
    setReplyingTo(message);
    setShowEmojiPicker(null);
  };
  
  const handleFileSelect = (event) => {
    const file = event.target.files[0];
    if (file) {
      // Check file size (limit to 10MB)
      if (file.size > 10 * 1024 * 1024) {
        toast.error("File size must be less than 10MB");
        return;
      }
      setSelectedFile(file);
    }
  };
  
  const convertFileToBase64 = (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result);
      reader.onerror = error => reject(error);
    });
  };
  
  const getReactionCount = (reactions, emoji) => {
    return reactions.filter(r => r.emoji === emoji).length;
  };
  
  const hasUserReacted = (reactions, emoji, userId) => {
    return reactions.some(r => r.emoji === emoji && r.userId === userId);
  };
  
  const getUniqueReactions = (reactions) => {
    const unique = {};
    reactions.forEach(r => {
      if (!unique[r.emoji]) {
        unique[r.emoji] = [];
      }
      unique[r.emoji].push(r);
    });
    return unique;
  };
  
  const findReplyMessage = (replyId) => {
    return messages.find(msg => msg.id === replyId);
  };
  
  // Edit message functions
  const handleEditMessage = (message) => {
    setEditingMessage(message);
    setEditText(message.text);
    setShowMessageMenu(null);
  };
  
  const saveEditMessage = () => {
    if (!editText.trim() || !editingMessage || !isConnected) return;
    
    const success = socketService.emit("message:edit", {
      messageId: editingMessage.id,
      newText: editText.trim(),
      userId: authUser._id
    });
    
    if (success) {
      setEditingMessage(null);
      setEditText('');
    } else {
      toast.error("Failed to edit message - not connected");
    }
  };
  
  const cancelEditMessage = () => {
    setEditingMessage(null);
    setEditText('');
  };
  
  // Delete message function
  const handleDeleteMessage = (message) => {
    if (window.confirm("Are you sure you want to delete this message?")) {
      const success = socketService.emit("message:delete", {
        messageId: message.id,
        userId: authUser._id
      });
      
      if (!success) {
        toast.error("Failed to delete message - not connected");
      }
    }
    setShowMessageMenu(null);
  };

  const formatTime = (timestamp) => {
    return new Date(timestamp).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  // Function to render text with clickable links
  const renderMessageWithLinks = (text) => {
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    const parts = text.split(urlRegex);
    
    return parts.map((part, index) => {
      if (part.match(urlRegex)) {
        return (
          <a
            key={index}
            href={part}
            target="_blank"
            rel="noopener noreferrer"
            className="underline text-blue-200 hover:text-blue-100"
            onClick={(e) => e.stopPropagation()}
          >
            {part.includes('/call/') ? ' Join Video Call' : part}
          </a>
        );
      }
      return part;
    });
  };

  // Connection status indicator
  const ConnectionStatus = () => (
    <div className={`fixed top-4 right-4 px-3 py-1 rounded-full text-sm font-medium z-50 ${
      isConnected 
        ? 'bg-green-500 text-white' 
        : connectionError 
          ? 'bg-red-500 text-white'
          : 'bg-yellow-500 text-black'
    }`}>
      {isConnected ? '🟢 Connected' : connectionError ? '🔴 Error' : '🟡 Connecting...'}
    </div>
  );

  if (!authUser) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <div className="loading loading-spinner loading-lg"></div>
          <p className="mt-4">Loading user data...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-[93vh]">
      <div className="w-full relative h-full flex">
        {/* Main Chat Area */}
        <div className={`${isTranslateMode && translationData ? 'w-3/4' : 'w-full'} transition-all duration-300 relative`}>
          {/* Video Call Button */}
          <CallButton handleVideoCall={handleVideoCall} />

          
          {/* Translation Button */}
          <div className="absolute top-6 right-20 z-10">
            <div className="relative translation-dropdown">
              <button
                onClick={toggleTranslateMode}
                className={`px-3 py-2 rounded-lg border transition-all duration-200 flex items-center gap-2 text-sm font-medium ${
                  isTranslateMode 
                    ? 'bg-blue-500 text-white border-blue-500 shadow-md' 
                    : 'bg-white text-gray-700 border-gray-200 hover:border-blue-300 hover:bg-blue-50'
                }`}
              >
                <span className="text-base">🌐</span>
                Translate
                {isTranslateMode && (
                  <span className="w-2 h-2 bg-green-400 rounded-full"></span>
                )}
              </button>

              {/* Language Selector Dropdown */}
              {showLanguageSelector && (
                <div className="absolute top-12 right-0 bg-white rounded-lg shadow-xl border border-gray-200 p-4 w-80 z-30">
                  <div className="space-y-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">From:</label>
                      <select
                        value={fromLanguage}
                        onChange={(e) => setFromLanguage(e.target.value)}
                        className="w-full text-sm border border-gray-300 rounded px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        {languages.map(lang => (
                          <option key={lang.code} value={lang.code}>{lang.flag} {lang.name}</option>
                        ))}
                      </select>
                    </div>
                    
                    <div className="flex justify-center">
                      <button
                        onClick={() => {
                          const temp = fromLanguage;
                          setFromLanguage(toLanguage);
                          setToLanguage(temp);
                        }}
                        className="p-2 hover:bg-gray-100 rounded-full transition-colors duration-200"
                        title="Swap languages"
                      >
                        <svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                        </svg>
                      </button>
                    </div>
                    
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">To:</label>
                      <select
                        value={toLanguage}
                        onChange={(e) => setToLanguage(e.target.value)}
                        className="w-full text-sm border border-gray-300 rounded px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        {languages.map(lang => (
                          <option key={lang.code} value={lang.code}>{lang.flag} {lang.name}</option>
                        ))}
                      </select>
                    </div>

                    {isTranslateMode && (
                      <div className="text-xs text-blue-600 bg-blue-50 rounded p-2 text-center">
                        Translation mode active - click any message to translate
                      </div>
                    )}
                    
                    <div className="text-center">
                      <button
                        onClick={() => setShowLanguageSelector(false)}
                        className="text-xs text-gray-500 hover:text-gray-700"
                      >
                        Close
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Chat Window */}
          <div className="flex flex-col h-full">
            <div className="bg-white border-b border-gray-200 p-4">
              <h1 className="text-xl font-semibold">Chat</h1>
              <p className="text-sm text-gray-500">
                {isConnected ? 'Connected' : 'Connecting...'}
              </p>
            </div>

            {/* Connection Error */}
            {connectionError && (
              <div className="bg-red-50 border-l-4 border-red-400 p-4 m-4">
                <div className="flex">
                  <div className="ml-3">
                    <p className="text-sm text-red-700">
                      Connection Error: {connectionError}
                    </p>
                    <button
                      onClick={() => window.location.reload()}
                      className="mt-2 text-sm bg-red-100 hover:bg-red-200 px-3 py-1 rounded"
                    >
                      Retry Connection
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {isLoadingHistory ? (
          <div className="flex items-center justify-center h-full text-gray-500">
            <div className="text-center">
              <div className="loading loading-spinner loading-lg mb-2"></div>
              <p className="text-sm">Loading chat history...</p>
            </div>
          </div>
        ) : messages.length === 0 ? (
          <div className="flex items-center justify-center h-full text-gray-500">
            <div className="text-center">
              <p className="text-lg">No messages yet</p>
              <p className="text-sm">Start a conversation!</p>
            </div>
          </div>
        ) : (
          messages.map((message) => {
            const replyMessage = message.replyTo ? findReplyMessage(message.replyTo) : null;
            const uniqueReactions = getUniqueReactions(message.reactions || []);
            
            return (
              <div
                key={message.id}
                className={`flex ${
                  message.senderId === authUser._id ? 'justify-end' : 'justify-start'
                } group relative`}
              >
                <div className="relative">
                  {/* Three dots menu (appear on hover) - positioned differently for sent vs received messages */}
                  <div className={`absolute -top-2 hidden group-hover:block z-10 ${
                    message.senderId === authUser._id ? '-left-8' : '-right-8'
                  }`}>
                    <button
                      onClick={() => setShowMessageMenu(message.id === showMessageMenu ? null : message.id)}
                      className="p-1 hover:bg-gray-200 rounded text-gray-500 text-sm"
                      title="Message options"
                    >
                      ⋯
                    </button>
                  </div>

                  {/* Message menu dropdown - positioned differently for sent vs received messages */}
                  {showMessageMenu === message.id && (
                    <div 
                      data-message-menu
                      className={`absolute -top-2 bg-white rounded-lg shadow-xl border border-gray-200 py-1 z-20 min-w-32 ${
                        message.senderId === authUser._id 
                          ? '-left-36' // Position to the left for sent messages
                          : '-right-36' // Position to the right for received messages  
                      }`}>
                      <button
                        onClick={() => {
                          handleReply(message);
                          setShowMessageMenu(null);
                        }}
                        className="w-full text-left px-3 py-2 hover:bg-gray-100 text-sm text-gray-700 flex items-center gap-2"
                      >
                        <span>↩️</span>
                        Reply
                      </button>
                      <button
                        onClick={() => {
                          setShowEmojiPicker(message.id === showEmojiPicker ? null : message.id);
                          setShowMessageMenu(null);
                        }}
                        className="w-full text-left px-3 py-2 hover:bg-gray-100 text-sm text-gray-700 flex items-center gap-2"
                      >
                        <span>😊</span>
                        React
                      </button>
                      
                      {/* Edit and Delete options - only for user's own messages */}
                      {message.senderId === authUser._id && !message.isDeleted && (
                        <>
                          <hr className="my-1 border-gray-200" />
                          <button
                            onClick={() => handleEditMessage(message)}
                            className="w-full text-left px-3 py-2 hover:bg-gray-100 text-sm text-gray-700 flex items-center gap-2"
                          >
                            <span>✏️</span>
                            Edit
                          </button>
                          <button
                            onClick={() => handleDeleteMessage(message)}
                            className="w-full text-left px-3 py-2 hover:bg-red-50 text-sm text-red-600 flex items-center gap-2"
                          >
                            <span>🗑️</span>
                            Delete
                          </button>
                        </>
                      )}
                    </div>
                  )}

                  {/* Emoji picker - positioned with proper spacing from screen edges */}
                  {showEmojiPicker === message.id && (
                    <div 
                      data-emoji-picker
                      className={`absolute -top-12 bg-white rounded-lg shadow-xl border border-gray-200 p-2 flex space-x-1 z-30 ${
                        message.senderId === authUser._id 
                          ? 'right-0 mr-4' // Position to the right with margin for sent messages
                          : 'left-0 ml-4' // Position to the left with margin for received messages
                      }`}>
                      {emojis.map(emoji => (
                        <button
                          key={emoji}
                          onClick={() => handleReaction(message.id, emoji)}
                          className="hover:bg-gray-100 p-1 rounded"
                        >
                          {emoji}
                        </button>
                      ))}
                    </div>
                  )}

                  <div
                    className={`max-w-xs lg:max-w-md px-4 py-2 rounded-lg ${
                      message.senderId === authUser._id
                        ? 'bg-blue-500 text-white'
                        : 'bg-white text-gray-800 border border-gray-200'
                    } ${isTranslateMode ? 'cursor-pointer hover:shadow-md transition-shadow' : ''}`}
                    onClick={() => isTranslateMode && handleMessageClick(message.text, message.id)}
                  >
                    {/* Reply indicator */}
                    {replyMessage && (
                      <div className={`mb-2 p-2 rounded border-l-2 ${
                        message.senderId === authUser._id 
                          ? 'bg-blue-400 border-blue-200' 
                          : 'bg-gray-50 border-gray-300'
                      }`}>
                        <p className={`text-xs ${message.senderId === authUser._id ? 'text-blue-100' : 'text-gray-500'}`}>
                          Replying to:
                        </p>
                        <p className={`text-xs truncate ${message.senderId === authUser._id ? 'text-blue-100' : 'text-gray-600'}`}>
                          {replyMessage.text}
                        </p>
                      </div>
                    )}

                    {/* File attachment */}
                    {message.messageType === 'image' && message.fileUrl && (
                      <div className="mb-2">
                        <img 
                          src={message.fileUrl} 
                          alt={message.fileName}
                          className="max-w-full h-auto rounded-lg"
                          style={{ maxHeight: '200px' }}
                        />
                      </div>
                    )}

                    {message.messageType === 'file' && message.fileUrl && (
                      <div className="mb-2 flex items-center space-x-2 p-2 bg-gray-100 rounded">
                        <div className="flex-shrink-0">
                          📄
                        </div>
                        <div className="flex-grow">
                          <p className="text-sm font-medium text-gray-800">{message.fileName}</p>
                          <p className="text-xs text-gray-500">
                            {message.fileSize ? `${(message.fileSize / 1024 / 1024).toFixed(2)} MB` : 'Unknown size'}
                          </p>
                        </div>
                        <a 
                          href={message.fileUrl} 
                          download={message.fileName}
                          className="flex-shrink-0 text-blue-500 hover:text-blue-700"
                        >
                          ⬇️
                        </a>
                      </div>
                    )}

                    {/* Message text - either normal, editing, or deleted */}
                    {editingMessage?.id === message.id ? (
                      // Edit mode
                      <div className="space-y-2" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="text"
                          value={editText}
                          onChange={(e) => setEditText(e.target.value)}
                          className="w-full px-3 py-2 text-sm text-gray-900 border-2 border-blue-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white shadow-sm"
                          style={{ 
                            color: '#1f2937',
                            backgroundColor: '#ffffff',
                            zIndex: 999 
                          }}
                          autoFocus
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              saveEditMessage();
                            }
                            if (e.key === 'Escape') {
                              e.preventDefault();
                              cancelEditMessage();
                            }
                          }}
                          onFocus={(e) => {
                            e.target.select(); // Select all text when focused
                          }}
                        />
                        <div className="flex gap-1">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              saveEditMessage();
                            }}
                            className="px-2 py-1 text-xs bg-blue-500 text-white rounded hover:bg-blue-600"
                          >
                            Save
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              cancelEditMessage();
                            }}
                            className="px-2 py-1 text-xs bg-gray-300 text-gray-700 rounded hover:bg-gray-400"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      // Normal message display or call invitation
                      <div>
                        {
                          // Regular message
                          <div>
                            <p className={`text-sm ${message.isDeleted ? 'italic text-gray-500' : ''}`}>
                              {message.isDeleted ? message.text : renderMessageWithLinks(message.text)}
                            </p>
                            {message.isEdited && !message.isDeleted && (
                              <p className="text-xs text-gray-400 mt-1">
                                (edited)
                              </p>
                            )}
                          </div>
                        }
                      </div>
                    )}

                    <div className="flex justify-between items-center mt-1">
                      <p className={`text-xs ${
                        message.senderId === authUser._id ? 'text-blue-100' : 'text-gray-500'
                      }`}>
                        {formatTime(message.timestamp)}
                        {isTranslateMode && <span className="ml-2">🌐</span>}
                      </p>
                    </div>
                  </div>

                  {/* Reactions */}
                  {Object.keys(uniqueReactions).length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {Object.entries(uniqueReactions).map(([emoji, reactions]) => (
                        <button
                          key={emoji}
                          onClick={() => handleReaction(message.id, emoji)}
                          className={`flex items-center space-x-1 px-2 py-1 rounded-full text-xs border ${
                            hasUserReacted(reactions, emoji, authUser._id)
                              ? 'bg-blue-100 border-blue-300 text-blue-700'
                              : 'bg-gray-100 border-gray-300 text-gray-600 hover:bg-gray-200'
                          }`}
                        >
                          <span>{emoji}</span>
                          <span>{reactions.length}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>


      {/* Message Input */}
      <div className="bg-white border-t border-gray-200 p-4">
        {/* Reply context */}
        {replyingTo && (
          <div className="mb-3 p-3 bg-gray-50 border border-gray-200 rounded-lg">
            <div className="flex justify-between items-start">
              <div className="flex-grow">
                <p className="text-xs text-gray-500 mb-1">Replying to:</p>
                <p className="text-sm text-gray-700 truncate">{replyingTo.text}</p>
              </div>
              <button
                onClick={() => setReplyingTo(null)}
                className="text-gray-400 hover:text-gray-600 ml-2"
              >
                ✕
              </button>
            </div>
          </div>
        )}

        {/* File preview */}
        {selectedFile && (
          <div className="mb-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className="flex-shrink-0">
                  {selectedFile.type.startsWith('image/') ? '🖼️' : '📄'}
                </div>
                <div>
                  <p className="text-sm font-medium text-blue-800">{selectedFile.name}</p>
                  <p className="text-xs text-blue-600">
                    {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
                  </p>
                </div>
              </div>
              <button
                onClick={() => setSelectedFile(null)}
                className="text-blue-400 hover:text-blue-600"
              >
                ✕
              </button>
            </div>
          </div>
        )}

        <form onSubmit={sendMessage} className="flex gap-2">
          {/* File upload button */}
          <label className="flex-shrink-0">
            <input
              type="file"
              onChange={handleFileSelect}
              accept="image/*,application/pdf,.doc,.docx,.txt"
              className="hidden"
              disabled={!isConnected}
            />
            <div
              className={`p-2 rounded-lg border transition-colors cursor-pointer ${
                isConnected
                  ? 'border-gray-300 hover:border-blue-300 hover:bg-blue-50 text-gray-600'
                  : 'border-gray-200 bg-gray-100 text-gray-400 cursor-not-allowed'
              }`}
              title="Attach file"
            >
              📎
            </div>
          </label>

          <input
            type="text"
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            placeholder={
              replyingTo 
                ? `Reply to ${replyingTo.senderName || 'message'}...`
                : isConnected 
                  ? "Type a message..." 
                  : "Connecting..."
            }
            disabled={!isConnected}
            className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
          />
          <button
            type="submit"
            disabled={!isConnected || (!newMessage.trim() && !selectedFile) || isUploading}
            className={`px-6 py-2 rounded-lg font-medium flex items-center gap-2 ${
              isConnected && (newMessage.trim() || selectedFile) && !isUploading
                ? 'bg-blue-500 text-white hover:bg-blue-600'
                : 'bg-gray-300 text-gray-500 cursor-not-allowed'
            }`}
          >
            {isUploading && (
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
            )}
            {isUploading ? 'Sending...' : 'Send'}
          </button>
        </form>
        
        {!isConnected && (
          <p className="text-xs text-gray-500 mt-2">
            Waiting for connection to send messages...
          </p>
        )}
            </div>
          </div>
        </div>

        {/* Translation Panel - Only show when translate mode is active */}
        {isTranslateMode && translationData && (
          <div className="w-1/4 bg-gray-50 border-l border-gray-200 flex flex-col">
            {/* Header */}
            <div className="bg-white border-b border-gray-200 p-4">
              <div className="flex justify-between items-center">
                <h3 className="font-medium text-gray-800 flex items-center gap-2">
                  <span className="text-blue-500">🌐</span>
                  Translation
                </h3>
                <button
                  onClick={() => setTranslationData(null)}
                  className="text-gray-400 hover:text-gray-600 transition-colors"
                >
                  ✕
                </button>
              </div>
              <p className="text-xs text-gray-500 mt-1">
                {languages.find(l => l.code === translationData.fromLang)?.flag} {languages.find(l => l.code === translationData.fromLang)?.name} → {languages.find(l => l.code === translationData.toLang)?.flag} {languages.find(l => l.code === translationData.toLang)?.name}
              </p>
            </div>

            {/* Translation Content */}
            <div className="flex-1 flex flex-col overflow-hidden">
              {/* Current Translation */}
              <div className="p-4 border-b border-gray-200">
                <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                  {/* Original */}
                  <div className="p-3 bg-gray-50 border-b border-gray-200">
                    <div className="text-xs text-gray-500 mb-1">Original:</div>
                    <p className="text-sm text-gray-800">{translationData.originalText}</p>
                  </div>

                  {/* Translation */}
                  <div className="p-3">
                    <div className="text-xs text-gray-500 mb-1">Translation:</div>
                    {translationData.isLoading ? (
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                        <span className="text-sm text-blue-600">Translating...</span>
                      </div>
                    ) : translationData.error ? (
                      <div className="p-2 bg-red-50 rounded text-sm text-red-600">
                        {translationData.error}
                      </div>
                    ) : (
                      <p className="text-sm text-gray-800 font-medium">{translationData.translatedText}</p>
                    )}
                  </div>
                </div>
              </div>
              
              {/* Translation History - Full Height */}
              <div className="flex-1 p-4 overflow-y-auto">
                <h4 className="text-sm font-medium text-gray-700 mb-3 flex items-center gap-2 sticky top-0 bg-gray-50 py-2 z-10 -mx-4 px-4">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Translation History
                </h4>
                
                {/* Combined history from all users */}
                <div className="space-y-3 pt-2">
                  {Object.entries(translationHistory)
                    .flatMap(([userId, userHistory]) => 
                      userHistory.map(item => ({
                        ...item,
                        userId,
                        userName: messages.find(msg => msg.senderId === userId)?.senderName || 'Unknown User'
                      }))
                    )
                    .sort((a, b) => {
                      // Sort by fullTimestamp (most recent first)
                      return (b.fullTimestamp || 0) - (a.fullTimestamp || 0);
                    })
                    .map((item, index) => (
                      <div 
                        key={`${item.userId}-${item.id}-${index}`} 
                        className="bg-white rounded-lg border border-gray-200 p-3 cursor-pointer hover:bg-gray-50 transition-colors shadow-sm"
                        onClick={() => setTranslationData(item)}
                      >
                        <div className="flex justify-between items-start mb-2">
                          <div className="text-xs text-blue-600 font-medium">{item.userName}</div>
                          <div className="text-xs text-gray-500">{item.timestamp}</div>
                        </div>
                        <div className="space-y-2">
                          <div>
                            <div className="text-xs text-gray-500 mb-1">Original:</div>
                            <div className="text-sm text-gray-800 font-medium">"{item.originalText.slice(0, 60)}..."</div>
                          </div>
                          <div>
                            <div className="text-xs text-gray-500 mb-1">Translation:</div>
                            <div className="text-sm text-blue-700 font-medium">"{item.translatedText.slice(0, 60)}..."</div>
                          </div>
                          <div className="text-xs text-gray-400 flex items-center gap-1">
                            {languages.find(l => l.code === item.fromLang)?.flag} {languages.find(l => l.code === item.fromLang)?.name} 
                            <span className="mx-1">→</span> 
                            {languages.find(l => l.code === item.toLang)?.flag} {languages.find(l => l.code === item.toLang)?.name}
                          </div>
                        </div>
                      </div>
                    ))}
                  
                  {Object.keys(translationHistory).length === 0 && (
                    <div className="text-center py-8 text-gray-500">
                      <svg className="w-12 h-12 mx-auto mb-2 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                      <p className="text-sm">No translations yet</p>
                      <p className="text-xs">Click on messages to translate them</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ChatPageNew;