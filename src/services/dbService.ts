
import { supabase } from './supabaseClient';
import { InventoryItem, CompanyProfile, JobRecord, AppSettings } from '../types';

// --- Mappers ---
const mapDbItemToApp = (dbItem: any): InventoryItem => ({
  id: dbItem.id,
  name: dbItem.name || 'Unknown Item',
  quantity: Number(dbItem.quantity) || 1,
  // inventory_items uses volume_cu_ft; fall back to volume_cu_ft for legacy rows
  volumeCuFt: Number(dbItem.volume_cu_ft ?? dbItem.volume_cuft ?? 0),
  weightLbs: Number(dbItem.weight_lbs) || 0,
  category: dbItem.category || 'Misc',
  tags: Array.isArray(dbItem.tags) ? dbItem.tags : [],
  imageUrl: dbItem.image_url || undefined,
  selected: dbItem.selected ?? true,
  confidence: dbItem.confidence ?? 1.0,
  disassembly: dbItem.disassembly || undefined,
});

const mapAppItemToDb = (item: InventoryItem, jobId: string) => ({
  id: item.id, // Keep UUID stable
  job_id: jobId,
  name: item.name,
  quantity: item.quantity,
  volume_cu_ft: item.volumeCuFt,
  weight_lbs: item.weightLbs,
  category: item.category,
  tags: item.tags,
  image_url: item.imageUrl ?? null,
  selected: item.selected,
  confidence: item.confidence,
  disassembly: item.disassembly ?? null,
});

// Utility to generate UUID
const generateUUID = () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (globalThis.crypto || (globalThis as any).msCrypto).randomUUID();
};

// Small helper to validate uuids
const isValidUUID = (uuid: string | null | undefined): uuid is string => {
  if (!uuid) return false;
  const regex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return regex && regex.test(uuid);
};

// --- Services ---

