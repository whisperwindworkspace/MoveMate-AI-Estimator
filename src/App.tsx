import React, { useState } from 'react';
import { InventoryItem, ViewMode, CompanyProfile } from './types';
import { dbService } from './services/dbService';
import CameraInput from './components/CameraInput';
import VoiceInput from './components/VoiceInput';
import InventoryList from './components/InventoryList';
import SummaryPanel from './components/SummaryPanel';
import ItemFormModal from './components/ItemFormModal';
import CRMConfigModal from './components/CRMConfigModal';
import AdminLogin from './components/AdminLogin';
import AdminDashboard from './components/AdminDashboard';
import SuperAdminDashboard from './components/SuperAdminDashboard';
import { Box, Truck, Plus, Lock, Loader2, FileText, Package, ArrowRight, ArrowLeft, ShieldAlert, SearchX } from 'lucide-react';

// Hooks
import { useCompanyInit } from './hooks/useCompanyInit';
import { useAuth } from './hooks/useAuth';
import { useInventory } from './hooks/useInventory';

interface AppProps {
  initialSlug?: string;
}

const App: React.FC<AppProps> = ({ initialSlug }) => {
  // Navigation State
  const [view, setView] = useState<ViewMode>('INVENTORY');
  
  // Custom Hooks
  const { 
    isInitComplete, isLimitReached, detectedCompanyId, settings, 
    setSettings, setIsLimitReached 
  } = useCompanyInit(initialSlug);

  const { 
    currentUserRole, currentCompanyId, handleLogin, handleLogout 
  } = useAuth(
    view, 
    setView, 
    setSettings, 
    setIsLimitReached, 
    () => { /* Re-init logic handled by useEffect in hook implicitly */ }
  );

  const [sessionId] = useState<string>(() => crypto.randomUUID());
  
  const {
    items, setItems, isAnalyzing, error, 
    jobDetails, handleUpdateJobDetails,
    handleImageCaptured, handleVideoCaptured, handleVoiceResult,
    handleToggleSelect, handleSelectAll, handleUpdateQuantity, 
    handleDeleteItem, handleSaveItem
  } = useInventory(sessionId, isLimitReached);
  
  // UI State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<InventoryItem | undefined>(undefined);

  // --- Handlers & Helpers ---
  const handleUpdateSettings = async (s: any) => {
      setSettings(s);
      if (currentCompanyId) await dbService.updateCompanySettings(currentCompanyId, { adminEmail: s.adminEmail, crmConfig: s.crmConfig, primaryColor: s.primaryColor, logoUrl: s.logoUrl });
  };
  const handleAddCompany = async (c: CompanyProfile) => { try { await dbService.createCompany(c); } catch {} };
  const handleDeleteCompany = async (id: string) => { await dbService.deleteCompany(id); };
  
  const handlePasswordReset = async () => ({ success: true, code: '123456' });
  const handleCompleteReset = async () => {};

  // Stats
  const activeItems = items.filter(i => i.selected);
  const boxCount = activeItems.filter(i => i.category === 'Box').reduce((acc, i) => acc + i.quantity, 0);
  const otherCount = activeItems.filter(i => i.category !== 'Box').reduce((acc, i) => acc + i.quantity, 0);

  // --- Render Views ---

  if (!isInitComplete) {
      return (
          <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center pt-10">
                <Loader2 className="animate-spin text-blue-600" size={32} />
          </div>
      )
  }
  
  // STRICT LIMIT ENFORCEMENT - 404 SCREEN
  if (isLimitReached && currentUserRole !== 'SUPER_ADMIN') {
      return (
          <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col items-center justify-center p-6 text-center pt-16 relative">
                <div className="max-w-md w-full space-y-6 animate-in fade-in zoom-in duration-300">
                    <div className="relative">
                        <div className="absolute inset-0 bg-red-100 dark:bg-red-900/20 rounded-full blur-2xl"></div>
                        <h1 className="relative text-8xl font-black text-slate-200 dark:text-slate-800 tracking-tighter">404</h1>
                    </div>
                    
                    <div className="space-y-4 relative z-10">
                        <div className="mx-auto w-16 h-16 bg-red-100 dark:bg-red-900/30 text-red-500 rounded-full flex items-center justify-center">
                            <SearchX size={32} />
                        </div>
                        
                        <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-100">
                            Service Unavailable
                        </h2>
                        
                        <p className="text-slate-500 dark:text-slate-400">
                            This inventory session link is no longer active or the usage limit has been reached.
                        </p>
                    </div>
                    
                    {/* Discreet Admin Login for Owner */}
                    <div className="absolute bottom-6 right-6 opacity-20 hover:opacity-100 transition-opacity">
                        <button onClick={() => setView('LOGIN')} className="text-slate-400 p-2">
                            <Lock size={14} />
                        </button>
                    </div>
                </div>
            </div>
      );
  }

  // STRICT UNAUTHORIZED ACCESS CHECK
  if (currentUserRole === 'GUEST' && !detectedCompanyId && view !== 'LOGIN') {
      return (
          <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col items-center justify-center p-6 text-center pt-16 relative">
                <div className="max-w-md w-full space-y-6 animate-in fade-in zoom-in duration-300">
                        <div className="mx-auto w-20 h-20 bg-red-100 dark:bg-red-900/30 text-red-600 rounded-full flex items-center justify-center mb-6">
                            <ShieldAlert size={40} />
                        </div>

                        <h1 className="text-3xl font-bold text-slate-800 dark:text-slate-100">
                            Unauthorized Access
                        </h1>
                        
                        <p className="text-slate-600 dark:text-slate-400 text-lg">
                            You are attempting to access this application from an invalid source.
                        </p>
                        
                        <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
                            <p className="text-slate-500 dark:text-slate-400 text-sm">
                                Please use the <strong>specific intake link</strong> provided by your moving company.
                            </p>
                        </div>

                        {/* DISCREET ADMIN LOGIN */}
                        <div className="absolute bottom-8 right-8">
                             <button
                                onClick={() => setView('LOGIN')}
                                className="text-slate-300 dark:text-slate-700 hover:text-slate-500 dark:hover:text-slate-500 transition-colors p-2"
                                title="Admin Login"
                            >
                                <Lock size={16} />
                            </button>
                        </div>
                </div>
            </div>
      );
  }

  if (view === 'LOGIN') return <AdminLogin onLogin={handleLogin} onRequestReset={handlePasswordReset} onResetPassword={handleCompleteReset} onBack={() => setView('INVENTORY')} />;
  
  if (view === 'SUPER_ADMIN_DASHBOARD') {
     const Wrapper = () => {
        const [l, sL] = useState<CompanyProfile[]>([]);
        React.useEffect(() => { dbService.getAllCompanies().then(sL); }, []);
        const refresh = () => dbService.getAllCompanies().then(sL);
        return <SuperAdminDashboard companies={l} onAddCompany={refresh} onDeleteCompany={async (id) => { await handleDeleteCompany(id); refresh(); }} onUpdateCompany={refresh} onRefresh={refresh} onLogout={() => handleLogout(setView)} />;
    };
    return <Wrapper />;
  }

  if (view === 'COMPANY_DASHBOARD') return <AdminDashboard settings={settings} onUpdateSettings={handleUpdateSettings} onLogout={() => handleLogout(setView)} />;
  
  if (view === 'SUMMARY') {
    return (
        <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 pb-32 transition-colors duration-300">
             <header className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 sticky top-0 z-40 transition-colors">
                <div className="max-w-2xl mx-auto px-4 py-4 flex items-center gap-3">
                     <button onClick={() => setView('INVENTORY')} className="p-2 -ml-2 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors">
                        <ArrowLeft size={24} />
                     </button>
                     <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">Review & Submit</h1>
                </div>
             </header>
             <main className="max-w-2xl mx-auto px-4 py-6">
                <SummaryPanel 
                    items={items} 
                    crmConfig={settings.crmConfig} 
                    jobDetails={jobDetails} 
                    adminEmail={settings.adminEmail} 
                    companyName={settings.companyName} 
                    onUpdateJobDetails={handleUpdateJobDetails} 
                    companyId={currentCompanyId || detectedCompanyId}
                    sessionId={sessionId}
                />
             </main>
        </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 pb-32 transition-colors duration-300 pt-8">
      
      <header className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 sticky top-0 z-40 transition-colors">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex flex-col">
            <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
              <Truck style={{ color: settings.primaryColor }} size={24} /> {settings.companyName}
            </h1>
            <div className="text-xs text-slate-500 dark:text-slate-400 font-medium ml-8">
                {jobDetails.jobId || (jobDetails.customerName ? `${jobDetails.customerName}` : "New Inventory")}
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={() => { setEditingItem(undefined); setIsModalOpen(true); }} className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 px-3 py-1.5 rounded-lg text-sm font-medium transition">
                <Plus size={16} /> Add Item
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

      {/* Floating Action Button for Summary */}
      {items.length > 0 && (
        <div className="fixed bottom-6 left-0 right-0 px-4 z-30 flex justify-center pointer-events-none">
            <button
                onClick={() => setView('SUMMARY')}
                className="pointer-events-auto shadow-xl shadow-blue-900/20 bg-blue-600 hover:bg-blue-700 text-white rounded-full px-6 py-3 font-bold text-lg flex items-center gap-2 transition-all active:scale-95 animate-in slide-in-from-bottom-4"
            >
                Review Inventory <ArrowRight size={20} />
            </button>
        </div>
      )}

      <ItemFormModal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)} 
        onSave={(data) => handleSaveItem(data, editingItem?.id)} 
        initialData={editingItem} 
      />
    </div>
  );
};

export default App;