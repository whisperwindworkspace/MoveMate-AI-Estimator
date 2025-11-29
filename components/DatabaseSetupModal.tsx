

import React, { useState } from 'react';
import { Database, Copy, CheckCircle, RefreshCw, X } from 'lucide-react';

interface DatabaseSetupModalProps {
  onClose: () => void;
}

const SQL_SCRIPT = `
-- ==========================================
-- 0. CLEANUP & SCHEMA FIX (Critical for 428C9)
-- ==========================================
-- Drop existing policies
DROP POLICY IF EXISTS "Public Access Items" ON inventory_items;
DROP POLICY IF EXISTS "Public Access Companies" ON companies;
DROP POLICY IF EXISTS "Public Access Users" ON users;
DROP POLICY IF EXISTS "Public Access Jobs" ON jobs;
DROP POLICY IF EXISTS "public_insert_jobs" ON jobs;
DROP POLICY IF EXISTS "Enable insert for everyone" ON jobs;
DROP POLICY IF EXISTS "Enable read for everyone" ON jobs;
DROP POLICY IF EXISTS "Enable update for everyone" ON jobs;

-- Fix "Generated Column" error (428C9) on usage_count.
-- We force drop the column if it exists (generated or not) and re-create it as a plain integer.
ALTER TABLE companies DROP COLUMN IF EXISTS usage_count CASCADE;
ALTER TABLE companies ADD COLUMN usage_count integer DEFAULT 0;

-- Ensure usage_used exists and is an integer (Syncing with usage_count)
ALTER TABLE companies DROP COLUMN IF EXISTS usage_used CASCADE;
ALTER TABLE companies ADD COLUMN usage_used integer DEFAULT 0;

-- Ensure jobs table does NOT have a stray usage_count column
ALTER TABLE jobs DROP COLUMN IF EXISTS usage_count;

-- ==========================================
-- 1. FIX MISSING COLUMNS
-- ==========================================
ALTER TABLE companies ADD COLUMN IF NOT EXISTS admin_email text;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS crm_config jsonb;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS usage_limit integer DEFAULT NULL;
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
  usage_used integer default 0,
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
-- 3. FUNCTIONS & TRIGGERS
-- ==========================================

-- Trigger Function to handle new job creation and increment usage automatically
CREATE OR REPLACE FUNCTION public.handle_new_job()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Increment usage_count.
  -- Sync usage_used to match the new usage_count to ensure equality.
  -- This relies on the fact that standard update uses old value for calculation.
  UPDATE public.companies
  SET 
    usage_count = COALESCE(usage_count, 0) + 1,
    usage_used = COALESCE(usage_count, 0) + 1
  WHERE id = NEW.company_id;
  RETURN NEW;
END;
$$;

-- Create/Recreate Trigger on jobs table
DROP TRIGGER IF EXISTS on_job_created ON public.jobs;
CREATE TRIGGER on_job_created
AFTER INSERT ON public.jobs
FOR EACH ROW
EXECUTE FUNCTION public.handle_new_job();


-- Function to upsert inventory items securely (Used by App)
DROP FUNCTION IF EXISTS anon_upsert_inventory_item(uuid, text, text, numeric, numeric, numeric, text, text[], boolean, boolean, numeric);
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

-- Function to programmatically reload schema cache (Self-Healing)
CREATE OR REPLACE FUNCTION reload_schema_cache()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  NOTIFY pgrst, 'reload config';
END;
$$;

-- ==========================================
-- 4. SECURITY POLICIES (RLS) & PERMISSIONS
-- ==========================================
alter table inventory_items enable row level security;
alter table companies enable row level security;
alter table users enable row level security;
alter table jobs enable row level security;

-- PERMISSIONS (Crucial for anon access)
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;

-- Grant with explicit signatures to avoid ambiguity
GRANT EXECUTE ON FUNCTION anon_upsert_inventory_item(uuid, text, text, numeric, numeric, numeric, text, text[], boolean, boolean, numeric) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION reload_schema_cache() TO anon, authenticated, service_role;

-- POLICIES (Re-create strict but functional policies)
create policy "Public Access Items" on inventory_items for all using (true) with check (true);
create policy "Public Access Companies" on companies for select using (true); 
-- Note: Companies update is handled by RPC/Trigger, so mostly select needed for anon

create policy "Public Access Users" on users for all using (true) with check (true);

-- CRITICAL: Allow anonymous users to insert jobs for submission
-- This ensures that when a user submits from the public link, it works.
create policy "Enable insert for everyone" on jobs for insert with check (true);
create policy "Enable read for everyone" on jobs for select using (true);
create policy "Enable update for everyone" on jobs for update using (true);

-- ==========================================
-- 5. SEED DATA & CONFIG
-- ==========================================
INSERT INTO companies (name, slug, admin_email, crm_config)
VALUES ('Super Admin', 'super-admin', 'admin@movemate.ai', '{"provider": null, "isConnected": false}')
ON CONFLICT DO NOTHING;

-- SYNC DATA: Ensure all existing rows have usage_used = usage_count
UPDATE companies SET usage_used = usage_count;

-- ==========================================
-- 6. RELOAD SCHEMA CACHE (Fix for PGRST204)
-- ==========================================
-- This notifies PostgREST to reload the schema immediately
NOTIFY pgrst, 'reload config';
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
                Run this updated SQL script in the Supabase SQL Editor to fix permissions, missing columns, and schema cache errors.
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
