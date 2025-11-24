
import React from 'react';
import { QRCodeCanvas } from 'qrcode.react';
import { PublicCompanyConfig } from '../config/companies';

const BASE_URL = 'https://app.movemate.ai';

interface Props {
  company: PublicCompanyConfig;
}

export const CompanyQrCard: React.FC<Props> = ({ company }) => {
  const url = `${BASE_URL}/c/${company.slug}`;

  return (
    <div className="border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-xl p-6 flex flex-col items-center gap-3 shadow-sm transition-all hover:shadow-md">
      <div className="text-sm font-bold text-slate-800 dark:text-slate-100">{company.name}</div>
      
      <div className="p-3 bg-white rounded-xl shadow-sm border border-slate-100">
        <QRCodeCanvas 
            value={url} 
            size={180} 
            includeMargin 
            bgColor="#ffffff"
            fgColor="#000000"
        />
      </div>
      
      <div className="text-xs text-slate-400 break-all text-center font-mono bg-slate-50 dark:bg-slate-900 p-2 rounded w-full select-all">
        {url}
      </div>
      
      <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-1 text-center leading-tight max-w-[240px]">
        Print this QR on flyers, trucks, or emails. Customers scan it to open
        a company-specific intake session with no login required.
      </p>
    </div>
  );
};
