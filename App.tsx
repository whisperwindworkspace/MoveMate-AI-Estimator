


import React, { useState, useEffect } from 'react';
import { InventoryItem, AppSettings, JobDetails, ViewMode, CompanyProfile, UserRole } from './types';
import { DEFAULT_ADMIN_EMAIL } from './constants';
import { analyzeImageForInventory, parseVoiceCommand } from './services/geminiService';
import { dbService } from './services/dbService';
import { signInWithEmail, getUserProfile, signOut, subscribeToAuthChanges } from './services/authService';
import { getCompanyBySlug } from './config/companies';
import CameraInput from './components/CameraInput';
import VoiceInput from './components/VoiceInput';
import InventoryList from './components/InventoryList';
import SummaryPanel from './components/SummaryPanel';
import ItemFormModal from './components/ItemFormModal';
import CRMConfigModal from './components/CRMConfigModal';
import AdminLogin from './components/AdminLogin';
import AdminDashboard from './components/AdminDashboard';
import SuperAdminDashboard from './components/SuperAdminDashboard';
import DatabaseSetupModal from './components/DatabaseSetupModal';
import { Box, Truck, Plus, LogOut, Lock, Loader2, AlertTriangle, Scale, FileText, Package, Ban } from 'lucide-react';

interface AppProps {
  initialSlug?: string;
}

