// src/components/CameraInput.tsx
import React, {
  useEffect,
  useRef,
  useState,
  useCallback,
} from 'react';
import { ScanLine, X, ImagePlus, Zap, ZapOff, Camera } from 'lucide-react';

export interface CameraInputProps {
  onImageCaptured: (base64: string) => void | Promise<void>;
  onVideoCaptured?: (frames: string[]) => void | Promise<void>;
  isAnalyzing?: boolean;
  extraAction?: React.ReactNode;
  onClose?: () => void;
}

const CameraInput: React.FC<CameraInputProps> = ({
  onImageCaptured,
  onVideoCaptured: _onVideoCaptured, // reserved for future use
  isAnalyzing: _isAnalyzing, // reserved for future use
  extraAction,
  onClose,
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [isCameraActive, setIsCameraActive] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [isFlashOn, setIsFlashOn] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const stopCamera = useCallback(() => {
    const stream = streamRef.current;
    if (stream) {
      stream.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setIsCameraActive(false);
  }, []);

  const startCamera = useCallback(async () => {
    if (isStarting || isCameraActive) return;

    if (
      typeof navigator === 'undefined' ||
      !navigator.mediaDevices ||
      !navigator.mediaDevices.getUserMedia
    ) {
      setError('Camera is not available in this browser.');
      return;
    }

    setIsStarting(true);
    setError(null);

    try {
      const media = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'environment',
        },
      });

      if (!videoRef.current) {
        // Component unmounted before stream became available
        media.getTracks().forEach((t) => t.stop());
        return;
      }

      streamRef.current = media;
      videoRef.current.srcObject = media;
      setIsCameraActive(true);
    } catch (err) {
      console.error('Failed to start camera:', err);
      setError('Could not access camera. Check browser permissions.');
    } finally {
      setIsStarting(false);
    }
  }, [isCameraActive, isStarting]);

  const captureImage = useCallback(() => {
    if (!isCameraActive) {
      // If somehow called while camera is off, just try to start it
      void startCamera();
      return;
    }

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
  }, [isCameraActive, onImageCaptured, startCamera]);

  const toggleFlash = () => {
    // We only visually toggle — real torch support is device/permission-dependent
    setIsFlashOn((prev) => !prev);
  };

  // Cleanup when component unmounts
  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, [stopCamera]);

  const handleClose = () => {
    stopCamera();
    onClose?.();
  };

  const primaryButtonLabel = isCameraActive ? 'Capture' : 'Open Scanner';
  const primaryButtonHandler = isCameraActive ? captureImage : startCamera;

  return (
    <div className="w-full flex flex-col items-center">
      <div className="relative w-full max-w-3xl mx-auto">
        {/* Camera frame */}
        <div className="relative w-full rounded-2xl bg-black/90 overflow-hidden aspect-video flex items-center justify-center">
          {/* Top-right controls */}
          <div className="absolute top-3 right-3 flex gap-2 z-20">
            <button
              type="button"
              onClick={toggleFlash}
              className="p-2 rounded bg-white/10 hover:bg-white/20 text-white transition"
              aria-label="Toggle flash"
            >
              {isFlashOn ? <ZapOff size={18} /> : <Zap size={18} />}
            </button>
            {onClose && (
              <button
                type="button"
                onClick={handleClose}
                className="p-2 rounded bg-white/10 hover:bg-white/20 text-white transition"
                aria-label="Close camera"
              >
                <X size={18} />
              </button>
            )}
          </div>

          {/* Actual video or placeholder */}
          {isCameraActive ? (
            <video
              ref={videoRef}
              autoPlay
              playsInline
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="flex flex-col items-center justify-center text-center px-6 text-slate-100">
              <div className="mb-4 flex items-center justify-center w-14 h-14 rounded-full bg-white/5 border border-white/10">
                <Camera className="w-7 h-7 text-slate-200" />
              </div>
              <p className="text-sm font-medium mb-1">
                Camera is off.
              </p>
              <p className="text-xs text-slate-300 max-w-md">
                Tap <span className="font-semibold">&ldquo;Open Scanner&rdquo;</span> below
                when you&apos;re ready to take photos of items or walk through a room.
              </p>
              {error && (
                <p className="mt-3 text-xs text-red-400 max-w-md">
                  {error}
                </p>
              )}
            </div>
          )}

          {/* Voice / extra action card overlay (bottom-right) */}
          {extraAction && (
            <div className="absolute bottom-4 right-4 z-20">
              {extraAction}
            </div>
          )}
        </div>

        {/* Hidden canvas for captures */}
        <canvas ref={canvasRef} className="hidden" />
      </div>

      {/* Controls row */}
      <div className="mt-5 flex items-center gap-4">
        <button
          type="button"
          onClick={primaryButtonHandler}
          disabled={isStarting}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-md bg-blue-600 hover:bg-blue-500 text-sm font-medium text-white shadow-sm disabled:opacity-70 disabled:cursor-wait transition"
        >
          <ScanLine size={18} />
          {primaryButtonLabel}
        </button>

        <button
          type="button"
          onClick={onClose}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-slate-700 hover:bg-slate-600 text-sm font-medium text-slate-50 transition"
        >
          <ImagePlus size={18} />
          Gallery
        </button>
      </div>
    </div>
  );
};

export default CameraInput;
