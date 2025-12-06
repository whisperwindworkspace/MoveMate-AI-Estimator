import React, { useRef, useState, useEffect } from 'react';
import { Camera, Upload, ScanLine, X, Loader2, ImagePlus, Zap, ZapOff, Video, Circle, StopCircle } from 'lucide-react';
import LoadingOverlay from './LoadingOverlay';

interface CameraInputProps {
  onImageCaptured: (base64: string) => void;
  onVideoCaptured?: (frames: string[]) => void;
  isAnalyzing: boolean;
  extraAction?: React.ReactNode;
}

// Helper to extract frames from video file
const extractFramesFromVideo = (file: File): Promise<string[]> => {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.muted = true;
    video.playsInline = true;
    
    const objectUrl = URL.createObjectURL(file);
    video.src = objectUrl;

    const frames: string[] = [];
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    video.onloadedmetadata = () => {
      const duration = video.duration;
      // Limit resolution for analysis
      const maxDim = 1920;
      let width = video.videoWidth;
      let height = video.videoHeight;
      
      if (width > maxDim || height > maxDim) {
          const scale = Math.min(maxDim/width, maxDim/height);
          width *= scale;
          height *= scale;
      }
      
      canvas.width = width;
      canvas.height = height;

      let currentTime = 0.5; // Start slightly in
      const interval = 1.0; // Every 1 second
      const maxFrames = 10;

      const capture = () => {
        if (currentTime >= duration || frames.length >= maxFrames) {
          URL.revokeObjectURL(objectUrl);
          resolve(frames);
          return;
        }
        
        video.currentTime = currentTime;
      };

      video.onseeked = () => {
        if (ctx) {
            ctx.drawImage(video, 0, 0, width, height);
            const data = canvas.toDataURL('image/jpeg', 0.7);
            frames.push(data.split(',')[1]);
        }
        currentTime += interval;
        capture();
      };
      
      video.onerror = () => {
          URL.revokeObjectURL(objectUrl);
          reject(new Error("Video processing error"));
      };

      capture(); // Start
    };
    
    video.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        reject(new Error("Failed to load video"));
    };
  });
};