const App: React.FC<AppProps> = ({ initialSlug }) => {
  // Navigation State
  const [view, setView] = useState<ViewMode>('INVENTORY');
  const [currentUserRole, setCurrentUserRole] = useState<UserRole>('GUEST');
  const [currentCompanyId, setCurrentCompanyId] = useState<string | null>(null);

  // Limit Check
  const [isLimitReached, setIsLimitReached] = useState(false);

  // Job Data
  const [sessionId] = useState<string>(() => crypto.randomUUID());
  const [jobDetails, setJobDetails] = useState<JobDetails>({});
  
  // Current Settings
  const [settings, setSettings] = useState<AppSettings>({
    companyName: 'MoveMate AI',
    adminEmail: DEFAULT_ADMIN_EMAIL,
    crmConfig: { provider: null, isConnected: false, apiKey: '' },
    primaryColor: '#2563eb'
  });

  // Data Loading
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [isLoadingItems, setIsLoadingItems] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<InventoryItem | undefined>(undefined);
  const [showDbSetup, setShowDbSetup] = useState(false);

  // --- 1. Initialization (Deep Link + Auth) ---
  useEffect(() => {
    // Check for Deep Link (?cid=... or #slug)
    const params = new URLSearchParams(window.location.search);
    const companyId = params.get('cid');
    
    // Read slug from hash (remove leading #) or query param
    const hashSlug = window.location.hash.replace(/^#/, '');
    const companySlug = initialSlug || hashSlug || params.get('slug');
    
    if (companyId) {
        // DB-based Company Lookup
        dbService.getCompanyPublicProfile(companyId).then(profile => {
            if (profile) {
                // Check usage limits
                if (profile.usageLimit !== null && profile.usageLimit !== undefined) {
                    if ((profile.usageCount || 0) >= profile.usageLimit) {
                        setIsLimitReached(true);
                        return; // Stop loading settings
                    }
                }

                setSettings({
                    companyName: profile.name,
                    adminEmail: profile.adminEmail,
                    crmConfig: profile.crmConfig,
                    primaryColor: profile.primaryColor,
                    logoUrl: profile.logoUrl
                });
            }
        });
    } else if (companySlug) {
        // 1. Try DB Lookup First (for registered companies using short links)
        dbService.getCompanyBySlug(companySlug).then(profile => {
            if (profile) {
                 if (profile.usageLimit !== null && profile.usageLimit !== undefined) {
                    if ((profile.usageCount || 0) >= profile.usageLimit) {
                        setIsLimitReached(true);
                        return;
                    }
                }
                setSettings({
                    companyName: profile.name,
                    adminEmail: profile.adminEmail,
                    crmConfig: profile.crmConfig,
                    primaryColor: profile.primaryColor,
                    logoUrl: profile.logoUrl
                });
            } else {
                 // 2. Fallback to Config (for static companies)
                const configProfile = getCompanyBySlug(companySlug);
                if (configProfile) {
                    setSettings({
                        companyName: configProfile.name,
                        adminEmail: configProfile.destinationEmail,
                        crmConfig: { provider: null, isConnected: false, apiKey: '' },
                        primaryColor: configProfile.primaryColor,
                        logoUrl: configProfile.logoUrl
                    });
                }
            }
        });
    }

    if (dbService.isOffline()) return;

    const subscription = subscribeToAuthChanges(async (session) => {
        if (session?.user) {
            try {
                const profile = await getUserProfile(session.user.id);
                if (profile) {
                    const companyData = Array.isArray(profile.companies) ? profile.companies[0] : profile.companies;
                    
                    if (profile.role === 'SUPER_ADMIN' || (companyData && companyData.name === 'Super Admin')) {
                        setCurrentUserRole('SUPER_ADMIN');
                        setView('SUPER_ADMIN_DASHBOARD');
                    } else {
                        setCurrentUserRole('COMPANY_ADMIN');
                        setCurrentCompanyId(profile.company_id);
                        if (companyData) {
                            setSettings({
                                companyName: companyData.name,
                                adminEmail: companyData.admin_email,
                                crmConfig: companyData.crm_config || { provider: null, isConnected: false },
                                primaryColor: companyData.primary_color,
                                logoUrl: companyData.logo_url
                            });
                        }
                        setView('COMPANY_DASHBOARD');
                    }
                }
            } catch (e) {
                console.error("Error restoring session profile", e);
            }
        } else {
            // Only redirect to inventory if we were previously in a dashboard
            // This prevents overriding the login screen if the user just clicked 'Admin Login'
            if (view === 'COMPANY_DASHBOARD' || view === 'SUPER_ADMIN_DASHBOARD') {
                setCurrentUserRole('GUEST');
                setCurrentCompanyId(null);
                setView('INVENTORY');
            }
        }
    });

    return () => {
        subscription.unsubscribe();
    };
  }, [view, initialSlug]);

  // --- 2. Initial Data Fetch ---
  useEffect(() => {
    const init = async () => {
        await dbService.checkConnection();
        
        setIsLoadingItems(true);
        const activeId = jobDetails.jobId || sessionId;
        const fetchedItems = await dbService.getItems(activeId);
        setItems(fetchedItems);
        setIsLoadingItems(false);
    };
    init();
  }, [sessionId, jobDetails.jobId]);

  // --- Handlers ---

  const handleUpdateJobDetails = async (details: JobDetails) => {
    const oldId = jobDetails.jobId || sessionId;
    const newId = details.jobId || sessionId;
    
    setJobDetails(details);

    if (details.jobId && details.jobId !== oldId) {
       try {
         await dbService.updateJobId(oldId, details.jobId);
         const refreshed = await dbService.getItems(details.jobId);
         setItems(refreshed);
       } catch (e) {
         console.error("Failed to migrate items to new Job ID", e);
         setError("Failed to save job ID. Your items are safe under the draft ID.");
       }
    }
  };

  const handleLogin = async (usernameOrEmail: string, password: string): Promise<boolean> => {
    try {
        // Offline Mode
        if (dbService.isOffline()) {
            const company = await dbService.loginCompany(usernameOrEmail, password);
            if (company) {
                // In purely empty offline mode, this likely won't trigger unless user created a company in-memory
                if (company.name === 'Super Admin') {
                    setCurrentUserRole('SUPER_ADMIN');
                    setView('SUPER_ADMIN_DASHBOARD');
                } else {
                    setCurrentUserRole('COMPANY_ADMIN');
                    setCurrentCompanyId(company.id);
                    setSettings({
                        companyName: company.name,
                        adminEmail: company.adminEmail,
                        crmConfig: company.crmConfig,
                        primaryColor: company.primaryColor,
                        logoUrl: company.logoUrl
                    });
                    setView('COMPANY_DASHBOARD');
                }
                return true;
            }
            return false;
        }

        // Online Mode - Trigger sign in.
        const user = await signInWithEmail(usernameOrEmail, password);
        if (!user) return false;
        
        // Strict check: Ensure the user has a linked company profile
        const profile = await getUserProfile(user.id);
        if (!profile) {
            console.warn("User logged in but has no linked company profile.");
            await signOut();
            return false;
        }

        return true;
    } catch (e) {
        console.error("Login failed", e);
        return false;
    }
  };

  const handleRequestPasswordReset = async (email: string): Promise<{ success: boolean; email?: string; code?: string }> => {
    if (dbService.isOffline()) {
        const companies = await dbService.getAllCompanies();
        const company = companies.find(c => c.username === email); 
        if (company) {
            const code = Math.floor(100000 + Math.random() * 900000).toString();
            return { success: true, email: company.adminEmail, code };
        }
        return { success: false };
    }
    return { success: true, email, code: '123456' };
  };

  const handleCompletePasswordReset = async (username: string, newPassword: string) => {
    console.log("Password reset simulation complete.");
  };

  const handleLogout = async () => {
    if (!dbService.isOffline()) {
        try {
            await signOut();
        } catch(e) { console.error(e); }
    }
    
    setCurrentUserRole('GUEST');
    setCurrentCompanyId(null);
    setSettings({
        companyName: 'MoveMate AI',
        adminEmail: DEFAULT_ADMIN_EMAIL,
        crmConfig: { provider: null, isConnected: false, apiKey: '' },
        primaryColor: '#2563eb'
    });
    setView('INVENTORY');
    
    // Force reload to clear any transient states if needed, or just let state do it
    if (dbService.isOffline()) {
         setJobDetails({});
    }
  };

  // --- Handlers for Super Admin ---
  
  const handleAddCompany = async (company: CompanyProfile) => {
    try {
        await dbService.createCompany(company);
    } catch (e) {
        console.error("Failed to create company", e);
    }
  };

  const handleDeleteCompany = async (id: string) => {
    await dbService.deleteCompany(id);
  };

  // --- Handlers for Company Settings ---

  const handleUpdateSettings = async (newSettings: AppSettings) => {
    // 1. Optimistic Update
    setSettings(newSettings);
    
    // 2. Persist to DB
    if (currentCompanyId) {
        try {
            await dbService.updateCompanySettings(currentCompanyId, {
                adminEmail: newSettings.adminEmail,
                crmConfig: newSettings.crmConfig,
                primaryColor: newSettings.primaryColor,
                logoUrl: newSettings.logoUrl
            });
        } catch (e) {
            console.error("Failed to save settings to DB:", e);
            setError("Settings could not be saved. Please check your connection.");
            // Ideally revert optimistic update here, but for now we rely on user retry
        }
    } else {
        console.warn("No Company ID found, cannot save settings.");
    }
  };

  // --- Handlers for Inventory ---

  const activeJobId = jobDetails.jobId || sessionId;

  const handleImageCaptured = async (base64: string) => {
    setIsAnalyzing(true);
    setError(null);
    try {
      // In strictly transient mode, we do NOT upload the image.
      // We process the base64 directly and then discard it.
      const newItems = await analyzeImageForInventory(base64);
      
      const savedItems = [];
      for (const item of newItems) {
         // item.imageUrl is undefined in this mode
         const saved = await dbService.upsertItem(item, activeJobId);
         savedItems.push(saved);
      }

      setItems((prev) => [...prev, ...savedItems]);
    } catch (err) {
      console.error(err);
      setError("Failed to analyze image. Please try again.");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleVoiceResult = async (transcript: string) => {
    setIsAnalyzing(true);
    setError(null);
    try {
        const newItems = await parseVoiceCommand(transcript);
        const savedItems = [];
        for (const item of newItems) {
            const saved = await dbService.upsertItem(item, activeJobId);
            savedItems.push(saved);
        }
        setItems((prev) => [...prev, ...savedItems]);
    } catch (err) {
        console.error(err);
        setError("Could not understand voice command.");
    } finally {
        setIsAnalyzing(false);
    }
  };

  const handleToggleSelect = async (id: string) => {
    const item = items.find(i => i.id === id);
    if (item) {
        const updated = { ...item, selected: !item.selected };
        setItems(items.map(i => i.id === id ? updated : i));
        await dbService.upsertItem(updated, activeJobId);
    }
  };

  const handleSelectAll = async (select: boolean) => {
      const updatedItems = items.map(item => ({ ...item, selected: select }));
      setItems(updatedItems);
      await Promise.all(updatedItems.map(item => dbService.upsertItem(item, activeJobId)));
  };

  const handleUpdateQuantity = async (id: string, delta: number) => {
    const item = items.find(i => i.id === id);
    if (item) {
        const newQty = Math.max(1, item.quantity + delta);
        const updated = { ...item, quantity: newQty };
        setItems(items.map(i => i.id === id ? updated : i));
        await dbService.upsertItem(updated, activeJobId);
    }
  };

  const handleDeleteItem = async (id: string) => {
    setItems(items.filter(item => item.id !== id));
    await dbService.deleteItem(id);
  };

  const openAddModal = () => {
    setEditingItem(undefined);
    setIsModalOpen(true);
  };

  const openEditModal = (item: InventoryItem) => {
    setEditingItem(item);
    setIsModalOpen(true);
  };

  const handleSaveItem = async (itemData: Partial<InventoryItem>) => {
    try {
        // No persistent image upload here either
        const imageUrl = undefined; 

        if (editingItem) {
        const updated = { ...editingItem, ...itemData, imageUrl } as InventoryItem;
        setItems(items.map(i => i.id === editingItem.id ? updated : i));
        await dbService.upsertItem(updated, activeJobId);
        } else {
        const newItem: InventoryItem = {
            id: crypto.randomUUID(),
            name: itemData.name || 'New Item',
            quantity: itemData.quantity || 1,
            volumeCuFt: itemData.volumeCuFt || 0,
            weightLbs: itemData.weightLbs || 0,
            category: itemData.category || 'Misc',
            tags: itemData.tags || [],
            selected: true,
            imageUrl: undefined,
            disassembly: itemData.disassembly
        };
        setItems([...items, newItem]);
        const saved = await dbService.upsertItem(newItem, activeJobId);
        if (saved && saved.id !== newItem.id) {
            setItems(prev => prev.map(i => i.id === newItem.id ? saved : i));
        }
        }
        setIsModalOpen(false);
    } catch (e) {
        console.error("Error saving item", e);
        setError("Could not save item to database.");
    }
  };

  // --- Calculations for Top Stats ---
  const activeItems = items.filter(i => i.selected);
  const totalVol = activeItems.reduce((acc, i) => acc + (i.volumeCuFt * i.quantity), 0);
  const totalWt = activeItems.reduce((acc, i) => acc + (i.weightLbs * i.quantity), 0);
  
  const boxCount = activeItems
    .filter(i => i.category === 'Box')
    .reduce((acc, i) => acc + i.quantity, 0);
  const otherCount = activeItems
    .filter(i => i.category !== 'Box')
    .reduce((acc, i) => acc + i.quantity, 0);

  // --- Limit Reached View ---
  if (isLimitReached) {
      return (
          <div className="min-h-screen bg-slate-100 dark:bg-slate-900 flex flex-col items-center justify-center p-6 text-center">
              <div className="bg-white dark:bg-slate-800 p-8 rounded-2xl shadow-xl max-w-md w-full border border-slate-200 dark:border-slate-700">
                  <div className="w-20 h-20 bg-red-100 text-red-500 rounded-full flex items-center justify-center mx-auto mb-6">
                      <Ban size={40} />
                  </div>
                  <h1 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">Access Limit Reached</h1>
                  <p className="text-slate-500 dark:text-slate-400 mb-8">
                      The intake link for this company has reached its usage limit. Please contact the administrator.
                  </p>
                  <button 
                     onClick={() => window.location.href = '/'}
                     className="w-full py-3 bg-slate-900 dark:bg-slate-700 text-white rounded-xl font-medium"
                  >
                      Go Home
                  </button>
              </div>
          </div>
      );
  }

  // --- View Routing ---

  if (view === 'LOGIN') {
      return (
          <AdminLogin 
            onLogin={handleLogin} 
            onRequestReset={handleRequestPasswordReset}
            onResetPassword={handleCompletePasswordReset}
            onBack={() => setView('INVENTORY')}
          />
      );
  }

  const SuperAdminWrapper = () => {
    const [compList, setCompList] = useState<CompanyProfile[]>([]);
    
    // Add callback to update company list instantly
    const refreshList = async () => {
         const list = await dbService.getAllCompanies();
         setCompList(list);
    };

    useEffect(() => {
        refreshList();
    }, []);

    return (
        <SuperAdminDashboard 
            companies={compList}
            onAddCompany={refreshList}
            onDeleteCompany={async (id) => { await handleDeleteCompany(id); refreshList(); }}
            onUpdateCompany={refreshList}
            onLogout={handleLogout}
        />
    );
  };

  if (view === 'SUPER_ADMIN_DASHBOARD') {
      return <SuperAdminWrapper />;
  }

  if (view === 'COMPANY_DASHBOARD') {
      return (
          <AdminDashboard 
            settings={settings}
            onUpdateSettings={handleUpdateSettings}
            onLogout={handleLogout}
          />
      );
  }

  // --- Inventory View ---

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 pb-32 transition-colors duration-300">
      {/* Header */}
      <header className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 sticky top-0 z-40 transition-colors">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex flex-col">
            <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
              <Truck style={{ color: settings.primaryColor }} size={24} /> {settings.companyName}
              {dbService.isOffline() && (
                 <button 
                   onClick={() => setShowDbSetup(true)}
                   className="bg-amber-100 hover:bg-amber-200 text-amber-700 text-[10px] px-2 py-0.5 rounded-full border border-amber-200 flex items-center gap-1 transition-colors cursor-pointer"
                   title="Click to setup database"
                 >
                    <AlertTriangle size={10} /> Demo Mode
                 </button>
              )}
            </h1>
            <div className="text-xs text-slate-500 dark:text-slate-400 font-medium ml-8">
                {jobDetails.jobId 
                    ? `Job #${jobDetails.jobId}` 
                    : (jobDetails.customerName 
                        ? `${jobDetails.customerName} • ${jobDetails.moveDate}` 
                        : "New Inventory Draft")
                }
            </div>
          </div>
          <div className="flex gap-2">
            <button 
                onClick={openAddModal}
                className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 px-3 py-1.5 rounded-lg text-sm font-medium transition"
            >
                <Plus size={16} /> Add Item
            </button>
            <button
                onClick={() => setView('LOGIN')}
                className="p-2 text-slate-400 hover:text-blue-600 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg transition"
                title="Admin Login"
            >
                <Lock size={20} />
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-2xl mx-auto px-4 py-6">
        
        {isLoadingItems && items.length === 0 ? (
            <div className="flex justify-center py-12 text-slate-400 dark:text-slate-500">
                <Loader2 className="animate-spin mr-2" /> Loading inventory...
            </div>
        ) : (
            <>
                {/* 
                  Top Summary / Stats Bar
                  Only shows if items exist, replaces the helper text. 
                */}
                {items.length > 0 ? (
                   <div className="mb-4 bg-slate-900 dark:bg-slate-800 text-white rounded-xl p-4 shadow-lg grid grid-cols-2 gap-2 animate-in slide-in-from-top-2">
                        <div className="flex flex-col items-center border-r border-slate-700">
                             <div className="text-xs text-slate-400 flex items-center gap-1 mb-1"><Package size={12}/> Bx</div>
                            <div className="font-bold text-sm sm:text-lg">{boxCount}</div>
                        </div>
                        <div className="flex flex-col items-center">
                             <div className="text-xs text-slate-400 flex items-center gap-1 mb-1"><FileText size={12}/> Itm</div>
                            <div className="font-bold text-sm sm:text-lg">{otherCount}</div>
                        </div>
                   </div>
                ) : (
                    !isAnalyzing && (
                        <div className="mb-6 bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800 rounded-xl p-4 text-sm text-blue-800 dark:text-blue-300">
                            <strong>Start your inventory:</strong> Open the scanner, use voice commands ("3 boxes..."), or add items manually.
                        </div>
                    )
                )}

                {error && (
                <div className="mb-6 bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-800 text-red-600 dark:text-red-300 px-4 py-3 rounded-xl text-sm flex items-center gap-2 animate-pulse">
                    <span>⚠️</span> {error}
                </div>
                )}

                <div className="relative">
                    <CameraInput onImageCaptured={handleImageCaptured} isAnalyzing={isAnalyzing} />
                    <div className="absolute -bottom-5 right-4 z-10">
                        <VoiceInput onVoiceResult={handleVoiceResult} isProcessing={isAnalyzing} />
                    </div>
                </div>
                
                {items.length > 0 && (
                  <div className="flex items-center justify-between mb-4 mt-8">
                      <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-2">
                          <Box size={18} className="text-slate-400"/>
                          Inventory
                          <span className="text-xs font-normal text-slate-400 ml-1">
                              ({items.length} lines)
                          </span>
                      </h2>
                      <button 
                          onClick={async () => {
                              const toDelete = items.map(i => i.id);
                              setItems([]);
                              await Promise.all(toDelete.map(id => dbService.deleteItem(id)));
                          }}
                          className="text-xs text-red-400 hover:text-red-600 dark:hover:text-red-300 font-medium"
                      >
                          Clear All
                      </button>
                  </div>
                )}

                <InventoryList 
                  items={items}
                  onToggleSelect={handleToggleSelect}
                  onSelectAll={handleSelectAll}
                  onUpdateQuantity={handleUpdateQuantity}
                  onDeleteItem={handleDeleteItem}
                  onEditItem={openEditModal}
                />
            </>
        )}
      </main>

      {items.length > 0 && (
        <SummaryPanel 
            items={items} 
            crmConfig={settings.crmConfig} 
            jobDetails={jobDetails}
            adminEmail={settings.adminEmail}
            companyName={settings.companyName}
            onUpdateJobDetails={handleUpdateJobDetails}
        />
      )}

      <ItemFormModal 
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSave={handleSaveItem}
        initialData={editingItem}
      />
      
      {showDbSetup && (
        <DatabaseSetupModal onClose={() => setShowDbSetup(false)} />
      )}
    </div>
  );
};

export default App;