
import React, { useState } from 'react';
import { Database, Copy, CheckCircle, RefreshCw, X } from 'lucide-react';

interface DatabaseSetupModalProps {
  onClose: () => void;
}

const SQL_SCRIPT = `
-- ==========================================
-- 1. FIX MISSING COLUMNS (RUN THIS FIRST!)
-- ==========================================
-- If your settings aren't saving, it's because these columns are missing.
ALTER TABLE companies ADD COLUMN IF NOT EXISTS admin_email text;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS crm_config jsonb;

-- ==========================================
-- 2. CREATE TABLES (If they don't exist)
-- ==========================================

-- Storage for images
insert into storage.buckets (id, name, public) values ('images', 'images', true) ON CONFLICT DO NOTHING;

-- Companies Table
create table if not exists companies (
  id uuid primary key default gen_random_uuid(),
  name text,
  admin_email text,
  crm_config jsonb,
  username text, -- legacy
  password text  -- legacy
);

-- Users Profile Table (Links Auth to Company)
create table if not exists users (
  id uuid primary key references auth.users(id) on delete cascade,
  company_id uuid references companies(id) on delete cascade,
  role text default 'COMPANY_ADMIN',
  created_at timestamptz default now()
);

-- Items Inventory Table
create table if not exists items (
  id uuid primary key default gen_random_uuid(),
  job_id text,
  name text,
  category text,
  quantity numeric default 1,
  volume_cu_ft numeric default 0,
  weight_lbs numeric default 0,
  tags text[],
  image_url text,
  confidence numeric default 1,
  selected boolean default true,
  disassembly text,
  created_at timestamptz default now()
);

-- Jobs History Table (For Statistics)
create table if not exists jobs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references companies(id) on delete set null,
  customer_name text,
  job_id_input text,
  total_volume numeric,
  total_weight numeric,
  item_count integer,
  crm_status text,
  created_at timestamptz default now()
);

-- ==========================================
-- 3. SECURITY POLICIES (RLS)
-- ==========================================
alter table items enable row level security;
alter table companies enable row level security;
alter table users enable row level security;
alter table storage.objects enable row level security;
alter table jobs enable row level security;

-- Allow public access for this demo app
create policy "Public Access Items" on items for all using (true) with check (true);
create policy "Public Access Companies" on companies for all using (true) with check (true);
create policy "Public Access Users" on users for all using (true) with check (true);
create policy "Public Access Storage" on storage.objects for all using (true) with check (true);
create policy "Public Access Jobs" on jobs for all using (true) with check (true);

-- ==========================================
-- 4. SEED DATA
-- ==========================================
INSERT INTO companies (name, admin_email, crm_config)
VALUES ('Super Admin', 'admin@movemate.ai', '{"provider": null, "isConnected": false}')
ON CONFLICT DO NOTHING;
`;

const DatabaseSetupModal: React.FC<DatabaseSetupModalProps> = ({ onClose }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(SQL_SCRIPT);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleRefresh = () => {
    window.location.reload();
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="max-w-2xl w-full bg-slate-800 rounded-2xl shadow-2xl border border-slate-700 overflow-hidden flex flex-col max-h-[90vh]">
        
        <div className="p-6 border-b border-slate-700 flex justify-between items-start">
          <div className="flex items-center gap-3 text-red-400">
            <Database size={32} />
            <div>
              <h1 className="text-xl font-bold text-white">Database Schema Update</h1>
              <p className="text-slate-400 text-sm mt-1">
                If data isn't saving, run this SQL in your Supabase Dashboard to fix missing columns.
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white p-1 hover:bg-slate-700 rounded-full transition">
            <X size={24} />
          </button>
        </div>

        <div className="flex-1 overflow-hidden relative group p-0">
          <div className="absolute top-4 right-4 z-10">
            <button 
              onClick={handleCopy}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                copied ? 'bg-green-500/20 text-green-400 border border-green-500/50' : 'bg-slate-700 hover:bg-slate-600 text-white border border-slate-600'
              }`}
            >
              {copied ? <CheckCircle size={14} /> : <Copy size={14} />}
              {copied ? 'Copied!' : 'Copy SQL'}
            </button>
          </div>
          <pre className="h-full overflow-auto p-6 bg-slate-950 text-slate-300 font-mono text-xs leading-relaxed selection:bg-blue-500/30 whitespace-pre-wrap">
            {SQL_SCRIPT}
          </pre>
        </div>

        <div className="p-6 border-t border-slate-700 bg-slate-800 flex justify-between items-center">
            <div className="text-xs text-slate-500">
                Supabase URL: {process.env.VITE_SUPABASE_URL ? 'Connected' : 'Missing Env Vars'}
            </div>
            <div className="flex gap-3">
              <button 
                  onClick={onClose}
                  className="px-4 py-2 text-slate-300 hover:text-white font-medium"
              >
                  Close
              </button>
              <button 
                  onClick={handleRefresh}
                  className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-5 py-2 rounded-xl font-bold transition-all shadow-lg shadow-blue-900/50"
              >
                  <RefreshCw size={18} /> Reload App
              </button>
            </div>
        </div>
      </div>
    </div>
  );
};

export default DatabaseSetupModal;
