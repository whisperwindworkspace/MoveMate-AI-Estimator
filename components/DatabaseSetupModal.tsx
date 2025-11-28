
import React, { useState } from 'react';
import { Database, Copy, CheckCircle, RefreshCw, X } from 'lucide-react';

interface DatabaseSetupModalProps {
  onClose: () => void;
}

const SQL_SCRIPT = `
-- ==========================================
-- 0. CLEANUP (Drop policies to prevent conflicts)
-- ==========================================
DROP POLICY IF EXISTS "Public Access Items" ON inventory_items;
DROP POLICY IF EXISTS "Public Access Companies" ON companies;
DROP POLICY IF EXISTS "Public Access Users" ON users;
DROP POLICY IF EXISTS "Public Access Storage" ON storage.objects;
DROP POLICY IF EXISTS "Public Access Jobs" ON jobs;
DROP POLICY IF EXISTS "public_insert_jobs" ON jobs;
DROP POLICY IF EXISTS "Enable insert for everyone" ON jobs;

-- ==========================================
-- 1. FIX MISSING COLUMNS
-- ==========================================
ALTER TABLE companies ADD COLUMN IF NOT EXISTS admin_email text;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS crm_config jsonb;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS usage_limit integer DEFAULT NULL;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS usage_count integer DEFAULT 0;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS slug text;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS primary_color text DEFAULT '#2563eb';
ALTER TABLE companies ADD COLUMN IF NOT EXISTS logo_url text;

ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS selected boolean DEFAULT true;
ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS disassembly text;
ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS confidence numeric DEFAULT 1;

ALTER TABLE jobs ADD COLUMN IF NOT EXISTS customer_email text;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS customer_phone text;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS move_date date;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS origin_address text;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS destination_address text;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS status text;

-- ==========================================
-- 2. CREATE TABLES (If they don't exist)
-- ==========================================

insert into storage.buckets (id, name, public) values ('images', 'images', true) ON CONFLICT DO NOTHING;

create table if not exists companies (
  id uuid primary key default gen_random_uuid(),
  name text,
  slug text unique,
  admin_email text,
  crm_config jsonb,
  username text,
  password text,
  usage_limit integer,
  usage_count integer default 0,
  primary_color text default '#2563eb',
  logo_url text
);

create table if not exists users (
  id uuid primary key references auth.users(id) on delete cascade,
  company_id uuid references companies(id) on delete cascade,
  role text default 'COMPANY_ADMIN',
  created_at timestamptz default now()
);

create table if not exists inventory_items (
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

create table if not exists jobs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references companies(id) on delete set null,
  customer_name text,
  customer_email text,
  customer_phone text,
  move_date date,
  origin_address text,
  destination_address text,
  status text,
  job_id_input text,
  total_volume numeric,
  total_weight numeric,
  item_count integer,
  crm_status text,
  created_at timestamptz default now()
);

-- ==========================================
-- 3. FUNCTIONS (RPC)
-- ==========================================

-- Function to safely increment usage count atomically
CREATE OR REPLACE FUNCTION increment_usage_count(row_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE companies
  SET usage_count = COALESCE(usage_count, 0) + 1
  WHERE id = row_id;
END;
$$;

-- Function to upsert inventory items securely
CREATE OR REPLACE FUNCTION anon_upsert_inventory_item(
  p_id uuid,
  p_job_id text,
  p_name text,
  p_quantity numeric,
  p_volume_cuft numeric,
  p_weight_lbs numeric,
  p_category text,
  p_tags text[],
  p_is_fragile boolean,
  p_is_heavy boolean,
  p_confidence numeric
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO inventory_items (
    id, job_id, name, quantity, volume_cu_ft, weight_lbs, category, tags, confidence, selected
  ) VALUES (
    p_id, p_job_id, p_name, p_quantity, p_volume_cuft, p_weight_lbs, p_category, p_tags, p_confidence, true
  )
  ON CONFLICT (id) DO UPDATE SET
    job_id = EXCLUDED.job_id,
    name = EXCLUDED.name,
    quantity = EXCLUDED.quantity,
    volume_cu_ft = EXCLUDED.volume_cu_ft,
    weight_lbs = EXCLUDED.weight_lbs,
    category = EXCLUDED.category,
    tags = EXCLUDED.tags,
    confidence = EXCLUDED.confidence;
END;
$$;

-- ==========================================
-- 4. SECURITY POLICIES (RLS) & PERMISSIONS
-- ==========================================
alter table inventory_items enable row level security;
alter table companies enable row level security;
alter table users enable row level security;
alter table storage.objects enable row level security;
alter table jobs enable row level security;

-- PERMISSIONS (Crucial for anon access)
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION increment_usage_count TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION anon_upsert_inventory_item TO anon, authenticated, service_role;

-- POLICIES (Re-create strict but functional policies)
create policy "Public Access Items" on inventory_items for all using (true) with check (true);
create policy "Public Access Companies" on companies for all using (true) with check (true);
create policy "Public Access Users" on users for all using (true) with check (true);
create policy "Public Access Storage" on storage.objects for all using (true) with check (true);

-- CRITICAL: Allow anonymous users to insert jobs for submission
create policy "Enable insert for everyone" on jobs for insert with check (true);
create policy "Enable read for everyone" on jobs for select using (true);
create policy "Enable update for everyone" on jobs for update using (true);

-- ==========================================
-- 5. SEED DATA
-- ==========================================
INSERT INTO companies (name, slug, admin_email, crm_config)
VALUES ('Super Admin', 'super-admin', 'admin@movemate.ai', '{"provider": null, "isConnected": false}')
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
                Run this updated SQL script to fix permissions and submission tracking.
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
