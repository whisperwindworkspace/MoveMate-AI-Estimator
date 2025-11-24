import React from 'react';

interface Props {
  name: string;
  url: string;
  description?: string;
}

export const CompanyQrCard: React.FC<Props> = ({ name, url, description }) => {
  // Simple external QR generator – no extra React libs, no hooks
  const qrSrc = `https://api.qrserver.com/v1/create-qr-code/?size=256x256&data=${encodeURIComponent(
    url,
  )}`;

  return (
    <div className="border border-slate-200 dark:border-slate-700 rounded-xl p-4 flex flex-col items-center gap-3 shadow-sm transition-all hover:shadow-md bg-white dark:bg-slate-900 max-w-xs">
      <div className="text-sm font-bold text-slate-800 dark:text-slate-100 text-center">
        {name}
      </div>

      <div className="p-3 bg-white rounded-xl shadow-sm border border-slate-100">
        <img
          src={qrSrc}
          alt={`QR code for ${name}`}
          className="w-40 h-40"
        />
      </div>

      <div className="text-xs text-slate-400 break-all text-center bg-slate-50 dark:bg-slate-900 p-2 rounded w-full select-all">
        {url}
      </div>

      <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-1 text-center leading-tight max-w-[240px]">
        {description ||
          'Print this QR on flyers, trucks, or emails. Customers scan it to open a company-specific intake session.'}
      </p>
    </div>
  );
};
