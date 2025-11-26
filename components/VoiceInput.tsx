
import React, { useState, useEffect, useRef } from 'react';
import { Mic, MicOff, Loader2 } from 'lucide-react';

interface VoiceInputProps {
  onVoiceResult: (text: string) => void;
  isProcessing: boolean;
  variant?: 'floating' | 'inline';
}

const VoiceInput: React.FC<VoiceInputProps> = ({ onVoiceResult, isProcessing, variant = 'floating' }) => {
  const [isListening, setIsListening] = useState(false);
  const [isSupported, setIsSupported] = useState(false);
  const recognitionRef = useRef<any>(null);
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // Check browser support
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    
    if (SpeechRecognition) {
      setIsSupported(true);
      const recognition = new SpeechRecognition();
      recognition.continuous = true; // Keep listening to handle the 5s silence manually
      recognition.lang = 'en-US';
      recognition.interimResults = false;

      recognition.onstart = () => {
        setIsListening(true);
        resetSilenceTimer();
      };

      recognition.onend = () => {
        setIsListening(false);
        if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
      };
      
      recognition.onresult = (event: any) => {
        // Reset timer on new input
        resetSilenceTimer();
        
        const results = event.results;
        const lastResult = results[results.length - 1];
        
        if (lastResult.isFinal) {
             const transcript = lastResult[0].transcript;
             onVoiceResult(transcript);
             // Normally we might stop here if we wanted one command, but user asked for silence detection stop
        }
      };

      recognition.onerror = (event: any) => {
        console.error("Speech recognition error", event.error);
        setIsListening(false);
        if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
      };

      recognitionRef.current = recognition;
    } else {
        setIsSupported(false);
    }
    
    return () => {
        if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
    }
  }, [onVoiceResult]);

  // Watch for processing state to stop listening automatically
  useEffect(() => {
    if (isProcessing && isListening) {
        if (recognitionRef.current) {
            recognitionRef.current.stop();
        }
        setIsListening(false);
        if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
    }
  }, [isProcessing, isListening]);

  const resetSilenceTimer = () => {
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = setTimeout(() => {
          if (recognitionRef.current && isListening) {
              recognitionRef.current.stop();
              setIsListening(false);
          }
      }, 5000); // 5 seconds
  };

  const toggleListening = () => {
    if (!isSupported) {
        alert("Voice input is not supported in this browser. Please use Chrome, Edge, or Safari.");
        return;
    }
    
    if (isProcessing) return;
    
    if (isListening) {
      recognitionRef.current?.stop();
    } else {
      recognitionRef.current?.start();
    }
  };

  // We intentionally remove the "if (!isSupported) return null" check 
  // so the button always appears in the layout, even if disabled.

  if (variant === 'inline') {
      return (
        <button
            onClick={toggleListening}
            disabled={isProcessing}
            className={`flex flex-col items-center justify-center p-4 md:p-6 rounded-2xl shadow-sm border transition-all ${
                isListening 
                ? 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 animate-pulse' 
                : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-750'
            } ${!isSupported ? 'opacity-50 grayscale cursor-not-allowed' : ''}`}
            title={!isSupported ? "Not supported in this browser" : "Voice Add"}
        >
            <div className={`p-3 rounded-full mb-2 transition-colors ${
                isListening ? 'bg-red-100 dark:bg-red-900/40' : 'bg-slate-100 dark:bg-slate-700'
            }`}>
                {isProcessing ? (
                    <Loader2 size={28} className="animate-spin" />
                ) : isListening ? (
                    <MicOff size={28} />
                ) : (
                    <Mic size={28} />
                )}
            </div>
            <span className="font-bold text-sm">{isListening ? 'Stop' : 'Voice Add'}</span>
            <span className="text-xs text-slate-400 dark:text-slate-500 mt-1 hidden sm:block">
                {!isSupported ? 'Unavailable' : isListening ? 'Listening...' : 'Speak Items'}
            </span>
        </button>
      );
  }

  // Default Floating Variant
  if (!isSupported) return null; // Keep floating hidden if not supported to avoid clutter

  return (
    <button
      onClick={toggleListening}
      disabled={isProcessing}
      className={`relative p-4 rounded-full shadow-lg transition-all duration-300 flex items-center justify-center ${
        isListening 
          ? 'bg-red-500 text-white shadow-red-200 scale-110 animate-pulse' 
          : isProcessing
            ? 'bg-slate-100 text-slate-400'
            : 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-indigo-200 active:scale-95'
      }`}
      title="Add items by voice (Stops after 5s silence)"
    >
      {isProcessing ? (
        <Loader2 size={24} className="animate-spin" />
      ) : isListening ? (
        <MicOff size={24} />
      ) : (
        <Mic size={24} />
      )}
      
      {!isListening && !isProcessing && (
        <span className="absolute -bottom-8 left-1/2 -translate-x-1/2 text-[10px] font-medium text-slate-400 whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity">
          Voice Add
        </span>
      )}
    </button>
  );
};

export default VoiceInput;
