

export interface InventoryItem {
  id: string;
  name: string;
  quantity: number;
  volumeCuFt: number;
  weightLbs: number;
  selected: boolean;
  category: string; // e.g., Furniture, Appliance, Box
  tags: string[]; // e.g., 'Fragile', 'Heavy'
  imageUrl?: string; // Optional image for manually added items
  confidence?: number; // 0 to 1 score from AI
  disassembly?: string; // Instructions for disassembly
}

export interface InventorySummary {
  totalItems: number;
  totalVolume: number;
  totalWeight: number;
}

export interface CRMConfig {
  provider: 'supermove' | 'salesforce' | null;
  isConnected: boolean;
  apiKey?: string;
  endpointUrl?: string; // Real endpoint for webhook/API
}

export interface PackingRequirements {
  tvBox: number;
  wardrobeBox: number;
  mirrorBox: number;
  mattressCover: number;
  generalNotes: string;
}

export interface JobDetails {
  jobId?: string;
  customerName?: string;
  moveDate?: string;
  packingReqs?: PackingRequirements;
}

// Record stored in DB for analytics
export interface JobRecord {
  id: string;
  company_id: string;
  customer_name: string;
  job_id_input: string;
  total_volume: number;
  total_weight: number;
  item_count: number;
  crm_status: 'synced' | 'failed' | 'skipped';
  created_at: string;
}

export interface CompanyProfile {
  id: string;
  name: string; // Display name e.g., "Dan the Moving Man"
  slug?: string; // public URL slug e.g., "dan-the-moving-man"
  username?: string; // Legacy/Offline: Login username
  password?: string; // Legacy/Offline: Login password
  adminEmail: string;
  crmConfig: CRMConfig;
  usageLimit?: number | null; // Max number of uses (jobs/scans)
  usageCount?: number; // Current count
  primaryColor?: string; // Brand color
  logoUrl?: string;      // Brand logo
}

export interface UserProfile {
    id: string; // Links to auth.users.id
    company_id: string;
    role: UserRole;
    companies?: CompanyProfile; // Joined data
}

// Used for the current session state
export interface AppSettings {
  companyName: string;
  adminEmail: string;
  crmConfig: CRMConfig;
  primaryColor?: string;
  logoUrl?: string;
}

export type UserRole = 'GUEST' | 'COMPANY_ADMIN' | 'SUPER_ADMIN';

export type ViewMode = 'LANDING' | 'LOGIN' | 'COMPANY_DASHBOARD' | 'SUPER_ADMIN_DASHBOARD' | 'INVENTORY';