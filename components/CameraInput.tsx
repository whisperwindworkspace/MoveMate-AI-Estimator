
import React, { useRef, useState, useEffect } from 'react';
import { Camera, Upload, ScanLine, X, Loader2, ImagePlus, Zap, ZapOff } from 'lucide-react';

interface CameraInputProps {
  onImageCaptured: (base64: string) => void;
  isAnalyzing: boolean;
}

const CameraInput: React.FC<CameraInputProps> = ({ onImageCaptured, isAnalyzing }) => {
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [hasTorch, setHasTorch] = useState(false);
  const [isTorchOn, setIsTorchOn] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Stop stream when component unmounts
  useEffect(() => {
    return () => {
      stopStreamTracks();
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
            facingMode: 'environment' 
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

      // Slight delay to allow render
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
    stopStreamTracks();
    setStream(null);
    setIsCameraOpen(false);
    setIsTorchOn(false);
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

  const captureFrame = () => {
    if (videoRef.current && canvasRef.current) {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
        const base64 = dataUrl.split(',')[1];
        onImageCaptured(base64);
      }
    }
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        const result = reader.result as string;
        const base64 = result.split(',')[1];
        onImageCaptured(base64);
      };
      reader.readAsDataURL(file);
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <div className="w-full mb-6 relative">
      <input
        type="file"
        accept="image/*"
        className="hidden"
        ref={fileInputRef}
        onChange={handleFileUpload}
      />
      
      {/* Hidden canvas for processing */}
      <canvas ref={canvasRef} className="hidden" />

      {isCameraOpen ? (
        <div className="relative rounded-2xl overflow-hidden bg-black shadow-lg aspect-[4/3] md:aspect-video border border-slate-800">
           <video 
              ref={videoRef} 
              autoPlay 
              playsInline 
              muted 
              className="w-full h-full object-cover"
           />
           
           {/* Overlay Controls */}
           <div className="absolute inset-0 bg-transparent flex flex-col justify-between p-4">
              <div className="flex justify-between items-start">
                {hasTorch ? (
                    <button
                        onClick={toggleTorch}
                        className={`p-3 rounded-full backdrop-blur-sm transition-all ${
                            isTorchOn 
                            ? 'bg-yellow-400/80 text-black shadow-[0_0_15px_rgba(250,204,21,0.5)]' 
                            : 'bg-black/40 text-white hover:bg-black/60'
                        }`}
                    >
                        {isTorchOn ? <Zap size={20} fill="currentColor" /> : <ZapOff size={20} />}
                    </button>
                ) : <div />}

                <button 
                   onClick={stopCamera}
                   className="bg-black/50 text-white p-2 rounded-full backdrop-blur-sm hover:bg-black/70"
                >
                   <X size={20} />
                </button>
              </div>

              <div className="flex justify-center mb-4">
                 <button
                    onClick={captureFrame}
                    disabled={isAnalyzing}
                    className="group relative flex items-center gap-2 bg-white dark:bg-slate-100 text-blue-600 px-6 py-3 rounded-full font-bold shadow-xl transition-all active:scale-95 disabled:opacity-75 disabled:cursor-wait"
                 >
                    {isAnalyzing ? (
                        <>
                           <Loader2 className="animate-spin" size={24} /> Analyzing...
                        </>
                    ) : (
                        <>
                           <div className="p-1 border-2 border-blue-600 rounded-full">
                             <div className="w-4 h-4 bg-blue-600 rounded-full animate-pulse" />
                           </div>
                           Scan Visible Items
                        </>
                    )}
                 </button>
              </div>
           </div>
           
           {/* Scanning Grid Overlay Effect */}
           <div className="absolute inset-0 pointer-events-none opacity-20 bg-[linear-gradient(rgba(0,150,255,0.1)_1px,transparent_1px),linear-gradient(90deg,rgba(0,150,255,0.1)_1px,transparent_1px)] bg-[size:40px_40px]"></div>
           {!isAnalyzing && <div className="absolute inset-x-0 top-1/2 h-0.5 bg-blue-400/50 shadow-[0_0_15px_rgba(59,130,246,0.8)] animate-[scan_2s_ease-in-out_infinite]" />}
        </div>
      ) : (
        /* Default State - Scan Button */
        <div className="flex gap-3">
            <button
                onClick={startCamera}
                disabled={isAnalyzing}
                className="flex-1 flex flex-col items-center justify-center p-6 bg-blue-600 text-white rounded-2xl shadow-lg shadow-blue-200 dark:shadow-blue-900/20 hover:bg-blue-700 transition-all active:scale-95"
            >
                <div className="p-3 bg-white/20 rounded-full mb-2">
                    <ScanLine size={28} />
                </div>
                <span className="font-bold">Open Scanner</span>
                <span className="text-xs text-blue-100 opacity-80 mt-1">Use Camera</span>
            </button>

            <button
                onClick={() => fileInputRef.current?.click()}
                disabled={isAnalyzing}
                className="flex-[0.4] flex flex-col items-center justify-center p-6 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 rounded-2xl shadow-sm hover:bg-slate-50 dark:hover:bg-slate-750 transition-all"
            >
                <div className="p-3 bg-slate-100 dark:bg-slate-700 rounded-full mb-2">
                    <ImagePlus size={28} />
                </div>
                <span className="font-bold text-sm">Upload</span>
                <span className="text-xs text-slate-400 dark:text-slate-500 mt-1">Photos</span>
            </button>
        </div>
      )}

      <style>{`
        @keyframes scan {
          0%, 100% { transform: translateY(-100px); opacity: 0; }
          50% { opacity: 1; }
          100% { transform: translateY(100px); opacity: 0; }
        }
      `}</style>
    </div>
  );
};

export default CameraInput;
