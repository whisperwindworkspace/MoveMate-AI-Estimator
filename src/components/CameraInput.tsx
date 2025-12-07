import React, { useEffect, useRef, useState, useCallback } from 'react';
import { ScanLine, X, ImagePlus, Zap, ZapOff } from 'lucide-react';

export interface CameraInputProps {
  onImageCaptured: (base64: string) => void | Promise<void>;
  onVideoCaptured?: (frames: string[]) => void | Promise<void>;
  isAnalyzing?: boolean;
  extraAction?: React.ReactNode;
  onClose?: () => void;
}

const CameraInput: React.FC<CameraInputProps> = ({
  onImageCaptured,
  onVideoCaptured: _onVideoCaptured, // accepted for future use
  isAnalyzing: _isAnalyzing,         // accepted for future use
  extraAction,
  onClose,
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [isFlashOn, setIsFlashOn] = useState(false);

  const startCamera = useCallback(async () => {
    try {
      const media = await navigator.mediaDevices.getUserMedia({ video: true });
      setStream(media);
      if (videoRef.current) {
        videoRef.current.srcObject = media;
      }
    } catch (err) {
      console.error('Failed to start camera:', err);
    }
  }, []);

  const stopCamera = useCallback(() => {
    if (stream) {
      stream.getTracks().forEach((t) => t.stop());
      setStream(null);
    }
  }, [stream]);

  const captureImage = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    const width = video.videoWidth;
    const height = video.videoHeight;
    if (!width || !height) return;

    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.drawImage(video, 0, 0, width, height);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
    const [, base64 = ''] = dataUrl.split(',');
    if (base64) {
      void onImageCaptured(base64);
    }
  }, [onImageCaptured]);

  const toggleFlash = () => setIsFlashOn((p) => !p);

  useEffect(() => {
    void startCamera();
    return () => {
      stopCamera();
    };
  }, [startCamera, stopCamera]);

  return (
    <div className="relative flex flex-col items-center justify-center w-full h-full bg-black/80 text-white rounded-xl">
      <div className="absolute top-3 right-3 flex gap-2">
        <button onClick={toggleFlash} className="p-2 rounded bg-white/10 hover:bg-white/20">
          {isFlashOn ? <ZapOff size={18} /> : <Zap size={18} />}
        </button>
        <button onClick={onClose} className="p-2 rounded bg-white/10 hover:bg-white/20">
          <X size={18} />
        </button>
      </div>

      <video ref={videoRef} autoPlay playsInline className="rounded-md w-full max-w-md shadow-lg" />
      <canvas ref={canvasRef} className="hidden" />

      <div className="mt-6 flex gap-4 items-center">
        <button
          onClick={captureImage}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 rounded-md hover:bg-blue-500"
        >
          <ScanLine size={18} />
          Capture
        </button>
        <button
          onClick={onClose}
          className="flex items-center gap-2 px-4 py-2 bg-gray-600 rounded-md hover:bg-gray-500"
        >
          <ImagePlus size={18} />
          Gallery
        </button>
        {extraAction}
      </div>
    </div>
  );
};

export default CameraInput;
