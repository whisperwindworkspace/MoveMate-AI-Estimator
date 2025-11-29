

import React, { useMemo, useState } from 'react';
import { CompanyProfile } from '../types';
import { dbService } from '../services/dbService';
import { signUpWithEmail } from '../services/authService';
import { COMPANIES } from '../config/companies';
import { CompanyQrCard } from './CompanyQrCard';
import DatabaseSetupModal from './DatabaseSetupModal';
import { Shield, Plus, Trash2, LogOut, Building, User, Loader2, QrCode, X, Edit2, Check, Infinity, RefreshCw, Database } from 'lucide-react';

interface SuperAdminDashboardProps {
  companies: CompanyProfile[];
  onAddCompany: (company: CompanyProfile) => void;
  onDeleteCompany: (id: string) => void;
  onUpdateCompany: () => void;
  onRefresh: () => void;
  onLogout: () => void;
}

const slugify = (s: string) =>
  s
    .toLowerCase()
    .trim()
    .replace(/['"]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

const SuperAdminDashboard: React.FC<SuperAdminDashboardProps> = ({
  companies,
  onAddCompany,
  onDeleteCompany,
  onUpdateCompany,
  onRefresh,
  onLogout
}) => {
  const [showAddForm, setShowAddForm] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState<'DB' | 'QR'>('DB');
  const [isRefreshing, setIsRefreshing] = useState(false);

  const [qrModalOpen, setQrModalOpen] = useState(false);
  const [selectedQrCompany, setSelectedQrCompany] = useState<CompanyProfile | null>(null);
  const [isDbModalOpen, setIsDbModalOpen] = useState(false);
  
  // Inline editing state for limits
  const [editingLimitId, setEditingLimitId] = useState<string | null>(null);
  const [tempLimit, setTempLimit] = useState<string>('');

  const baseUrl = useMemo(() => {
    if (typeof window === 'undefined') return 'https://app.movemate.ai';
    return window.location.origin;
  }, []);

  const [newCompany, setNewCompany] = useState({
    name: '',
    email: '',
    password: '',
    adminEmail: '',
    usageLimit: ''
  });

  const openQrModal = (comp: CompanyProfile) => {
    setSelectedQrCompany(comp);
    setQrModalOpen(true);
  };

  const closeQrModal = () => {
    setQrModalOpen(false);
    setSelectedQrCompany(null);
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await onRefresh();
    setTimeout(() => setIsRefreshing(false), 500);
  };

  const handleEditLimit = (comp: CompanyProfile) => {
      setEditingLimitId(comp.id);
      setTempLimit(comp.usageLimit ? comp.usageLimit.toString() : '');
  };

  const handleSaveLimit = async (id: string) => {
      try {
        const limitVal = tempLimit.trim() === '' ? null : parseInt(tempLimit);
        await dbService.updateCompanyLimit(id, limitVal);
        setEditingLimitId(null);
        if (onUpdateCompany) {
            onUpdateCompany();
        }
      } catch (e) {
          console.error("Failed to update limit", e);
          alert("Failed to update usage limit");
      }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCompany.name || !newCompany.email || !newCompany.password) return;

    setIsLoading(true);
    setError('');

    try {
      const computedSlug = slugify(newCompany.name);
      const limit = newCompany.usageLimit.trim() === '' ? null : parseInt(newCompany.usageLimit);

      const companyPayload: Partial<CompanyProfile> = {
        name: newCompany.name,
        slug: computedSlug,
        adminEmail: newCompany.adminEmail || newCompany.email,
        crmConfig: { provider: null, isConnected: false, apiKey: '' },
        username: newCompany.email,   // legacy compat only
        password: newCompany.password, // legacy compat only
        usageLimit: limit,
        primaryColor: '#2563eb' // Default blue
      };

      const createdCompany = await dbService.createCompany(companyPayload);

      if (!createdCompany || !createdCompany.id) {
        throw new Error('Failed to create company profile.');
      }

      if (!dbService.isOffline()) {
        await signUpWithEmail(newCompany.email, newCompany.password, createdCompany.id);
      }

      onAddCompany(createdCompany as CompanyProfile);
      setShowAddForm(false);
      setNewCompany({ name: '', email: '', password: '', adminEmail: '', usageLimit: '' });
    } catch (err: any) {
      console.error('Creation error', err);
      setError(err.message || 'Failed to create company and user.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100">
      <header className="bg-slate-800 border-b border-slate-700 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2 font-bold text-lg text-purple-400">
          <Shield /> Super Admin Console
        </div>
        <div className="flex items-center gap-2">
            <button
                onClick={() => setIsDbModalOpen(true)}
                className="text-slate-400 hover:text-blue-400 flex items-center gap-1 text-sm font-medium transition-colors mr-4"
                title="Database Maintenance"
            >
                <Database size={16} /> DB Maintenance
            </button>
            <button
                onClick={handleRefresh}
                className="text-slate-400 hover:text-white flex items-center gap-1 text-sm font-medium transition-colors mr-4"
                title="Refresh Data"
            >
                <RefreshCw size={16} className={isRefreshing ? "animate-spin" : ""} /> Refresh Data
            </button>
            <button
            onClick={onLogout}
            className="text-slate-400 hover:text-white flex items-center gap-1 text-sm font-medium transition-colors"
            >
            <LogOut size={16} /> Logout
            </button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto p-6">
        {/* Tabs */}
        <div className="flex gap-4 mb-6 border-b border-slate-700 pb-1">
          <button
            onClick={() => setActiveTab('DB')}
            className={`pb-2 px-2 text-sm font-medium transition-colors ${
              activeTab === 'DB'
                ? 'text-purple-400 border-b-2 border-purple-400'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Database Companies
          </button>
          <button
            onClick={() => setActiveTab('QR')}
            className={`pb-2 px-2 text-sm font-medium transition-colors ${
              activeTab === 'QR'
                ? 'text-purple-400 border-b-2 border-purple-400'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Static Intake Links (Config)
          </button>
        </div>

        {activeTab === 'DB' && (
          <>
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-semibold">Registered Companies</h2>
              <button
                onClick={() => setShowAddForm(true)}
                className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 text-sm font-medium transition"
              >
                <Plus size={18} /> Add Company
              </button>
            </div>

            {showAddForm && (
              <div className="bg-slate-800 rounded-xl p-6 mb-8 border border-slate-700 animate-in slide-in-from-top-2">
                <h3 className="text-lg font-bold mb-4 text-purple-300">New Company Profile</h3>
                {error && <div className="text-red-400 text-sm mb-4">{error}</div>}
                <form onSubmit={handleSubmit} className="grid grid-cols-2 gap-4">
                  <div className="col-span-2">
                    <label className="text-xs text-slate-400 uppercase font-bold">Company Name</label>
                    <input
                      placeholder="e.g. Acme Moving"
                      value={newCompany.name}
                      onChange={e => setNewCompany({ ...newCompany, name: e.target.value })}
                      className="w-full bg-slate-900 border border-slate-600 rounded-lg p-3 text-sm focus:border-purple-500 outline-none mt-1"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-slate-400 uppercase font-bold">Admin Email (Login)</label>
                    <input
                      placeholder="admin@acme.com"
                      type="email"
                      value={newCompany.email}
                      onChange={e => setNewCompany({ ...newCompany, email: e.target.value })}
                      className="w-full bg-slate-900 border border-slate-600 rounded-lg p-3 text-sm focus:border-purple-500 outline-none mt-1"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-slate-400 uppercase font-bold">Password</label>
                    <input
                      placeholder="••••••••"
                      type="password"
                      value={newCompany.password}
                      onChange={e => setNewCompany({ ...newCompany, password: e.target.value })}
                      className="w-full bg-slate-900 border border-slate-600 rounded-lg p-3 text-sm focus:border-purple-500 outline-none mt-1"
                    />
                  </div>
                  
                  <div>
                    <label className="text-xs text-slate-400 uppercase font-bold">Dispatch Email</label>
                    <input
                      placeholder="dispatch@acme.com"
                      value={newCompany.adminEmail}
                      onChange={e => setNewCompany({ ...newCompany, adminEmail: e.target.value })}
                      className="w-full bg-slate-900 border border-slate-600 rounded-lg p-3 text-sm focus:border-purple-500 outline-none mt-1"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-slate-400 uppercase font-bold">Usage Limit (Jobs)</label>
                    <input
                      placeholder="Leave empty for unlimited"
                      type="number"
                      value={newCompany.usageLimit}
                      onChange={e => setNewCompany({ ...newCompany, usageLimit: e.target.value })}
                      className="w-full bg-slate-900 border border-slate-600 rounded-lg p-3 text-sm focus:border-purple-500 outline-none mt-1"
                    />
                  </div>

                  <div className="col-span-2 flex justify-end gap-2 mt-4">
                    <button
                      type="button"
                      onClick={() => setShowAddForm(false)}
                      className="px-4 py-2 text-slate-400 hover:text-white"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={isLoading}
                      className="px-6 py-2 bg-purple-600 hover:bg-purple-500 rounded-lg font-bold flex items-center gap-2"
                    >
                      {isLoading && <Loader2 className="animate-spin" size={16} />}
                      Create & Register
                    </button>
                  </div>
                </form>
              </div>
            )}

            <div className="grid gap-4">
              {companies.map(comp => {
                const slug = comp.slug || slugify(comp.name) || comp.id;
                // Update to hash routing URL (Removed /c/)
                const intakeUrl = `${baseUrl}/#${slug}`;
                const usage = comp.usageCount || 0;
                const limit = comp.usageLimit;
                const isLimitReached = limit !== null && limit !== undefined && usage >= limit;

                return (
                  <div
                    key={comp.id}
                    className="bg-slate-800 p-5 rounded-xl border border-slate-700 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 group"
                  >
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <Building size={18} className="text-slate-400" />
                        <h3 className="font-bold text-lg">{comp.name}</h3>
                        {isLimitReached && (
                             <span className="text-[10px] bg-red-900/50 text-red-300 border border-red-800 px-2 py-0.5 rounded font-bold uppercase tracking-wide">
                                Limit Reached
                             </span>
                        )}
                        {comp.primaryColor && comp.primaryColor !== '#2563eb' && (
                             <span className="w-3 h-3 rounded-full border border-slate-600" style={{ backgroundColor: comp.primaryColor }} title="Brand Color Set"></span>
                        )}
                      </div>

                      <div className="flex gap-4 text-sm text-slate-400 flex-wrap items-center">
                        <span className="flex items-center gap-1">
                          <User size={14} /> {comp.adminEmail}
                        </span>
                        
                        {/* Usage Limit Display/Edit */}
                        <div className="flex items-center gap-2 bg-slate-900 px-2 py-1 rounded border border-slate-700">
                             <span className="text-xs uppercase font-bold text-slate-500">Usage:</span>
                             <span className={`font-mono ${isLimitReached ? 'text-red-400' : 'text-slate-200'}`}>
                                {usage} / {editingLimitId === comp.id ? (
                                    <input 
                                        type="number" 
                                        value={tempLimit} 
                                        onChange={(e) => setTempLimit(e.target.value)}
                                        className="w-16 bg-slate-800 border border-slate-600 rounded px-1 py-0.5 text-xs text-white"
                                        placeholder="∞"
                                        autoFocus
                                    />
                                ) : (limit ?? <Infinity size={14} className="inline"/>)}
                             </span>
                             
                             {editingLimitId === comp.id ? (
                                <button onClick={() => handleSaveLimit(comp.id)} className="text-green-400 hover:text-green-300">
                                    <Check size={14} />
                                </button>
                             ) : (
                                <button onClick={() => handleEditLimit(comp)} className="text-slate-500 hover:text-purple-400">
                                    <Edit2 size={12} />
                                </button>
                             )}
                        </div>

                        <span
                          className={`px-2 py-0.5 rounded text-xs border ${
                            comp.crmConfig?.isConnected
                              ? 'border-green-800 text-green-400'
                              : 'border-slate-600'
                          }`}
                        >
                          {comp.crmConfig?.isConnected ? comp.crmConfig.provider : 'No CRM'}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 w-full md:w-auto justify-end">
                      <button
                        onClick={() => openQrModal(comp)}
                        className="p-2 text-slate-400 hover:text-purple-300 hover:bg-slate-700 rounded-lg transition"
                        title="Generate Intake QR"
                      >
                        <QrCode size={20} />
                      </button>

                      <button
                        onClick={() => onDeleteCompany(comp.id)}
                        className="p-2 text-slate-500 hover:text-red-400 hover:bg-slate-700 rounded-lg transition"
                        title="Delete Company"
                      >
                        <Trash2 size={20} />
                      </button>
                    </div>

                    {/* QR MODAL */}
                    {qrModalOpen && selectedQrCompany?.id === comp.id && (
                      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
                        <div className="relative bg-slate-900 rounded-2xl border border-slate-700 shadow-2xl w-full max-w-sm p-6">
                          <button
                            onClick={closeQrModal}
                            className="absolute top-3 right-3 bg-white text-slate-900 rounded-full p-1.5 hover:bg-slate-200"
                          >
                            <X size={18} />
                          </button>

                          <div className="flex justify-center mt-4">
                            <CompanyQrCard
                              name={comp.name}
                              url={intakeUrl}
                              description="Customer Intake Link"
                              color={comp.primaryColor || '#2563eb'}
                            />
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}

        {activeTab === 'QR' && (
          <div>
            <div className="flex items-center gap-3 mb-6">
              <h2 className="text-xl font-semibold">Static Intake Links</h2>
              <span className="text-xs bg-slate-800 px-2 py-1 rounded text-slate-400">
                From config/companies.ts
              </span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {COMPANIES.map(comp => (
                <CompanyQrCard 
                  key={comp.slug} 
                  name={comp.name}
                  url={`${baseUrl}/#${comp.slug}`} // Removed /c/ and /#/
                  description="Scan to start inventory"
                  color={comp.primaryColor || '#475569'}
                  logoUrl={comp.logoUrl}
                />
              ))}
            </div>
          </div>
        )}
      </main>

      {/* Database Setup Modal */}
      {isDbModalOpen && <DatabaseSetupModal onClose={() => setIsDbModalOpen(false)} />}
    </div>
  );
};

export default SuperAdminDashboard;
