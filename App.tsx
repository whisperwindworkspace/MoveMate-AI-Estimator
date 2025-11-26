
import React, { useState, useEffect } from 'react';
import { InventoryItem, AppSettings, JobDetails, ViewMode, CompanyProfile, UserRole } from './types';
import { DEFAULT_ADMIN_EMAIL } from './constants';
import { analyzeImageForInventory, parseVoiceCommand, analyzeVideoFrames } from './services/geminiService';
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
    const initCompany = async () => {
        const params = new URLSearchParams(window.location.search);
        const companyId = params.get('cid');
        
        const hashSlug = window.location.hash.replace(/^#/, '');
        const companySlug = initialSlug || hashSlug || params.get('slug');
        
        if (companyId) {
            const profile = await dbService.getCompanyPublicProfile(companyId);
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
            }
        } else if (companySlug) {
            let profile = await dbService.getCompanyBySlug(companySlug);
            if (!profile) {
                const configProfile = getCompanyBySlug(companySlug);
                if (configProfile) {
                    setSettings({
                        companyName: configProfile.name,
                        adminEmail: configProfile.destinationEmail,
                        crmConfig: { provider: null, isConnected: false, apiKey: '' },
                        primaryColor: configProfile.primaryColor,
                        logoUrl: configProfile.logoUrl
                    });
                    return;
                }
            }

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
            }
        }
    };
    initCompany();

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

  const activeJobId = jobDetails.jobId || sessionId;

  const handleImageCaptured = async (base64: string) => {
    setIsAnalyzing(true);
    setError(null);
    try {
      const newItems = await analyzeImageForInventory(base64);
      // Save & Update
      for (const item of newItems) {
         const saved = await dbService.upsertItem(item, activeJobId);
         setItems(prev => [...prev, saved]);
      }
    } catch (err) {
      console.error(err);
      setError("Failed to analyze image. Please try again.");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleVideoCaptured = async (frames: string[]) => {
      setIsAnalyzing(true);
      setError(null);
      try {
          const newItems = await analyzeVideoFrames(frames);
          for (const item of newItems) {
              const saved = await dbService.upsertItem(item, activeJobId);
              setItems(prev => [...prev, saved]);
          }
      } catch (err) {
          console.error(err);
          setError("Failed to analyze video. Please try again or use Photo mode.");
      } finally {
          setIsAnalyzing(false);
      }
  };

  // Rest of handlers...
  const handleUpdateJobDetails = async (details: JobDetails) => {
    const oldId = jobDetails.jobId || sessionId;
    const newId = details.jobId || sessionId;
    setJobDetails(details);
    if (details.jobId && details.jobId !== oldId) {
       try {
         await dbService.updateJobId(oldId, details.jobId);
         const refreshed = await dbService.getItems(details.jobId);
         setItems(refreshed);
       } catch (e) { console.error(e); }
    }
  };

    const handleLogin = async (u: string, p: string) => {
    const user = await signInWithEmail(u, p);
    if (!user) return false;

    const profile = await getUserProfile(user.id);
    if (!profile) {
        await signOut();
        return false;
    }

    // Role & view routing stays handled by the auth subscription in useEffect
    return true;
    };

  const handleRequestPasswordReset = async (e: string) => { return { success: true, code: '123456' }; };
  const handleCompletePasswordReset = async () => {};
  
  const handleLogout = async () => {
    if (!dbService.isOffline()) try { await signOut(); } catch {}
    setCurrentUserRole('GUEST'); setCurrentCompanyId(null); setView('INVENTORY');
  };

  const handleAddCompany = async (c: CompanyProfile) => { try { await dbService.createCompany(c); } catch {} };
  const handleDeleteCompany = async (id: string) => { await dbService.deleteCompany(id); };
  const handleUpdateSettings = async (s: AppSettings) => {
      setSettings(s);
      if (currentCompanyId) await dbService.updateCompanySettings(currentCompanyId, { adminEmail: s.adminEmail, crmConfig: s.crmConfig, primaryColor: s.primaryColor, logoUrl: s.logoUrl });
  };

  const handleVoiceResult = async (transcript: string) => {
    setIsAnalyzing(true);
    setError(null);
    try {
        const newItems = await parseVoiceCommand(transcript);
        for (const item of newItems) {
            const saved = await dbService.upsertItem(item, activeJobId);
            setItems(p => [...p, saved]);
        }
    } catch (err) { console.error(err); setError("Voice command failed."); } 
    finally { setIsAnalyzing(false); }
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
      const updated = items.map(i => ({ ...i, selected: select }));
      setItems(updated);
      updated.forEach(i => dbService.upsertItem(i, activeJobId));
  };

  const handleUpdateQuantity = async (id: string, d: number) => {
    const item = items.find(i => i.id === id);
    if (item) {
        const updated = { ...item, quantity: Math.max(1, item.quantity + d) };
        setItems(items.map(i => i.id === id ? updated : i));
        await dbService.upsertItem(updated, activeJobId);
    }
  };

  const handleDeleteItem = async (id: string) => {
    setItems(items.filter(i => i.id !== id));
    await dbService.deleteItem(id);
  };

  const handleSaveItem = async (data: Partial<InventoryItem>) => {
      if (editingItem) {
          const updated = { ...editingItem, ...data } as InventoryItem;
          setItems(items.map(i => i.id === editingItem.id ? updated : i));
          await dbService.upsertItem(updated, activeJobId);
      } else {
          const newItem = { ...data, id: crypto.randomUUID(), selected: true } as InventoryItem;
          setItems([...items, newItem]);
          await dbService.upsertItem(newItem, activeJobId);
      }
      setIsModalOpen(false);
  };

  // Stats
  const activeItems = items.filter(i => i.selected);
  const boxCount = activeItems.filter(i => i.category === 'Box').reduce((acc, i) => acc + i.quantity, 0);
  const otherCount = activeItems.filter(i => i.category !== 'Box').reduce((acc, i) => acc + i.quantity, 0);

  // Render Logic
  if (isLimitReached) {
      return (
          <div className="min-h-screen bg-slate-100 dark:bg-slate-900 flex flex-col items-center justify-center p-6 text-center">
              <div className="bg-white dark:bg-slate-800 p-8 rounded-2xl shadow-xl max-w-md w-full border border-slate-200 dark:border-slate-700">
                  <Ban size={40} className="text-red-500 mx-auto mb-4" />
                  <h1 className="text-2xl font-bold dark:text-white mb-2">Limit Reached</h1>
                  <p className="text-slate-500 dark:text-slate-400">Please contact administrator.</p>
              </div>
          </div>
      );
  }

  if (view === 'LOGIN') return <AdminLogin onLogin={handleLogin} onRequestReset={handleRequestPasswordReset} onResetPassword={handleCompletePasswordReset} onBack={() => setView('INVENTORY')} />;
  
  const SuperAdminWrapper = () => {
      const [l, sL] = useState<CompanyProfile[]>([]);
      useEffect(() => { dbService.getAllCompanies().then(sL); }, []);
      const refresh = () => dbService.getAllCompanies().then(sL);
      return <SuperAdminDashboard companies={l} onAddCompany={refresh} onDeleteCompany={async (id) => { await handleDeleteCompany(id); refresh(); }} onUpdateCompany={refresh} onLogout={handleLogout} />;
  };
  if (view === 'SUPER_ADMIN_DASHBOARD') return <SuperAdminWrapper />;
  if (view === 'COMPANY_DASHBOARD') return <AdminDashboard settings={settings} onUpdateSettings={handleUpdateSettings} onLogout={handleLogout} />;

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 pb-32 transition-colors duration-300">
      <header className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 sticky top-0 z-40 transition-colors">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex flex-col">
            <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
              <Truck style={{ color: settings.primaryColor }} size={24} /> {settings.companyName}
              {dbService.isOffline() && <span className="text-[10px] bg-amber-100 text-amber-800 px-2 rounded">Demo</span>}
            </h1>
            <div className="text-xs text-slate-500 dark:text-slate-400 font-medium ml-8">
                {jobDetails.jobId || (jobDetails.customerName ? `${jobDetails.customerName}` : "New Inventory")}
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={() => { setEditingItem(undefined); setIsModalOpen(true); }} className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 px-3 py-1.5 rounded-lg text-sm font-medium transition">
                <Plus size={16} /> Add Item
            </button>
            <button onClick={() => setView('LOGIN')} className="p-2 text-slate-400 hover:text-blue-600 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg transition">
                <Lock size={20} />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6">
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
                    <strong>Scan Your Items:</strong> Capture single photos of furniture, or use "Video Mode" to walk through a room.
                </div>
            )
        )}

        {error && <div className="mb-6 bg-red-50 text-red-600 px-4 py-3 rounded-xl text-sm">{error}</div>}

        <div className="relative">
            <CameraInput 
                onImageCaptured={handleImageCaptured}
                onVideoCaptured={handleVideoCaptured}
                isAnalyzing={isAnalyzing} 
                extraAction={<VoiceInput onVoiceResult={handleVoiceResult} isProcessing={isAnalyzing} variant="inline" />}
            />
        </div>
        
        {items.length > 0 && (
            <div className="flex items-center justify-between mb-4 mt-8">
                <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-2">
                    <Box size={18} className="text-slate-400"/> Inventory <span className="text-xs text-slate-400">({items.length})</span>
                </h2>
                <button onClick={async () => { setItems([]); await Promise.all(items.map(i => dbService.deleteItem(i.id))); }} className="text-xs text-red-400 hover:text-red-600 font-medium">Clear All</button>
            </div>
        )}

        <InventoryList 
            items={items}
            onToggleSelect={handleToggleSelect}
            onSelectAll={handleSelectAll}
            onUpdateQuantity={handleUpdateQuantity}
            onDeleteItem={handleDeleteItem}
            onEditItem={(i) => { setEditingItem(i); setIsModalOpen(true); }}
        />
      </main>

      {items.length > 0 && (
        <SummaryPanel items={items} crmConfig={settings.crmConfig} jobDetails={jobDetails} adminEmail={settings.adminEmail} companyName={settings.companyName} onUpdateJobDetails={handleUpdateJobDetails} />
      )}

      <ItemFormModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} onSave={handleSaveItem} initialData={editingItem} />
      {showDbSetup && <DatabaseSetupModal onClose={() => setShowDbSetup(false)} />}
    </div>
  );
};

export default App;
