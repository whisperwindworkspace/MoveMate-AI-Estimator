
import { supabase } from './supabaseClient';
import { InventoryItem, CompanyProfile, JobRecord } from '../types';

// --- Offline Storage (Memory) ---
let isOfflineMode = false;
let memItems: any[] = [];
let memCompanies: any[] = [];
let memJobs: any[] = [];

// --- Mappers ---
const mapDbItemToApp = (dbItem: any): InventoryItem => ({
  id: dbItem.id,
  name: dbItem.name || 'Unknown Item',
  quantity: Number(dbItem.quantity) || 1,
  // inventory_items uses volume_cuft; fall back to volume_cu_ft for legacy rows
  volumeCuFt: Number(dbItem.volume_cuft ?? dbItem.volume_cu_ft ?? 0),
  weightLbs: Number(dbItem.weight_lbs) || 0,
  category: dbItem.category || 'Misc',
  tags: Array.isArray(dbItem.tags) ? dbItem.tags : [],
  // inventory_items does not store these; we just provide defaults for the UI
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
  // match the actual column name on inventory_items
  volume_cuft: item.volumeCuFt,
  weight_lbs: item.weightLbs,
  category: item.category,
  tags: item.tags,
  // map tags into the booleans that exist on inventory_items
  is_fragile: item.tags?.includes('Fragile') ?? false,
  is_heavy: item.tags?.includes('Heavy') ?? false,
  confidence: item.confidence,
});

// Very lightweight UUID guard so we don't blow up Supabase on bad IDs
const isValidUUID = (uuid: string) => {
  const regex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return regex && regex.test(uuid);
};

// --- Services ---

