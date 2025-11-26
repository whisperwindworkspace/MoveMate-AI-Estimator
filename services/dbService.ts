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
  volumeCuFt: Number(dbItem.volume_cu_ft) || 0,
  weightLbs: Number(dbItem.weight_lbs) || 0,
  category: dbItem.category || 'Misc',
  tags: Array.isArray(dbItem.tags) ? dbItem.tags : [],
  selected: dbItem.selected ?? true,
  imageUrl: dbItem.image_url || undefined,
  confidence: Number(dbItem.confidence) || 1.0,
  disassembly: dbItem.disassembly || undefined,
});

const mapAppItemToDb = (item: InventoryItem, jobId: string) => ({
  id: item.id,
  job_id: jobId,
  name: item.name,
  quantity: item.quantity,
  volume_cu_ft: item.volumeCuFt,
  weight_lbs: item.weightLbs,
  category: item.category,
  tags: item.tags,
  image_url: item.imageUrl,
  selected: item.selected,
  confidence: item.confidence,
  disassembly: item.disassembly,
  created_at: new Date().toISOString(),
});

// --- Services ---

export const dbService = {
  isOffline() {
    return isOfflineMode;
  },

  // CHECK CONNECTION – keep simple, don’t flip to offline on permission errors
  async checkConnection(): Promise<boolean> {
    try {
      const { error } = await supabase.from('items').select('id').limit(1);
      if (error) {
        console.warn(
          'Database reachable but query errored (likely RLS). Staying online.',
          error.message,
        );
      }
      isOfflineMode = false;
      return true;
    } catch (e) {
      console.warn('Database connection failed. Switching to Offline/Demo Mode.', e);
      isOfflineMode = true;
      return true;
    }
  },

  // ITEMS
  async getItems(jobId: string): Promise<InventoryItem[]> {
    if (isOfflineMode) {
      return memItems.filter(item => item.job_id === jobId).map(mapDbItemToApp);
    }

    try {
      const { data, error } = await supabase
        .from('items')
        .select('*')
        .eq('job_id', jobId)
        .order('created_at', { ascending: true });

      if (error) throw error;
      return data ? data.map(mapDbItemToApp) : [];
    } catch (e) {
      console.error('Fetch error, returning empty', e);
      return [];
    }
  },

  async upsertItem(item: InventoryItem, jobId: string) {
    const payload = mapAppItemToDb(item, jobId);

    if (isOfflineMode) {
      const existingIdx = memItems.findIndex(i => i.id === item.id);
      if (existingIdx >= 0) {
        memItems[existingIdx] = { ...memItems[existingIdx], ...payload };
      } else {
        memItems.push(payload);
      }
      return item;
    }

    try {
      const { data, error } = await supabase
        .from('items')
        .upsert(payload)
        .select()
        .single();

      if (error) throw error;
      return mapDbItemToApp(data);
    } catch (e) {
      console.error('Upsert error', e);
      return item;
    }
  },

  async deleteItem(id: string) {
    if (isOfflineMode) {
      memItems = memItems.filter(i => i.id !== id);
      return;
    }

    try {
      const { error } = await supabase.from('items').delete().eq('id', id);
      if (error) console.error('Delete error:', error);
    } catch (e) {
      console.error('Delete exception', e);
    }
  },

  async updateJobId(oldJobId: string, newJobId: string) {
    if (isOfflineMode) {
      memItems.forEach(item => {
        if (item.job_id === oldJobId) item.job_id = newJobId;
      });
      return;
    }

    try {
      const { error } = await supabase
        .from('items')
        .update({ job_id: newJobId })
        .eq('job_id', oldJobId);

      if (error) console.error('UpdateJobId error:', error);
    } catch (e) {
      console.error('Update Job ID exception', e);
    }
  },

  // JOBS / STATISTICS
  async createJob(job: Partial<JobRecord>) {
    if (isOfflineMode) {
      const newJob = { ...job, id: crypto.randomUUID(), created_at: new Date().toISOString() };
      memJobs.push(newJob);

      if (job.company_id) {
        const comp = memCompanies.find(c => c.id === job.company_id);
        if (comp) {
          comp.usage_count = (comp.usage_count || 0) + 1;
        }
      }
      return newJob;
    }

    try {
      const { data, error } = await supabase.from('jobs').insert(job).select().single();
      if (error) throw error;

      if (job.company_id) {
        const { data: comp } = await supabase
          .from('companies')
          .select('usage_count')
          .eq('id', job.company_id)
          .single();

        const newCount = (comp?.usage_count || 0) + 1;
        await supabase.from('companies').update({ usage_count: newCount }).eq('id', job.company_id);
      }

      return data;
    } catch (e) {
      console.error('Create Job Error', e);
      return null;
    }
  },

  async getCompanyJobs(companyId: string): Promise<JobRecord[]> {
    if (isOfflineMode) {
      return memJobs.filter(j => j.company_id === companyId);
    }

    try {
      const { data, error } = await supabase
        .from('jobs')
        .select('*')
        .eq('company_id', companyId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data as JobRecord[];
    } catch (e) {
      console.error('Fetch Jobs Error', e);
      return [];
    }
  },

  // COMPANIES (no passwords exposed)
  async getCompanyPublicProfile(id: string): Promise<CompanyProfile | null> {
    if (isOfflineMode) {
      const found = memCompanies.find(c => c.id === id);
      if (!found) return null;
      return {
        id: found.id,
        name: found.name,
        slug: found.slug,
        adminEmail: found.admin_email,
        crmConfig: found.crm_config,
        usageLimit: found.usage_limit,
        usageCount: found.usage_count,
        primaryColor: found.primary_color,
        logoUrl: undefined,
      };
    }

    try {
      const { data, error } = await supabase
        .from('companies')
        .select(
          'id,name,slug,admin_email,crm_config,usage_limit,usage_count,primary_color',
        )
        .eq('id', id)
        .single();

      if (error || !data) return null;

      return {
        id: data.id,
        name: data.name,
        slug: data.slug,
        adminEmail: data.admin_email,
        crmConfig: data.crm_config || { provider: null, isConnected: false, apiKey: '' },
        usageLimit: data.usage_limit,
        usageCount: data.usage_count,
        primaryColor: data.primary_color,
        logoUrl: undefined,
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
        adminEmail: found.admin_email,
        crmConfig: found.crm_config,
        usageLimit: found.usage_limit,
        usageCount: found.usage_count,
        primaryColor: found.primary_color,
        logoUrl: undefined,
      };
    }

    try {
      const { data, error } = await supabase
        .from('companies')
        .select(
          'id,name,slug,admin_email,crm_config,usage_limit,usage_count,primary_color',
        )
        .eq('slug', slug)
        .single();

      if (error || !data) return null;

      return {
        id: data.id,
        name: data.name,
        slug: data.slug,
        adminEmail: data.admin_email,
        crmConfig: data.crm_config || { provider: null, isConnected: false, apiKey: '' },
        usageLimit: data.usage_limit,
        usageCount: data.usage_count,
        primaryColor: data.primary_color,
        logoUrl: undefined,
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
        adminEmail: c.admin_email,
        crmConfig: c.crm_config,
        usageLimit: c.usage_limit,
        usageCount: c.usage_count,
        primaryColor: c.primary_color,
        logoUrl: undefined,
      }));
    }

    try {
      // Use * to avoid 400s from column name mismatches; map down to safe shape.
      const { data, error } = await supabase.from('companies').select('*');

      if (error || !data) {
        console.error('getAllCompanies error:', error);
        return [];
      }

      return (data as any[]).map(c => ({
        id: c.id,
        name: c.name,
        slug: c.slug,
        adminEmail: c.admin_email,
        crmConfig: c.crm_config || { provider: null, isConnected: false, apiKey: '' },
        usageLimit: c.usage_limit,
        usageCount: c.usage_count,
        primaryColor: c.primary_color,
        logoUrl: undefined,
      }));
    } catch (e) {
      console.error('Get all companies exception', e);
      return [];
    }
  },

  async createCompany(company: Partial<CompanyProfile>) {
    if (isOfflineMode) {
      const newComp = {
        id: crypto.randomUUID(),
        name: company.name,
        slug: company.slug,
        admin_email: company.adminEmail,
        crm_config: company.crmConfig,
        usage_limit: company.usageLimit ?? null,
        usage_count: 0,
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
          admin_email: company.adminEmail,
          crm_config: company.crmConfig,
          usage_limit: company.usageLimit,
          usage_count: 0,
          primary_color: company.primaryColor,
        })
        // use * here too to avoid column mismatch problems
        .select('*')
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

  async updateCompanySettings(id: string, updates: Partial<CompanyProfile>) {
    if (isOfflineMode) {
      const idx = memCompanies.findIndex(c => c.id === id);
      if (idx >= 0) {
        if (updates.adminEmail) memCompanies[idx].admin_email = updates.adminEmail;
        if (updates.crmConfig) memCompanies[idx].crm_config = updates.crmConfig;
        if (updates.primaryColor) memCompanies[idx].primary_color = updates.primaryColor;
      }
      return;
    }

    const dbUpdates: any = {};
    if (updates.adminEmail) dbUpdates.admin_email = updates.adminEmail;
    if (updates.crmConfig) dbUpdates.crm_config = updates.crmConfig;
    if (updates.primaryColor) dbUpdates.primary_color = updates.primaryColor;

    const { error } = await supabase.from('companies').update(dbUpdates).eq('id', id);
    if (error) throw error;
  },

  async updateCompanyLimit(id: string, usageLimit: number | null) {
    if (isOfflineMode) {
      const idx = memCompanies.findIndex(c => c.id === id);
      if (idx >= 0) {
        memCompanies[idx].usage_limit = usageLimit;
      }
      return;
    }

    const { error } = await supabase
      .from('companies')
      .update({ usage_limit: usageLimit })
      .eq('id', id);

    if (error) throw error;
  },

  // STORAGE
  async uploadImage(base64Data: string): Promise<string | null> {
    if (isOfflineMode) {
      return `data:image/jpeg;base64,${base64Data}`;
    }

    try {
      const byteCharacters = atob(base64Data);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], { type: 'image/jpeg' });

      const fileName = `${Date.now()}_${Math.random().toString(36).substring(7)}.jpg`;

      const { data, error } = await supabase.storage.from('images').upload(fileName, blob);

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
