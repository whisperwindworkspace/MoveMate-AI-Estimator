
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
  id: item.id, // Keep UUID
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
  created_at: new Date().toISOString()
});

const isValidUUID = (uuid: string) => {
  const regex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return regex && regex.test(uuid);
};

// --- Services ---

export const dbService = {
  
  isOffline() {
    return isOfflineMode;
  },

  // CHECK CONNECTION
  async checkConnection(): Promise<boolean> {
    try {
      // Try to fetch 1 item just to see if table exists
      const { error } = await supabase.from('items').select('id').limit(1);
      
      // PGRST205: Relation not found (Table missing)
      // 42P01: Undefined table
      // P0001: Connection refused / Auth failed
      if (error) {
        console.warn("Database connection issue detected. Switching to Offline/Demo Mode.", error.message);
        isOfflineMode = true;
        return true; // Return true to allow app to load
      }
      isOfflineMode = false;
      return true;
    } catch (e) {
      console.warn("Database connection failed. Switching to Offline/Demo Mode.", e);
      isOfflineMode = true;
      return true;
    }
  },

  // ITEMS
  async getItems(jobId: string): Promise<InventoryItem[]> {
    if (isOfflineMode) {
      return memItems
        .filter(item => item.job_id === jobId)
        .map(mapDbItemToApp);
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
      console.error("Fetch error, returning empty", e);
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
      console.error("Upsert error", e);
      return item; // Optimistic return
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
        console.error("Delete exception", e);
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
        console.error("Update Job ID exception", e);
    }
  },

  // JOBS / STATISTICS
  async createJob(job: Partial<JobRecord>) {
    if (isOfflineMode) {
        const newJob = { ...job, id: crypto.randomUUID(), created_at: new Date().toISOString() };
        memJobs.push(newJob);
        return newJob;
    }

    try {
        const { data, error } = await supabase.from('jobs').insert(job).select().single();
        if (error) throw error;
        return data;
    } catch (e) {
        console.error("Create Job Error", e);
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
        console.error("Fetch Jobs Error", e);
        return [];
    }
  },

  // COMPANIES / AUTH
  async loginCompany(username: string, password: string): Promise<CompanyProfile | null> {
    if (isOfflineMode) {
        const found = memCompanies.find(c => c.username === username && c.password === password);
        if (!found) return null;
        return {
            id: found.id,
            name: found.name,
            username: found.username,
            password: found.password,
            adminEmail: found.admin_email,
            crmConfig: found.crm_config
        };
    }

    try {
      const { data, error } = await supabase
        .from('companies')
        .select('*')
        .eq('username', username)
        .eq('password', password)
        .single();

      if (error || !data) return null;

      return {
        id: data.id,
        name: data.name,
        username: data.username,
        password: data.password,
        adminEmail: data.admin_email,
        crmConfig: data.crm_config
      };
    } catch (e) {
      console.error("Login exception:", e);
      return null;
    }
  },

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
            crmConfig: found.crm_config
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
            crmConfig: data.crm_config || { provider: null, isConnected: false, apiKey: '' }
        };
    } catch (e) {
        console.error("Get company profile exception:", e);
        return null;
    }
  },

  async getAllCompanies(): Promise<CompanyProfile[]> {
    if (isOfflineMode) {
        return memCompanies.map(c => ({
            id: c.id,
            name: c.name,
            username: c.username,
            password: c.password,
            adminEmail: c.admin_email,
            crmConfig: c.crm_config
        }));
    }

    try {
      const { data, error } = await supabase.from('companies').select('*');
      if (error) return [];
      return data.map(c => ({
        id: c.id,
        name: c.name,
        username: c.username,
        password: c.password,
        adminEmail: c.admin_email,
        crmConfig: c.crm_config || { provider: null, isConnected: false, apiKey: '' }
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
            username: company.username,
            password: company.password,
            admin_email: company.adminEmail,
            crm_config: company.crmConfig
        };
        memCompanies.push(newComp);
        return newComp;
    }

    try {
        const { data, error } = await supabase.from('companies').insert({
        name: company.name,
        username: company.username,
        password: company.password,
        admin_email: company.adminEmail,
        crm_config: company.crmConfig
        }).select().single();
        
        if (error) throw error;
        return data;
    } catch(e) {
        console.error("Create company error", e);
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

  async updateCompanySettings(id: string, email: string, crmConfig: any) {
    console.log("Saving settings for company:", id);
    if (isOfflineMode) {
        const idx = memCompanies.findIndex(c => c.id === id);
        if (idx >= 0) {
            memCompanies[idx].admin_email = email;
            memCompanies[idx].crm_config = crmConfig;
        }
        return;
    }

    // Include .select() to ensure we get confirmation that a row was actually found and updated
    const { data, error } = await supabase.from('companies').update({
        admin_email: email,
        crm_config: crmConfig
    })
    .eq('id', id)
    .select();

    if (error) {
        console.error("DB Update Error:", error);
        throw error;
    }

    if (!data || data.length === 0) {
        console.error("No company found with ID:", id);
        throw new Error("Failed to update: Company not found");
    }

    console.log("Settings updated successfully for:", data[0].name);
  },

  // STORAGE
  async uploadImage(base64Data: string): Promise<string | null> {
    // In offline mode, just return the data URI so it works locally
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
      
      const { data, error } = await supabase.storage
        .from('images')
        .upload(fileName, blob);

      if (error) {
        console.warn("Storage upload failed, falling back to local base64", error.message);
        return `data:image/jpeg;base64,${base64Data}`;
      }

      const { data: { publicUrl } } = supabase.storage
        .from('images')
        .getPublicUrl(fileName);

      return publicUrl;
    } catch (e) {
      console.error("Upload exception", e);
      return `data:image/jpeg;base64,${base64Data}`;
    }
  }
};