export const dbService = {
  // Always return false to enforce online mode
  isOffline() {
    return false;
  },

  // CHECK CONNECTION
  async checkConnection() {
    try {
      const { error } = await supabase.from('companies').select('id').limit(1);
      if (error) {
        console.error('checkConnection DB error:', JSON.stringify(error, null, 2));
        return false;
      }
      return true;
    } catch (e) {
      console.error('checkConnection exception:', e);
      return false;
    }
  },

  // INVENTORY ITEMS

  async fetchInventoryItems(jobId: string): Promise<InventoryItem[]> {
    try {
      const { data, error } = await supabase
        .from('inventory_items')
        .select('*')
        .eq('job_id', jobId)
        .order('created_at', { ascending: true });

      if (error) {
        console.error('fetchInventoryItems error', JSON.stringify(error, null, 2));
        throw error;
      }

      return (data || []).map(mapDbItemToApp);
    } catch (e) {
      console.error('fetchInventoryItems exception', e);
      throw e;
    }
  },

  async getItems(jobId: string): Promise<InventoryItem[]> {
    return this.fetchInventoryItems(jobId);
  },

  async upsertItem(item: InventoryItem, jobId: string): Promise<InventoryItem> {
    return this.upsertInventoryItem(jobId, item);
  },

  async upsertInventoryItem(jobId: string, item: InventoryItem): Promise<InventoryItem> {
    // Normalize: ensure id
    if (!item.id) {
      item.id = generateUUID();
    }

    try {
      const payload = mapAppItemToDb(item, jobId);

      // Direct table upsert
      const { error } = await supabase.from('inventory_items').upsert(payload);

      if (error) {
        throw error;
      }

      return item;
    } catch (e: any) {
      // Handle Schema Cache Error with Self-Healing logic
      if (e?.code === 'PGRST204') {
         console.warn("PGRST204 detected: Schema cache stale. Attempting auto-heal via reload_schema_cache...");
         
         try {
             const { error: rpcError } = await supabase.rpc('reload_schema_cache');
             
             if (!rpcError) {
                 console.log("Schema cache reloaded successfully. Retrying upsert...");
                 // Retry the upsert operation once
                 const payload = mapAppItemToDb(item, jobId);
                 const { error: retryError } = await supabase.from('inventory_items').upsert(payload);
                 
                 if (!retryError) {
                     console.log("Upsert succeeded after auto-heal.");
                     return item;
                 } else {
                     console.error("Retry failed:", JSON.stringify(retryError, null, 2));
                 }
             } else {
                 console.error("Auto-heal failed (RPC likely missing):", JSON.stringify(rpcError, null, 2));
             }
         } catch (healEx) {
             console.error("Exception during auto-heal:", healEx);
         }

         const msg = "Database schema cache is stale. 'selected' column missing. Please ask Admin to run 'NOTIFY pgrst, 'reload config';' in SQL Editor.";
         // Throw a standard Error object so it prints nicely in console
         throw new Error(msg);
      }
      
      console.error('upsertInventoryItem exception:', JSON.stringify(e, null, 2));
      throw e; 
    }
  },

  async deleteInventoryItem(jobId: string, itemId: string): Promise<void> {
    try {
      const { error } = await supabase
        .from('inventory_items')
        .delete()
        .eq('job_id', jobId)
        .eq('id', itemId);

      if (error) {
        console.error('deleteInventoryItem error', JSON.stringify(error, null, 2));
        throw error;
      }
    } catch (e) {
      console.error('deleteInventoryItem exception', e);
      throw e;
    }
  },

  async deleteItem(id: string): Promise<void> {
    try {
      const { error } = await supabase.from('inventory_items').delete().eq('id', id);
      if (error) throw error;
    } catch (e) {
      console.error('deleteItem error', e);
      throw e;
    }
  },

  async updateJobId(oldId: string, newId: string): Promise<void> {
    try {
      const { error } = await supabase.from('inventory_items').update({ job_id: newId }).eq('job_id', oldId);
      if (error) throw error;
    } catch (e) {
      console.error('updateJobId error', e);
      throw e;
    }
  },

  // COMPANIES

  async getCompanies(): Promise<CompanyProfile[]> {
    try {
      const { data, error } = await supabase.from('companies').select('*');

      if (error) {
        console.error('getCompanies error', JSON.stringify(error, null, 2));
        throw error;
      }

      return (data || []).map((c: any) => ({
        id: c.id,
        name: c.name,
        slug: c.slug,
        usageLimit: c.usage_limit ?? null,
        usageCount: c.usage_count ?? 0,
        adminEmail: c.admin_email ?? '',
        crmConfig: c.crm_config ?? null,
        primaryColor: c.primary_color ?? '#2563eb',
        logoUrl: c.logo_url ?? '',
      }));
    } catch (e) {
      console.error('getCompanies exception', e);
      throw e;
    }
  },

  async getAllCompanies(): Promise<CompanyProfile[]> {
    return this.getCompanies();
  },

  async getCompanyPublicProfile(idOrSlug: string): Promise<CompanyProfile | null> {
    try {
      const query = supabase.from('companies').select('*').limit(1);
      let finalQuery = query;

      if (isValidUUID(idOrSlug)) {
        finalQuery = finalQuery.eq('id', idOrSlug);
      } else {
        finalQuery = finalQuery.eq('slug', idOrSlug);
      }

      const { data, error } = await finalQuery.single();

      if (error) {
        // Not found or error
        return null;
      }

      const c = data as any;

      return {
        id: c.id,
        name: c.name,
        slug: c.slug,
        usageLimit: c.usage_limit ?? null,
        usageCount: c.usage_count ?? 0,
        adminEmail: c.admin_email ?? '',
        crmConfig: c.crm_config ?? null,
        primaryColor: c.primary_color ?? '#2563eb',
        logoUrl: c.logo_url ?? '',
      };
    } catch (e) {
      console.error('getCompanyPublicProfile exception', e);
      return null;
    }
  },

  async getCompanyBySlug(slug: string): Promise<CompanyProfile | null> {
    try {
      const { data, error } = await supabase
        .from('companies')
        .select('*')
        .eq('slug', slug)
        .maybeSingle();

      if (error) {
        console.error('getCompanyBySlug error', JSON.stringify(error, null, 2));
        return null;
      }

      if (!data) return null;

      const c = data as any;
      return {
        id: c.id,
        name: c.name,
        slug: c.slug,
        usageLimit: c.usage_limit ?? null,
        usageCount: c.usage_count ?? 0,
        adminEmail: c.admin_email ?? '',
        crmConfig: c.crm_config ?? null,
        primaryColor: c.primary_color ?? '#2563eb',
        logoUrl: c.logo_url ?? '',
      };
    } catch (e) {
      console.error('getCompanyBySlug exception', e);
      return null;
    }
  },

  async incrementCompanyUsage(companyId: string): Promise<void> {
    // Deprecated: Usage is now incremented via DB Trigger (handle_new_job) on insert.
    // Keeping this function only for legacy/manual admin usage if needed.
    console.warn("incrementCompanyUsage called manually. This should be handled by DB Trigger now.");
  },
  
  async loginCompany(u: string, p: string): Promise<CompanyProfile | null> {
    // Only used for offline mode mock login. 
    // Since we are strictly online, this is not used.
    return null;
  },
  
  async createCompany(partial: Partial<CompanyProfile>): Promise<CompanyProfile> {
      const { data, error } = await supabase.from('companies').insert({
          name: partial.name,
          slug: partial.slug,
          admin_email: partial.adminEmail,
          crm_config: partial.crmConfig,
          usage_limit: partial.usageLimit,
          primary_color: partial.primaryColor,
          username: partial.username,
          password: partial.password
      }).select().single();
      
      if (error) throw error;
      
      return {
          id: data.id,
          name: data.name,
          slug: data.slug,
          adminEmail: data.admin_email,
          crmConfig: data.crm_config,
          usageLimit: data.usage_limit,
          usageCount: data.usage_count,
          primaryColor: data.primary_color,
          logoUrl: data.logo_url
      } as CompanyProfile;
  },
  
  async deleteCompany(id: string): Promise<void> {
      const { error } = await supabase.from('companies').delete().eq('id', id);
      if (error) throw error;
  },
  
  async updateCompanySettings(id: string, settings: Partial<AppSettings>): Promise<void> {
      const { error } = await supabase.from('companies').update({
          admin_email: settings.adminEmail,
          crm_config: settings.crmConfig,
          primary_color: settings.primaryColor,
          logo_url: settings.logoUrl
      }).eq('id', id);
      if (error) throw error;
  },
  
  async updateCompanyLimit(id: string, limit: number | null): Promise<void> {
      const { error } = await supabase.from('companies').update({ usage_limit: limit }).eq('id', id);
      if (error) throw error;
  },

  // JOBS

  async createJob(job: Partial<JobRecord>): Promise<JobRecord> {
    console.log('dbService: createJob called', job);
    if (!job.company_id || !isValidUUID(job.company_id)) {
      const msg = 'createJob called without valid company_id; no job will be created.';
      console.error(msg, job);
      throw new Error(msg);
    }
    
    // SERVER-SIDE LIMIT CHECK (Double Protection)
    const companyProfile = await this.getCompanyPublicProfile(job.company_id);
    if (companyProfile && companyProfile.usageLimit !== null && companyProfile.usageLimit !== undefined) {
        if ((companyProfile.usageCount || 0) >= companyProfile.usageLimit) {
             const msg = `Usage Limit Reached for Company ${companyProfile.name}. Submission Rejected.`;
             console.error(msg);
             throw new Error(msg);
        }
    }

    const id = job.id ?? generateUUID();
    const payload: any = {
      ...job,
      id,
    };
    
    console.log('dbService: inserting job payload', payload);

    try {
      const { error } = await supabase.from('jobs').insert(payload);

      if (error) {
        console.error('Create Job Error', JSON.stringify(error, null, 2));
        throw error;
      }

      console.log('Job created successfully. DB Trigger will increment usage.');
      
      // Removed manual incrementCompanyUsage call to avoid double counting.
      // The DB trigger 'on_job_created' handles this atomically.

      const newJob: JobRecord = {
        ...(payload as any),
        created_at: (payload as any).created_at ?? new Date().toISOString(),
      };

      return newJob;
    } catch (e) {
      console.error('Create Job Exception', JSON.stringify(e, null, 2));
      throw e;
    }
  },

  async fetchJobsForCompany(companyId: string): Promise<JobRecord[]> {
    if (!isValidUUID(companyId)) {
      console.warn('fetchJobsForCompany called with invalid companyId', companyId);
      return [];
    }

    try {
      const { data, error } = await supabase
        .from('jobs')
        .select('*')
        .eq('company_id', companyId)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('fetchJobsForCompany error', JSON.stringify(error, null, 2));
        throw error;
      }

      return (data || []) as JobRecord[];
    } catch (e) {
      console.error('fetchJobsForCompany exception', e);
      throw e;
    }
  },
  
  async getCompanyJobs(companyId: string): Promise<JobRecord[]> {
      return this.fetchJobsForCompany(companyId);
  },

  async fetchJobById(jobId: string): Promise<JobRecord | null> {
    if (!isValidUUID(jobId)) {
      console.warn('fetchJobById called with invalid jobId', jobId);
      return null;
    }

    try {
      const { data, error } = await supabase
        .from('jobs')
        .select('*')
        .eq('id', jobId)
        .maybeSingle();

      if (error) {
        console.error('fetchJobById error', JSON.stringify(error, null, 2));
        throw error;
      }

      return (data as JobRecord) || null;
    } catch (e) {
      console.error('fetchJobById exception', e);
      throw e;
    }
  },

  async uploadImage(base64Data: string): Promise<string> {
    try {
      const byteCharacters = atob(base64Data);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], { type: 'image/jpeg' });
      const fileName = `upload-${Date.now()}-${Math.random()
        .toString(36)
        .substring(7)}.jpg`;

      const { error } = await supabase.storage.from('images').upload(fileName, blob);

      if (error) {
        console.warn('Storage upload failed, falling back to local base64', error.message);
        return `data:image/jpeg;base64,${base64Data}`;
      }

      const {
        data: { publicUrl },
      } = supabase.storage.from('images').getPublicUrl(fileName);

      return publicUrl;
    } catch (e) {
      console.error('Upload exception', e);
      return `data:image/jpeg;base64,${base64Data}`;
    }
  },
};