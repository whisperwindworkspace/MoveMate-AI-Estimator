
import React, { useState, useEffect } from 'react';

interface LoadingOverlayProps {
  message?: string;
}

const LoadingOverlay: React.FC<LoadingOverlayProps> = ({ message = "Please wait while we add the items to the list, this will take a few seconds" }) => {
  const [loadingDots, setLoadingDots] = useState('.');

  useEffect(() => {
    let step = 0;
    // Sequence: 1 dot, 2 dots, 3 dots, 2 dots... repeat
    const states = ['.', '..', '...', '..'];
    const interval = setInterval(() => {
        step = (step + 1) % states.length;
        setLoadingDots(states[step]);
    }, 400);
    return () => clearInterval(interval);
  }, []);

  return (
     <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-black/60 backdrop-blur-sm rounded-2xl p-6 text-center text-white animate-in fade-in duration-200">
         <p className="text-sm font-medium leading-relaxed max-w-[280px]">
            {message}
         </p>
         <span className="text-3xl font-bold tracking-widest text-blue-400 min-h-[2.5rem] mt-2">
            {loadingDots}
         </span>
     </div>
  );
};

export default LoadingOverlay;
