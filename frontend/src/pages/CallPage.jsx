import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router";
import useAuthUser from "../hooks/useAuthUser";
import { useQuery } from "@tanstack/react-query";
import { getStreamToken } from "../lib/api";

import {
  StreamVideo,
  StreamVideoClient,
  StreamCall,
  CallControls,
  SpeakerLayout,
  StreamTheme,
  CallingState,
  useCallStateHooks,
  useCall,
  OwnCapability,
} from "@stream-io/video-react-sdk";

import "@stream-io/video-react-sdk/dist/css/styles.css";
import toast from "react-hot-toast";
import PageLoader from "../components/PageLoader";

const STREAM_API_KEY = import.meta.env.VITE_STREAM_API_KEY;

const LANGUAGE_MAPPING = {
  'english': 'en', 'spanish': 'es', 'french': 'fr', 'german': 'de',
  'italian': 'it', 'portuguese': 'pt', 'russian': 'ru', 'japanese': 'ja',
  'korean': 'ko', 'chinese': 'zh', 'arabic': 'ar', 'hindi': 'hi'
};

// Translation cache for speed
const translationCache = new Map();

// Fast translation with MyMemory + caching
const translateText = async (text, targetLanguage, sourceLanguage = 'en') => {
  if (!text.trim()) return text;
  
  const sourceLang = LANGUAGE_MAPPING[sourceLanguage.toLowerCase()] || sourceLanguage;
  const targetLang = LANGUAGE_MAPPING[targetLanguage.toLowerCase()] || targetLanguage;
  
  if (sourceLang === targetLang) return text;
  
  // Check cache first
  const cacheKey = `${text.toLowerCase()}-${sourceLang}-${targetLang}`;
  if (translationCache.has(cacheKey)) {
    return translationCache.get(cacheKey);
  }
  
  try {
    const response = await fetch(
      `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${sourceLang}|${targetLang}`
    );
    
    const data = await response.json();
    
    if (data.responseStatus === 200) {
      const translatedText = data.responseData.translatedText;
      
      // Cache result (limit cache size)
      translationCache.set(cacheKey, translatedText);
      if (translationCache.size > 50) {
        const firstKey = translationCache.keys().next().value;
        translationCache.delete(firstKey);
      }
      
      return translatedText;
    }
  } catch (error) {
    // Silent fail, return original text
  }
  
  return text;
};

const CallPage = () => {
  const { id: callId } = useParams();
  const [client, setClient] = useState(null);
  const [call, setCall] = useState(null);
  const [isConnecting, setIsConnecting] = useState(true);

  const { authUser, isLoading } = useAuthUser();

  const { data: tokenData } = useQuery({
    queryKey: ["streamToken"],
    queryFn: getStreamToken,
    enabled: !!authUser,
  });

  useEffect(() => {
    const initCall = async () => {
      if (!tokenData.token || !authUser || !callId) return;

      try {
        const user = {
          id: authUser._id,
          name: authUser.fullName,
          image: authUser.profilePic,
          custom: {
            nativeLanguage: authUser.nativeLanguage,
            learningLanguage: authUser.learningLanguage,
            location: authUser.location
          }
        };

        const videoClient = new StreamVideoClient({
          apiKey: STREAM_API_KEY,
          user,
          token: tokenData.token,
        });

        const callInstance = videoClient.call("default", callId);
        await callInstance.join({ create: true });

        // Optimize for fast captions
        await callInstance.getOrCreate({
          data: {
            settings_override: {
              transcription: {
                mode: "auto-on",
                closed_caption_mode: "auto-on",
              },
            },
          },
        });

        await callInstance.updateClosedCaptionSettings({
          visibilityDurationMs: 4000,
          maxVisibleCaptions: 2,
        });

        setClient(videoClient);
        setCall(callInstance);
      } catch (error) {
        toast.error("Could not join the call. Please try again.");
      } finally {
        setIsConnecting(false);
      }
    };

    initCall();
  }, [tokenData, authUser, callId]);

  if (isLoading || isConnecting) return <PageLoader />;

  return (
    <div className="h-screen flex flex-col items-center justify-center bg-gradient-to-br from-lime-50 to-lime-400">
      <div className="relative">
        {client && call ? (
          <StreamVideo client={client}>
            <StreamCall call={call}>
              <CallContent />
            </StreamCall>
          </StreamVideo>
        ) : (
          <div className="flex items-center justify-center h-full">
            <p>Could not initialize call. Please refresh or try again later.</p>
          </div>
        )}
      </div>
    </div>
  );
};

const CallContent = () => {
  const { useCallCallingState } = useCallStateHooks();
  const callingState = useCallCallingState();
  const navigate = useNavigate();

  if (callingState === CallingState.LEFT) return navigate("/");

  return (
    <StreamTheme>
      <div className="relative">
        <SpeakerLayout />
        <TranslatedClosedCaptions />
        <CallControls />
      </div>
    </StreamTheme>
  );
};

