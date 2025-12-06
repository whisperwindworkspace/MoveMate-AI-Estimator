import React, { useEffect, useRef } from 'react';
import QRCode from 'qrcode';

interface Props {
  name: string;
  url: string;
  description?: string;
  color?: string; // Hex color for the QR code
  logoUrl?: string; // URL for the center logo
}

export const CompanyQrCard: React.FC<Props> = ({ name, url, description, color = '#1e293b', logoUrl }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (canvasRef.current) {
        const renderQr = async () => {
            try {
                // Generate QR on Canvas
                await QRCode.toCanvas(canvasRef.current, url, {
                    width: 180,
                    margin: 2,
                    color: {
                        dark: color,
                        light: '#ffffff'
                    },
                    errorCorrectionLevel: 'H' // High error correction to support logo overlay
                });

                // Overlay Logo if provided
                if (logoUrl) {
                    const canvas = canvasRef.current;
                    if (!canvas) return;
                    const ctx = canvas.getContext('2d');
                    if (!ctx) return;

                    const img = new Image();
                    img.crossOrigin = "Anonymous";
                    img.src = logoUrl;
                    
                    img.onload = () => {
                        const logoSize = 40;
                        const x = (canvas.width - logoSize) / 2;
                        const y = (canvas.height - logoSize) / 2;

                        // Draw white background for logo visibility
                        ctx.fillStyle = '#ffffff';
                        ctx.fillRect(x - 2, y - 2, logoSize + 4, logoSize + 4);

                        // Draw Logo
                        ctx.drawImage(img, x, y, logoSize, logoSize);
                    };
                }
            } catch (err) {
                console.error("Failed to generate QR", err);
            }
        };

        renderQr();
    }
  }, [url, color, logoUrl]);

  return (
    <div className="border border-slate-200 dark:border-slate-700 rounded-xl p-4 flex flex-col items-center gap-3 shadow-sm transition-all hover:shadow-md bg-white dark:bg-slate-900 max-w-xs w-full">
      <div className="text-sm font-bold text-slate-800 dark:text-slate-100 text-center w-full truncate">
        {name}
      </div>

      <div className="p-4 bg-white rounded-xl shadow-sm border border-slate-100 flex items-center justify-center">
        <canvas ref={canvasRef} />
      </div>

      <div className="text-xs text-slate-400 break-all text-center bg-slate-50 dark:bg-slate-950 p-2 rounded w-full select-all border border-slate-100 dark:border-slate-800">
        {url}
      </div>

      <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-1 text-center leading-tight max-w-[240px]">
        {description ||
          'Scan to open company-specific inventory intake.'}
      </p>
    </div>
  );
};