export const dbService = {
  isOffline() {
    return isOfflineMode;
  },

  // CHECK CONNECTION / MODE SWITCH

  async checkConnection() {
    try {
      const { error } = await supabase.from('companies').select('id').limit(1);
      if (error) throw error;
      isOfflineMode = false;
      return true;
    } catch (e) {
      console.warn('Falling back to offline mode:', e);
      isOfflineMode = true;
      return false;
    }
  },

  // INVENTORY ITEMS

  async getItemsForJob(jobId: string): Promise<InventoryItem[]> {
    if (isOfflineMode) {
      return memItems.filter(i => i.job_id === jobId).map(mapDbItemToApp);
    }

    if (!isValidUUID(jobId)) {
      console.warn('getItemsForJob called with non-UUID jobId, returning empty list:', jobId);
      return [];
    }

    const { data, error } = await supabase
      .from('inventory_items')
      .select('*')
      .eq('job_id', jobId)
      .order('created_at', { ascending: true });

    if (error || !data) {
      console.error('getItemsForJob error', error);
      return [];
    }

    return data.map(mapDbItemToApp);
  },

  async upsertItem(item: InventoryItem, jobId: string | null): Promise<InventoryItem> {
    if (!jobId) {
      // No job yet; we treat items as transient until a job exists
      return item;
    }

    if (isOfflineMode) {
      const existingIndex = memItems.findIndex(i => i.id === item.id);
      if (existingIndex >= 0) {
        memItems[existingIndex] = {
          ...memItems[existingIndex],
          ...mapAppItemToDb(item, jobId),
        };
      } else {
        memItems.push(mapAppItemToDb(item, jobId));
      }
      return item;
    }

    try {
      // Use the SECURITY DEFINER RPC to bypass RLS weirdness on inventory_items
      const { error } = await supabase.rpc('anon_upsert_inventory_item', {
        p_id: item.id,
        p_job_id: jobId,
        p_name: item.name,
        p_quantity: item.quantity,
        p_volume_cuft: item.volumeCuFt,
        p_weight_lbs: item.weightLbs,
        p_category: item.category,
        p_tags: item.tags,
        p_is_fragile: item.tags?.includes('Fragile') ?? false,
        p_is_heavy: item.tags?.includes('Heavy') ?? false,
        p_confidence: item.confidence,
      });

      if (error) {
          // Fallback to standard upsert if RPC missing or failed
          // This ensures data is saved even if the SQL script hasn't been fully run
          console.warn("RPC upsert failed, trying standard upsert", error);
          const { error: upsertError } = await supabase.from('inventory_items').upsert({
               id: item.id,
               job_id: jobId,
               name: item.name,
               quantity: item.quantity,
               volume_cu_ft: item.volumeCuFt,
               weight_lbs: item.weightLbs,
               category: item.category,
               tags: item.tags,
               confidence: item.confidence,
               selected: item.selected
          });
          if (upsertError) throw upsertError;
      }
      return item;
    } catch (e) {
      console.error('upsertItem error', e);
      return item;
    }
  },

  async deleteItem(id: string): Promise<void> {
    if (isOfflineMode) {
      memItems = memItems.filter(i => i.id !== id);
      return;
    }

    if (!isValidUUID(id)) {
      console.warn('deleteItem called with non-UUID id:', id);
      return;
    }

    const { error } = await supabase.from('inventory_items').delete().eq('id', id);
    if (error) {
      console.error('deleteItem error', error);
    }
  },

  async clearItemsForJob(jobId: string): Promise<void> {
    if (isOfflineMode) {
      memItems = memItems.filter(i => i.job_id !== jobId);
      return;
    }

    if (!isValidUUID(jobId)) {
      console.warn('clearItemsForJob called with non-UUID jobId:', jobId);
      return;
    }

    const { error } = await supabase.from('inventory_items').delete().eq('job_id', jobId);
    if (error) {
      console.error('clearItemsForJob error', error);
    }
  },

  async getItems(jobId: string): Promise<InventoryItem[]> {
    return this.getItemsForJob(jobId);
  },

  async updateJobId(oldId: string, newId: string) {
    // This helper is used in App.tsx when changing job ID
    // We need to move items from oldId to newId
    const items = await this.getItemsForJob(oldId);
    for (const item of items) {
      await this.upsertItem(item, newId);
    }
    await this.clearItemsForJob(oldId);
  },

  // COMPANIES / TENANTS

  async getCompanyPublicProfile(id: string): Promise<CompanyProfile | null> {
    if (isOfflineMode) {
      const found = memCompanies.find(c => c.id === id);
      if (!found) return null;
      return {
        id: found.id,
        name: found.name,
        username: found.username,
        password: found.password,
        adminEmail: found.admin_email,
        crmConfig: found.crm_config,
        usageLimit: found.usage_limit,
        usageCount: found.usage_used,
        primaryColor: found.primary_color,
        logoUrl: found.logo_url,
      };
    }

    try {
      const { data, error } = await supabase
        .from('companies')
        .select('*')
        .eq('id', id)
        .single();

      if (error || !data) return null;

      return {
        id: data.id,
        name: data.name,
        username: data.username,
        password: data.password,
        adminEmail: data.admin_email,
        crmConfig: data.crm_config || {
          provider: null,
          isConnected: false,
          apiKey: '',
        },
        usageLimit: data.usage_limit,
        usageCount: data.usage_count || data.usage_used || 0,
        primaryColor: data.primary_color,
        logoUrl: data.logo_url,
      };
    } catch (e) {
      console.error('Get company profile exception:', e);
      return null;
    }
  },

  async getCompanyBySlug(slug: string): Promise<CompanyProfile | null> {
    if (isOfflineMode) {
      const found = memCompanies.find(c => c.slug === slug);
      if (!found) return null;
      return {
        id: found.id,
        name: found.name,
        slug: found.slug,
        username: found.username,
        password: found.password,
        adminEmail: found.admin_email,
        crmConfig: found.crm_config,
        usageLimit: found.usage_limit,
        usageCount: found.usage_used,
        primaryColor: found.primary_color,
        logoUrl: found.logo_url,
      };
    }

    try {
      const { data, error } = await supabase
        .from('companies')
        .select('*')
        .eq('slug', slug)
        .single();

      if (error || !data) return null;

      return {
        id: data.id,
        name: data.name,
        slug: data.slug,
        username: data.username,
        password: data.password,
        adminEmail: data.admin_email,
        crmConfig: data.crm_config || {
          provider: null,
          isConnected: false,
          apiKey: '',
        },
        usageLimit: data.usage_limit,
        usageCount: data.usage_count || data.usage_used || 0,
        primaryColor: data.primary_color,
        logoUrl: data.logo_url,
      };
    } catch (e) {
      console.error('Get company by slug exception:', e);
      return null;
    }
  },

  async getAllCompanies(): Promise<CompanyProfile[]> {
    if (isOfflineMode) {
      return memCompanies.map(c => ({
        id: c.id,
        name: c.name,
        slug: c.slug,
        username: c.username,
        password: c.password,
        adminEmail: c.admin_email,
        crmConfig: c.crm_config,
        usageLimit: c.usage_limit,
        usageCount: c.usage_used,
        primaryColor: c.primary_color,
        logoUrl: c.logo_url,
      }));
    }

    try {
      const { data, error } = await supabase.from('companies').select('*');
      if (error || !data) return [];
      return data.map(c => ({
        id: c.id,
        name: c.name,
        slug: c.slug,
        username: c.username,
        password: c.password,
        adminEmail: c.admin_email,
        crmConfig: c.crm_config || {
          provider: null,
          isConnected: false,
          apiKey: '',
        },
        usageLimit: c.usage_limit,
        usageCount: c.usage_count || c.usage_used || 0,
        primaryColor: c.primary_color,
        logoUrl: c.logo_url,
      }));
    } catch (e) {
      return [];
    }
  },

  async createCompany(company: Partial<CompanyProfile>) {
    if (isOfflineMode) {
      const newComp = {
        id: crypto.randomUUID(),
        name: company.name,
        slug: company.slug,
        username: company.username,
        password: company.password,
        admin_email: company.adminEmail,
        crm_config: company.crmConfig,
        usage_limit: company.usageLimit,
        usage_used: 0,
        primary_color: company.primaryColor,
      };
      memCompanies.push(newComp);
      return newComp;
    }

    try {
      const { data, error } = await supabase
        .from('companies')
        .insert({
          name: company.name,
          slug: company.slug,
          username: company.username,
          password: company.password,
          admin_email: company.adminEmail,
          crm_config: company.crmConfig,
          usage_limit: company.usageLimit,
          usage_count: 0,
          primary_color: company.primaryColor,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (e) {
      console.error('Create company error', e);
    }
  },

  async deleteCompany(id: string) {
    if (isOfflineMode) {
      memCompanies = memCompanies.filter(c => c.id !== id);
      return;
    }
    const { error } = await supabase.from('companies').delete().eq('id', id);
    if (error) throw error;
  },

  async loginCompany(username: string, password: string): Promise<CompanyProfile | null> {
    // Only used in offline mode emulation for login
    if (isOfflineMode) {
      const found = memCompanies.find(
        c => c.username === username && c.password === password,
      );
      if (found) {
        return {
          id: found.id,
          name: found.name,
          adminEmail: found.admin_email,
          crmConfig: found.crm_config,
        } as CompanyProfile;
      }
    }
    return null;
  },

  async updateCompanySettings(id: string, updates: Partial<CompanyProfile>) {
    if (isOfflineMode) {
      const idx = memCompanies.findIndex(c => c.id === id);
      if (idx < 0) return;

      if (updates.adminEmail) memCompanies[idx].admin_email = updates.adminEmail;
      if (updates.crmConfig) memCompanies[idx].crm_config = updates.crmConfig;
      if (updates.primaryColor) memCompanies[idx].primary_color = updates.primaryColor;
      if (updates.logoUrl) memCompanies[idx].logo_url = updates.logoUrl;
      return;
    }

    const payload: any = {};
    if (updates.adminEmail !== undefined) payload.admin_email = updates.adminEmail;
    if (updates.crmConfig !== undefined) payload.crm_config = updates.crmConfig;
    if (updates.primaryColor !== undefined) payload.primary_color = updates.primaryColor;
    if (updates.logoUrl !== undefined) payload.logo_url = updates.logoUrl;

    if (Object.keys(payload).length === 0) return;

    const { error } = await supabase.from('companies').update(payload).eq('id', id);
    if (error) {
      console.error('updateCompanySettings error', error);
    }
  },

  async updateCompanyUsageLimit(id: string, usageLimit: number | null) {
    if (isOfflineMode) {
      const idx = memCompanies.findIndex(c => c.id === id);
      if (idx < 0) return;
      memCompanies[idx].usage_limit = usageLimit;
      return;
    }

    const { error } = await supabase
      .from('companies')
      .update({ usage_limit: usageLimit })
      .eq('id', id);
    if (error) {
      console.error('updateCompanyUsageLimit error', error);
    }
  },

  async updateCompanyLimit(id: string, limit: number | null) {
    return this.updateCompanyUsageLimit(id, limit);
  },

  async incrementCompanyUsage(companyId: string) {
    if (isOfflineMode) {
        // Already handled in memory array in createJob for offline mode
        return;
    }
    
    if (!isValidUUID(companyId)) {
       console.error("Attempted to increment usage for invalid UUID:", companyId);
       return;
    }

    // Attempt to use the RPC function for atomic increment
    try {
        console.log("Attemping to increment usage for company:", companyId);
        const { error } = await supabase.rpc('increment_usage_count', { row_id: companyId });
        if (error) throw error;
        console.log("Usage incremented successfully via RPC");
    } catch (e) {
        console.warn("RPC increment failed, falling back to read-write", e);
        // Fallback: Read count, then update (Not atomic, but better than nothing if RPC missing)
        const { data } = await supabase.from('companies').select('usage_count').eq('id', companyId).single();
        if (data) {
             const newCount = (data.usage_count || 0) + 1;
             await supabase.from('companies').update({ usage_count: newCount }).eq('id', companyId);
             console.log("Usage incremented via fallback (new count):", newCount);
        }
    }
  },

  // JOBS (analytics + usage count; 30-day retention handled in DB)

  async createJob(job: Partial<JobRecord>) {
    if (isOfflineMode) {
      const newJob = {
        ...job,
        id: crypto.randomUUID(),
        created_at: new Date().toISOString(),
      };
      memJobs.push(newJob);
      // Increment usage in memory
      if (job.company_id) {
        const comp = memCompanies.find(c => c.id === job.company_id);
        if (comp) {
          comp.usage_used = (comp.usage_used || 0) + 1;
        }
      }
      return newJob;
    }

    // Generate an id on the client so we don't need RETURNING
    const id = job.id ?? crypto.randomUUID();
    const payload = { ...job, id };

    try {
      const { error } = await supabase.from('jobs').insert(payload); // no .select(), no .single()
      if (error) throw error;

      // Strictly enforce usage update upon submission
      if (job.company_id && isValidUUID(job.company_id)) {
          console.log("Job created, incrementing usage...");
          await this.incrementCompanyUsage(job.company_id);
      } else {
          console.warn("Job created but no valid company_id present. Usage NOT incremented.");
      }

      // Return the job shape the rest of the app expects
      return { ...payload } as JobRecord;
    } catch (e) {
      console.error('Create Job Error', e);
      throw e; // Throw error so UI knows submission failed
    }
  },

  async getCompanyJobs(companyId: string): Promise<JobRecord[]> {
    if (isOfflineMode) {
      return memJobs.filter(j => j.company_id === companyId) as JobRecord[];
    }

    const { data, error } = await supabase
      .from('jobs')
      .select('*')
      .eq('company_id', companyId)
      .order('created_at', { ascending: false });

    if (error || !data) {
      console.error('getCompanyJobs error', error);
      return [];
    }

    return data as JobRecord[];
  },

  // LOW-LEVEL IMAGE STORAGE HELPER (ONLY USED IF CALLED; DOES NOT TOUCH JOBS)

  /**
   * Stores a base64 image string in Supabase Storage and returns
   * a public URL. If storage fails, falls back to the base64 data URL.
   * This is a utility and not wired into the inventory flow by default.
   */
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
