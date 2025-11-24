

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
  apiKey?: string; // Mock property
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

export interface CompanyProfile {
  id: string;
  name: string; // Display name e.g., "Speedy Movers"
  username?: string; // Legacy/Offline: Login username
  password?: string; // Legacy/Offline: Login password
  adminEmail: string;
  crmConfig: CRMConfig;
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
}

export type UserRole = 'GUEST' | 'COMPANY_ADMIN' | 'SUPER_ADMIN';

export type ViewMode = 'LANDING' | 'LOGIN' | 'COMPANY_DASHBOARD' | 'SUPER_ADMIN_DASHBOARD' | 'INVENTORY';