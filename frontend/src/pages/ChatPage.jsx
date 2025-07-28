import { useEffect, useState } from "react";
import { useParams } from "react-router";
import useAuthUser from "../hooks/useAuthUser";
import { useQuery } from "@tanstack/react-query";
import { getStreamToken } from "../lib/api";

import {
  Channel,
  ChannelHeader,
  Chat,
  MessageInput,
  MessageList,
  Thread,
  Window,
} from "stream-chat-react";
import { StreamChat } from "stream-chat";
import toast from "react-hot-toast";

import ChatLoader from "../components/ChatLoader";
import CallButton from "../components/CallButton";

const STREAM_API_KEY = import.meta.env.VITE_STREAM_API_KEY;

const ChatPage = () => {
  const { id: targetUserId } = useParams();

  const [chatClient, setChatClient] = useState(null);
  const [channel, setChannel] = useState(null);
  const [loading, setLoading] = useState(true);
  const [fromLanguage, setFromLanguage] = useState('en-US');
  const [toLanguage, setToLanguage] = useState('es-SV');
  const [isTranslateMode, setIsTranslateMode] = useState(false);
  const [showLanguageSelector, setShowLanguageSelector] = useState(false);
  const [translationData, setTranslationData] = useState(null);
  const [translatingMessageIds, setTranslatingMessageIds] = useState(new Set());
  const [translationCache, setTranslationCache] = useState(new Map());
  const [translationHistory, setTranslationHistory] = useState([]);

  const { authUser } = useAuthUser();

  const { data: tokenData } = useQuery({
    queryKey: ["streamToken"],
    queryFn: getStreamToken,
    enabled: !!authUser,
  });

  // Language mapping and definitions
  const languageMap = {
    'english': 'en-US',
    'spanish': 'es-ES', 
    'french': 'fr-FR',
    'german': 'de-DE',
    'italian': 'it-IT',
    'portuguese': 'pt-PT',
    'russian': 'ru-RU',
    'japanese': 'ja-JP',
    'korean': 'ko-KR',
    'chinese': 'zh-CN',
    'arabic': 'ar-SA',
    'hindi': 'hi-IN',
    'dutch': 'nl-NL',
    'swedish': 'sv-SE',
    'norwegian': 'no-NO',
    'danish': 'da-DK',
    'polish': 'pl-PL',
    'czech': 'cs-CZ',
    'hungarian': 'hu-HU',
    'finnish': 'fi-FI',
    'turkish': 'tr-TR',
    'greek': 'el-GR',
    'hebrew': 'he-IL',
    'thai': 'th-TH',
    'vietnamese': 'vi-VN',
    'indonesian': 'id-ID',
    'malay': 'ms-MY',
    'filipino': 'tl-PH',
    'ukrainian': 'uk-UA',
    'romanian': 'ro-RO',
    'bulgarian': 'bg-BG',
    'croatian': 'hr-HR',
    'serbian': 'sr-CS',
    'slovak': 'sk-SK',
    'slovenian': 'sl-SI',
    'estonian': 'et-EE',
    'latvian': 'lv-LV',
    'lithuanian': 'lt-LT'
  };

  const languages = [
    { code: 'en-US', name: 'English (US)', flag: '🇺🇸' },
    { code: 'en-GB', name: 'English (UK)', flag: '🇬🇧' },
    { code: 'es-ES', name: 'Spanish (Spain)', flag: '🇪🇸' },
    { code: 'es-MX', name: 'Spanish (Mexico)', flag: '🇲🇽' },
    { code: 'es-SV', name: 'Spanish (El Salvador)', flag: '🇸🇻' },
    { code: 'fr-FR', name: 'French', flag: '🇫🇷' },
    { code: 'de-DE', name: 'German', flag: '🇩🇪' },
    { code: 'it-IT', name: 'Italian', flag: '🇮🇹' },
    { code: 'pt-BR', name: 'Portuguese (Brazil)', flag: '🇧🇷' },
    { code: 'zh-CN', name: 'Chinese (Simplified)', flag: '🇨🇳' }
  ];

  // Set default languages: learningLanguage → nativeLanguage
  useEffect(() => {
    if (authUser?.nativeLanguage && authUser?.learningLanguage) {
      const nativeLang = languageMap[authUser.nativeLanguage.toLowerCase()];
      const learningLang = languageMap[authUser.learningLanguage.toLowerCase()];
      
      if (nativeLang && learningLang) {
        setFromLanguage(learningLang);
        setToLanguage(nativeLang);
      }
    }
  }, [authUser]);

  // Close dropdown when clicking outside - improved
  useEffect(() => {
    if (!showLanguageSelector) return;

    const handleClickOutside = (event) => {
      const translationDropdown = document.querySelector('.translation-dropdown');
      if (translationDropdown && !translationDropdown.contains(event.target)) {
        setShowLanguageSelector(false);
      }
    };

    // Add a small delay to prevent immediate closure
    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside);
    }, 100);

    return () => {
      clearTimeout(timer);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showLanguageSelector]);

  useEffect(() => {
    const initChat = async () => {
      if (!tokenData?.token || !authUser) return;

      try {
        console.log("Initializing stream chat client...");

        const client = StreamChat.getInstance(STREAM_API_KEY);

        await client.connectUser(
          {
            id: authUser._id,
            name: authUser.fullName,
            image: authUser.profilePic,
          },
          tokenData.token
        );

        const channelId = [authUser._id, targetUserId].sort().join("-");

        const currChannel = client.channel("messaging", channelId, {
          members: [authUser._id, targetUserId],
        });

        await currChannel.watch();

        setChatClient(client);
        setChannel(currChannel);
      } catch (error) {
        console.error("Error initializing chat:", error);
        toast.error("Could not connect to chat. Please try again.");
      } finally {
        setLoading(false);
      }
    };

    initChat();
  }, [tokenData, authUser, targetUserId]);

  // Message click handler with timeout and caching
  useEffect(() => {
    if (!channel) return;

    const addClickHandlers = () => {
      // Always update styles when translate mode changes
      let existingStyle = document.getElementById('translation-mode-styles');
      if (existingStyle) {
        existingStyle.remove();
      }
      
      const style = document.createElement('style');
      style.id = 'translation-mode-styles';
      style.textContent = `
        .str-chat__message-text {
          cursor: ${isTranslateMode ? 'pointer' : 'text'} !important;
          transition: none !important;
        }
        ${isTranslateMode ? `
          .str-chat__message-text:hover {
            background-color: rgba(59, 130, 246, 0.1) !important;
            border-radius: 4px !important;
            transition: background-color 0.2s ease !important;
          }
        ` : `
          .str-chat__message-text:hover {
            background-color: transparent !important;
          }
        `}
      `;
      document.head.appendChild(style);

      const handleMessageClick = async (e) => {
        if (!isTranslateMode) return;
        
        const messageTextElement = e.target.closest('.str-chat__message-text');
        if (!messageTextElement) return;

        const messageText = messageTextElement.textContent;
        if (!messageText || messageText.includes('video call')) return;

        const messageElement = messageTextElement.closest('[data-message-id]');
        const messageId = messageElement?.getAttribute('data-message-id');
        
        if (!messageId || translatingMessageIds.has(messageId)) return;

        // Check cache first
        const cacheKey = `${messageText}-${fromLanguage}-${toLanguage}`;
        if (translationCache.has(cacheKey)) {
          setTranslationData({
            id: messageId,
            originalText: messageText,
            translatedText: translationCache.get(cacheKey),
            fromLang: fromLanguage,
            toLang: toLanguage,
            timestamp: new Date().toLocaleTimeString()
          });
          return;
        }

        // Start translation with timeout protection
        setTranslatingMessageIds(prev => new Set([...prev, messageId]));
        setTranslationData({
          id: messageId,
          originalText: messageText,
          translatedText: null,
          isLoading: true,
          fromLang: fromLanguage,
          toLang: toLanguage,
          timestamp: new Date().toLocaleTimeString()
        });

        try {
          const response = await fetch(
            `https://api.mymemory.translated.net/get?q=${encodeURIComponent(messageText)}&langpair=${fromLanguage}|${toLanguage}`
          );
          const data = await response.json();
          
          if (data.responseStatus === 200 && data.responseData?.translatedText) {
            const translatedText = data.responseData.translatedText;
            
            // Cache the result
            setTranslationCache(prev => new Map([...prev, [cacheKey, translatedText]]));
            
            const newTranslation = {
              id: messageId,
              originalText: messageText,
              translatedText: translatedText,
              fromLang: fromLanguage,
              toLang: toLanguage,
              timestamp: new Date().toLocaleTimeString()
            };
            
            setTranslationData(newTranslation);
            
            // Add to history
            setTranslationHistory(prev => [newTranslation, ...prev.slice(0, 9)]); // Keep last 10
          } else {
            throw new Error(`Translation failed: ${data.responseDetails || 'Unknown error'}`);
          }
        } catch (error) {
          console.error('Translation failed:', error);
          setTranslationData(prev => ({
            ...prev,
            error: 'Translation failed. Please try again.',
            isLoading: false
          }));
        } finally {
          // Remove from translating set after 3 seconds to prevent rapid calls
          setTimeout(() => {
            setTranslatingMessageIds(prev => {
              const newSet = new Set(prev);
              newSet.delete(messageId);
              return newSet;
            });
          }, 3000);
        }
      };

      const messageList = document.querySelector('.str-chat__list');
      if (messageList) {
        messageList.removeEventListener('click', handleMessageClick); // Remove old listener
        messageList.addEventListener('click', handleMessageClick);
      }

      return () => {
        const existingStyle = document.getElementById('translation-mode-styles');
        if (existingStyle) existingStyle.remove();
        if (messageList) {
          messageList.removeEventListener('click', handleMessageClick);
        }
      };
    };

    const timer = setTimeout(addClickHandlers, 1000);
    
    return () => {
      clearTimeout(timer);
    };
  }, [channel, isTranslateMode, fromLanguage, toLanguage, translatingMessageIds, translationCache]);

  const toggleTranslateMode = () => {
    const newMode = !isTranslateMode;
    setIsTranslateMode(newMode);
    
    if (newMode) {
      setShowLanguageSelector(true);
    } else {
      setShowLanguageSelector(false);
      setTranslationData(null);
      setTranslationHistory([]);
    }
  };

  const swapLanguages = () => {
    const temp = fromLanguage;
    setFromLanguage(toLanguage);
    setToLanguage(temp);
    setTranslationData(null);
    setTranslationCache(new Map()); // Clear cache when languages change
  };

  const handleFromLanguageChange = (e) => {
    setFromLanguage(e.target.value);
    setTranslationData(null);
    setTranslationCache(new Map());
  };

  const handleToLanguageChange = (e) => {
    setToLanguage(e.target.value);
    setTranslationData(null);
    setTranslationCache(new Map());
  };

  const getLanguageDisplay = (code) => {
    const lang = languages.find(l => l.code === code);
    return lang ? `${lang.flag} ${lang.name}` : code;
  };

  const handleVideoCall = () => {
    if (channel) {
      const callUrl = `${window.location.origin}/call/${channel.id}`;

      channel.sendMessage({
        text: `I've started a video call. Join me here: ${callUrl}`,
      });

      toast.success("Video call link sent successfully!");
    }
  };

  if (loading || !chatClient || !channel) return <ChatLoader />;

  return (
    <div className="h-[93vh]">
      <Chat client={chatClient}>
        <Channel channel={channel}>
          <div className="w-full relative h-full flex">
            {/* Main Chat Area */}
            <div className={`${isTranslateMode && translationData ? 'w-3/4' : 'w-full'} transition-all duration-300 relative`}>
              {/* Video Call Button */}
              <CallButton handleVideoCall={handleVideoCall} />
              
              {/* Translation Button */}
              <div className="absolute top-2 right-20 z-10">
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
                    <div key={`${fromLanguage}-${toLanguage}`} className="absolute top-12 right-0 bg-white rounded-lg shadow-xl border border-gray-200 p-4 w-80 z-30">
                      <div className="space-y-3">
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">From:</label>
                          <select
                            value={fromLanguage}
                            onChange={handleFromLanguageChange}
                            className="w-full text-sm border border-gray-300 rounded px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
                          >
                            {languages.map(lang => (
                              <option key={lang.code} value={lang.code}>{lang.flag} {lang.name}</option>
                            ))}
                          </select>
                        </div>
                        
                        <div className="flex justify-center">
                          <button
                            onClick={swapLanguages}
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
                            onChange={handleToLanguageChange}
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

              <Window>
                <ChannelHeader />
                <MessageList />
                <MessageInput focus />
              </Window>
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
                    {getLanguageDisplay(translationData.fromLang)} → {getLanguageDisplay(translationData.toLang)}
                  </p>
                </div>

                {/* Translation Content */}
                <div className="flex-1 p-4">
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
                  
                  {/* Translation History */}
                  {translationHistory.length > 0 && (
                    <div className="mt-4">
                      <h4 className="text-xs font-medium text-gray-600 mb-2 flex items-center gap-1">
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        Recent Translations
                      </h4>
                      <div className="space-y-2 max-h-40 overflow-y-auto">
                        {translationHistory.slice(0, 5).map((item, index) => (
                          <div 
                            key={`${item.id}-${index}`} 
                            className="bg-gray-50 rounded p-2 cursor-pointer hover:bg-gray-100 transition-colors"
                            onClick={() => setTranslationData(item)}
                          >
                            <div className="text-xs text-gray-500 mb-1">{item.timestamp}</div>
                            <div className="text-xs text-gray-700 truncate">"{item.originalText.slice(0, 30)}..."</div>
                            <div className="text-xs text-gray-800 font-medium truncate">"{item.translatedText.slice(0, 30)}..."</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
          
          <Thread />
        </Channel>
      </Chat>
    </div>
  );
};

export default ChatPage;