const TranslatedClosedCaptions = () => {
  const call = useCall();
  const { 
    useCallClosedCaptions, 
    useIsCallCaptioningInProgress, 
    useHasPermissions,
    useParticipants 
  } = useCallStateHooks();
  
  const closedCaptions = useCallClosedCaptions();
  const isCaptioningInProgress = useIsCallCaptioningInProgress();
  const participants = useParticipants();
  const canToggleClosedCaptions = useHasPermissions(
    OwnCapability.START_CLOSED_CAPTIONS_CALL,
    OwnCapability.STOP_CLOSED_CAPTIONS_CALL,
  );

  const { authUser } = useAuthUser();
  const defaultTargetLang = LANGUAGE_MAPPING[authUser?.learningLanguage?.toLowerCase()] || 'en';
  
  const [userLanguage, setUserLanguage] = useState(defaultTargetLang);
  const [showTranslations, setShowTranslations] = useState(true);
  const [translatedCaptions, setTranslatedCaptions] = useState(new Map());
  const [showOwnCaptions, setShowOwnCaptions] = useState(false);

  // Clean up old captions to prevent memory buildup
  useEffect(() => {
    const cleanup = setInterval(() => {
      setTranslatedCaptions(prev => {
        if (prev.size > 20) {
          const newMap = new Map();
          const entries = Array.from(prev.entries()).slice(-10);
          entries.forEach(([key, value]) => newMap.set(key, value));
          return newMap;
        }
        return prev;
      });
    }, 30000); // Clean every 30 seconds

    return () => clearInterval(cleanup);
  }, []);

  // Fast parallel translation
  useEffect(() => {
    if (!showTranslations || !closedCaptions.length) return;

    const translateNewCaptions = async () => {
      const newCaptions = closedCaptions.filter(caption => {
        const key = `${caption.user.id}-${caption.start_time}`;
        return !translatedCaptions.has(key);
      });

      if (newCaptions.length === 0) return;

      // Translate all in parallel for speed
      const translationPromises = newCaptions.map(async (caption) => {
        const key = `${caption.user.id}-${caption.start_time}`;
        
        try {
          const speaker = participants.find(p => p.userId === caption.user.id);
          const speakerNativeLanguage = speaker?.user?.custom?.nativeLanguage || 'english';
          const sourceLang = LANGUAGE_MAPPING[speakerNativeLanguage.toLowerCase()] || 'en';
          
          const translatedText = await translateText(caption.text, userLanguage, sourceLang);
          
          return { key, caption: { ...caption, translatedText, sourceLanguage: sourceLang } };
        } catch (error) {
          return { key, caption: { ...caption, translatedText: caption.text, sourceLanguage: 'unknown' } };
        }
      });

      const results = await Promise.all(translationPromises);
      
      setTranslatedCaptions(prev => {
        const newMap = new Map(prev);
        results.forEach(({ key, caption }) => newMap.set(key, caption));
        return newMap;
      });
    };

    translateNewCaptions();
  }, [closedCaptions, userLanguage, showTranslations, participants]);

  const toggleClosedCaptions = async () => {
    try {
      if (isCaptioningInProgress) {
        await call.stopClosedCaptions();
      } else {
        await call.startClosedCaptions();
        
        // Quick optimization
        setTimeout(async () => {
          try {
            await call.updateClosedCaptionSettings({
              visibilityDurationMs: 4000,
              maxVisibleCaptions: 2,
            });
          } catch (error) {
            // Silent fail
          }
        }, 1000);
      }
    } catch (error) {
      toast.error("Failed to toggle captions");
    }
  };

  return (
    <div className="fixed top-4 right-4 z-50">
      {/* Controls */}
      <div className="bg-black bg-opacity-50 rounded-lg p-3 backdrop-blur-sm mb-4">
        <TranslationControls
          userLanguage={userLanguage}
          setUserLanguage={setUserLanguage}
          showTranslations={showTranslations}
          setShowTranslations={setShowTranslations}
          showOwnCaptions={showOwnCaptions}
          setShowOwnCaptions={setShowOwnCaptions}
          isCaptioningInProgress={isCaptioningInProgress}
          canToggleClosedCaptions={canToggleClosedCaptions}
          onToggleCaptions={toggleClosedCaptions}
        />
      </div>

      {/* Limited Captions Display */}
      {isCaptioningInProgress && (
        <div className="fixed bottom-20 left-1/2 transform -translate-x-1/2 max-w-2xl">
          <div className="bg-black bg-opacity-75 rounded-lg p-4 backdrop-blur-sm">
            <div className="closed-captions max-h-24 overflow-hidden">
              {closedCaptions
                .filter(caption => showOwnCaptions || caption.user.id !== authUser?._id)
                .slice(-2) // Only show last 2 captions
                .map((caption) => {
                const key = `${caption.user.id}-${caption.start_time}`;
                const translated = translatedCaptions.get(key);
                const displayText = showTranslations && translated 
                  ? translated.translatedText 
                  : caption.text;

                return (
                  <div key={key} className="closed-captions__item mb-2 last:mb-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="closed-captions__speaker text-blue-300 font-medium text-sm">
                        {caption.user.name}
                      </span>
                      {translated && translated.sourceLanguage && (
                        <span className="text-xs bg-gray-600 px-1 py-0.5 rounded">
                          {translated.sourceLanguage} → {userLanguage}
                        </span>
                      )}
                    </div>
                    <div className="closed-captions__text text-white text-sm">
                      {displayText}
                    </div>
                    {showTranslations && translated && translated.translatedText !== caption.text && (
                      <div className="text-gray-400 text-xs mt-1">
                        Original: {caption.text}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const TranslationControls = ({ 
  userLanguage, 
  setUserLanguage, 
  showTranslations, 
  setShowTranslations,
  showOwnCaptions,
  setShowOwnCaptions,
  isCaptioningInProgress,
  canToggleClosedCaptions,
  onToggleCaptions
}) => {
  const { authUser } = useAuthUser();
  
  const languages = [
    { code: 'en', name: 'English' },
    { code: 'es', name: 'Spanish' },
    { code: 'fr', name: 'French' },
    { code: 'de', name: 'German' },
    { code: 'it', name: 'Italian' },
    { code: 'pt', name: 'Portuguese' },
    { code: 'ru', name: 'Russian' },
    { code: 'ja', name: 'Japanese' },
    { code: 'ko', name: 'Korean' },
    { code: 'zh', name: 'Chinese' },
    { code: 'ar', name: 'Arabic' },
    { code: 'hi', name: 'Hindi' },
  ];

  const userLearningLang = LANGUAGE_MAPPING[authUser?.learningLanguage?.toLowerCase()];

  return (
    <div className="flex flex-col gap-2">
      {/* User Info */}
      {authUser && (
        <div className="text-xs text-gray-300 bg-gray-800 rounded px-2 py-1">
          Learning: {authUser.learningLanguage}
        </div>
      )}

      {/* Caption Toggle */}
      <button
        disabled={!canToggleClosedCaptions}
        onClick={onToggleCaptions}
        className={`px-3 py-2 rounded text-sm font-medium transition-colors ${
          isCaptioningInProgress 
            ? 'bg-red-600 text-white hover:bg-red-700' 
            : 'bg-green-600 text-white hover:bg-green-700'
        } ${!canToggleClosedCaptions ? 'opacity-50 cursor-not-allowed' : ''}`}
      >
        {isCaptioningInProgress ? 'Stop' : 'Start'} Captions
      </button>

      {/* Translation Controls */}
      {isCaptioningInProgress && (
        <div className="flex flex-col gap-2">
          <div className="flex gap-2">
            <button
              onClick={() => setShowOwnCaptions(!showOwnCaptions)}
              className={`px-2 py-1 rounded text-xs transition-colors ${
                showOwnCaptions 
                  ? 'bg-purple-600 text-white' 
                  : 'bg-gray-600 text-gray-200 hover:bg-gray-500'
              }`}
            >
              {showOwnCaptions ? 'Hide' : 'Show'} My Captions
            </button>
            
            <button
              onClick={() => setShowTranslations(!showTranslations)}
              className={`px-2 py-1 rounded text-xs transition-colors ${
                showTranslations 
                  ? 'bg-blue-600 text-white' 
                  : 'bg-gray-600 text-gray-200 hover:bg-gray-500'
              }`}
            >
              {showTranslations ? 'Hide' : 'Show'} Translations
            </button>
          </div>
          
          {showTranslations && (
            <div className="flex flex-col gap-1">
              <select
                value={userLanguage}
                onChange={(e) => setUserLanguage(e.target.value)}
                className="bg-gray-700 text-white rounded px-2 py-1 text-sm border border-gray-600"
              >
                {languages.map(lang => (
                  <option 
                    key={lang.code} 
                    value={lang.code}
                    className={lang.code === userLearningLang ? 'bg-blue-600' : ''}
                  >
                    {lang.name} {lang.code === userLearningLang ? '(Learning)' : ''}
                  </option>
                ))}
              </select>
              
              {userLearningLang && userLearningLang !== userLanguage && (
                <button
                  onClick={() => setUserLanguage(userLearningLang)}
                  className="text-xs bg-blue-600 hover:bg-blue-500 px-2 py-1 rounded"
                >
                  Switch to Learning Language
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default CallPage;