const CameraInput: React.FC<CameraInputProps> = ({ onImageCaptured, onVideoCaptured, isAnalyzing, extraAction }) => {
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [mode, setMode] = useState<'PHOTO' | 'VIDEO'>('PHOTO');
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [hasTorch, setHasTorch] = useState(false);
  const [isTorchOn, setIsTorchOn] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Refs for video capture logic
  const framesRef = useRef<string[]>([]);
  // Use 'any' or ReturnType<typeof setInterval> to avoid NodeJS namespace issues in browser environment
  const intervalRef = useRef<any>(null);
  const timerRef = useRef<any>(null);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopStreamTracks();
      stopRecording();
    };
  }, [stream]);

  const stopStreamTracks = () => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
    }
  };

  const startCamera = async () => {
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { 
            facingMode: 'environment',
            width: { ideal: 3840 }, // Request 4K for better detection details
            height: { ideal: 2160 },
            // @ts-ignore - focusMode is supported by some browsers but not in standard typings
            advanced: [{ focusMode: 'continuous' }] 
        }
      });
      
      setStream(mediaStream);
      setIsCameraOpen(true);
      
      // Check for torch capability
      const track = mediaStream.getVideoTracks()[0];
      const capabilities = track.getCapabilities() as any;
      if (capabilities.torch) {
          setHasTorch(true);
      }

      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = mediaStream;
        }
      }, 100);
    } catch (err) {
      console.error("Error accessing camera:", err);
      alert("Could not access camera. Please allow camera permissions or use Upload.");
    }
  };

  const stopCamera = () => {
    stopRecording();
    stopStreamTracks();
    setStream(null);
    setIsCameraOpen(false);
    setIsTorchOn(false);
    setRecordingTime(0);
  };

  const toggleTorch = async () => {
      if (stream && hasTorch) {
          const track = stream.getVideoTracks()[0];
          const newStatus = !isTorchOn;
          try {
            await track.applyConstraints({
                advanced: [{ torch: newStatus }] as any
            });
            setIsTorchOn(newStatus);
          } catch (e) {
              console.error("Failed to toggle torch", e);
          }
      }
  };

  // --- Capture Logic ---

  const captureFrameBase64 = (quality = 0.85, scale = 1.0): string | null => {
    if (videoRef.current && canvasRef.current) {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      
      const width = video.videoWidth * scale; 
      const height = video.videoHeight * scale;

      canvas.width = width;
      canvas.height = height;
      
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(video, 0, 0, width, height);
        const dataUrl = canvas.toDataURL('image/jpeg', quality); 
        return dataUrl.split(',')[1];
      }
    }
    return null;
  };

  const handleTakePhoto = () => {
      // High quality capture for single photo mode (4K source if available)
      const base64 = captureFrameBase64(0.85, 1.0);
      if (base64) onImageCaptured(base64);
  };

  const startRecording = () => {
      setIsRecording(true);
      setRecordingTime(0);
      framesRef.current = [];

      // Capture frames for video sequence.
      // Since source is now 4K, we scale down by 0.5 (to ~1080p) to keep payload size reasonable for multiple frames.
      const captureVideoFrame = () => {
          const frame = captureFrameBase64(0.7, 0.5);
          if (frame) framesRef.current.push(frame);
      };

      captureVideoFrame(); // First frame

      // Capture frame every 1 second
      intervalRef.current = setInterval(captureVideoFrame, 1000);

      // Timer for UI
      timerRef.current = setInterval(() => {
          setRecordingTime(prev => prev + 1);
      }, 1000);
  };

  const stopRecording = () => {
      if (!isRecording) return;
      
      setIsRecording(false);
      if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
      }
      if (timerRef.current) {
          clearInterval(timerRef.current);
          timerRef.current = null;
      }

      if (onVideoCaptured && framesRef.current.length > 0) {
          // Limit to max 10 frames to prevent payload explosion
          const limitedFrames = framesRef.current.slice(0, 10);
          onVideoCaptured(limitedFrames);
      }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    // Explicitly cast to File[] to fix type inference issues
    const fileList = Array.from(files) as File[];
    
    // Process Images
    const images = fileList.filter(f => f.type.startsWith('image/'));
    images.forEach(file => {
        const reader = new FileReader();
        reader.onloadend = () => {
            const result = reader.result as string;
            const base64 = result.split(',')[1];
            onImageCaptured(base64);
        };
        reader.readAsDataURL(file);
    });

    // Process Videos
    const videos = fileList.filter(f => f.type.startsWith('video/'));
    if (onVideoCaptured && videos.length > 0) {
        for (const video of videos) {
            try {
                const frames = await extractFramesFromVideo(video);
                if (frames.length > 0) {
                    onVideoCaptured(frames);
                }
            } catch (e) {
                console.error("Failed to process uploaded video", e);
                // Safe check for video.name just in case, though File always has name
                alert("Could not process video file: " + (video as any).name);
            }
        }
    }

    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const formatTime = (seconds: number) => {
      const mins = Math.floor(seconds / 60);
      const secs = seconds % 60;
      return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="w-full mb-6 relative group">
      {/* Global Loading Overlay for Camera Input Component (Covers Camera, Buttons, Voice, Upload) */}
      {isAnalyzing && <LoadingOverlay />}

      <input
        type="file"
        accept="image/*,video/*"
        multiple
        className="hidden"
        ref={fileInputRef}
        onChange={handleFileUpload}
      />
      
      <canvas ref={canvasRef} className="hidden" />

      {isCameraOpen ? (
        <div className="relative rounded-2xl overflow-hidden bg-black shadow-lg aspect-[3/4] sm:aspect-[4/3] md:aspect-video border border-slate-800">
           <video 
              ref={videoRef} 
              autoPlay 
              playsInline 
              muted 
              className="w-full h-full object-cover"
           />
           
           {/* Top Controls */}
           <div className="absolute top-0 left-0 right-0 p-4 flex justify-between items-start bg-gradient-to-b from-black/60 to-transparent">
                {hasTorch ? (
                    <button
                        onClick={toggleTorch}
                        className={`p-2 rounded-full backdrop-blur-md transition-all ${
                            isTorchOn 
                            ? 'bg-yellow-400 text-black' 
                            : 'bg-black/30 text-white'
                        }`}
                    >
                        {isTorchOn ? <Zap size={20} fill="currentColor" /> : <ZapOff size={20} />}
                    </button>
                ) : <div />}

                {isRecording && (
                    <div className="bg-red-600 text-white px-3 py-1 rounded-full text-xs font-mono animate-pulse flex items-center gap-2">
                        <div className="w-2 h-2 bg-white rounded-full"></div>
                        REC {formatTime(recordingTime)}
                    </div>
                )}

                <button 
                   onClick={stopCamera}
                   className="bg-black/30 text-white p-2 rounded-full backdrop-blur-md hover:bg-black/50"
                >
                   <X size={20} />
                </button>
           </div>

           {/* Bottom Controls */}
           <div className="absolute bottom-0 left-0 right-0 p-6 flex flex-col items-center gap-6 bg-gradient-to-t from-black/80 via-black/40 to-transparent">
              
              {/* Mode Toggle */}
              {!isRecording && !isAnalyzing && (
                  <div className="flex bg-black/40 backdrop-blur-md rounded-full p-1">
                      <button 
                        onClick={() => setMode('PHOTO')}
                        className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all ${mode === 'PHOTO' ? 'bg-white text-black' : 'text-white hover:bg-white/10'}`}
                      >
                          Photo
                      </button>
                      <button 
                        onClick={() => setMode('VIDEO')}
                        className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all ${mode === 'VIDEO' ? 'bg-white text-black' : 'text-white hover:bg-white/10'}`}
                      >
                          Video
                      </button>
                  </div>
              )}

              {/* Shutter Button */}
              <div className="flex items-center justify-center">
                 {mode === 'PHOTO' ? (
                     <button
                        onClick={handleTakePhoto}
                        disabled={isAnalyzing}
                        className="w-16 h-16 rounded-full border-4 border-white flex items-center justify-center bg-white/20 active:scale-90 transition-all shadow-lg disabled:opacity-0"
                     >
                        <div className="w-12 h-12 bg-white rounded-full"></div>
                     </button>
                 ) : (
                     // Video Mode Button
                     <button
                        onClick={isRecording ? stopRecording : startRecording}
                        disabled={isAnalyzing}
                        className={`w-16 h-16 rounded-full border-4 flex items-center justify-center transition-all shadow-lg active:scale-95 disabled:opacity-0 ${
                            isRecording ? 'border-red-500 bg-red-500/20' : 'border-white bg-white/20'
                        }`}
                     >
                        {isRecording ? (
                            <div className="w-8 h-8 bg-red-500 rounded-md"></div>
                        ) : (
                            <div className="w-14 h-14 bg-red-500 rounded-full border-2 border-transparent"></div>
                        )}
                     </button>
                 )}
              </div>
              
              {!isRecording && !isAnalyzing && (
                  <p className="text-white/70 text-xs text-center max-w-[200px]">
                      {mode === 'PHOTO' 
                        ? "Tap to capture a single high-res photo." 
                        : "Record a short clip to scan the room."}
                  </p>
              )}
           </div>
        </div>
      ) : (
        /* Default State */
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <button
                onClick={startCamera}
                disabled={isAnalyzing}
                className="col-span-2 md:col-span-1 flex flex-col items-center justify-center p-6 bg-blue-600 text-white rounded-2xl shadow-lg shadow-blue-200 dark:shadow-blue-900/20 hover:bg-blue-700 transition-all active:scale-95"
            >
                <div className="p-3 bg-white/20 rounded-full mb-2">
                    <ScanLine size={28} />
                </div>
                <span className="font-bold">Open Scanner</span>
                <span className="text-xs text-blue-100 opacity-80 mt-1">Camera</span>
            </button>

            {extraAction}

            <button
                onClick={() => fileInputRef.current?.click()}
                disabled={isAnalyzing}
                className="flex flex-col items-center justify-center p-6 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 rounded-2xl shadow-sm hover:bg-slate-50 dark:hover:bg-slate-750 transition-all"
            >
                <div className="p-3 bg-slate-100 dark:bg-slate-700 rounded-full mb-2">
                    <ImagePlus size={28} />
                </div>
                <span className="font-bold text-sm">Upload</span>
                <span className="text-xs text-slate-400 dark:text-slate-500 mt-1">Photos / Video</span>
            </button>
        </div>
      )}
    </div>
  );
};

export default CameraInput;