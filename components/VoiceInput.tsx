
import React, { useState, useEffect, useRef } from 'react';
import { Mic, MicOff, Loader2 } from 'lucide-react';

interface VoiceInputProps {
  onVoiceResult: (text: string) => void;
  isProcessing: boolean;
}

const VoiceInput: React.FC<VoiceInputProps> = ({ onVoiceResult, isProcessing }) => {
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef<any>(null);
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // Check browser support
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    
    if (SpeechRecognition) {
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
    }
    
    return () => {
        if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
    }
  }, [onVoiceResult]);

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
    if (isProcessing) return;
    
    if (isListening) {
      recognitionRef.current?.stop();
    } else {
      recognitionRef.current?.start();
    }
  };

  if (!recognitionRef.current) {
    return null; // Don't render if speech API isn't supported
  }

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
      
      {/* Tooltip hint when idle */}
      {!isListening && !isProcessing && (
        <span className="absolute -bottom-8 left-1/2 -translate-x-1/2 text-[10px] font-medium text-slate-400 whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity">
          Voice Add
        </span>
      )}
    </button>
  );
};

export default VoiceInput;
