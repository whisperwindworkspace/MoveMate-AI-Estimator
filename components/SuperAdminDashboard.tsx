import React, { useState } from 'react';
import { CompanyProfile } from '../types';
import { dbService } from '../services/dbService';
import { signUpWithEmail } from '../services/authService';
import { COMPANIES } from '../config/companies';
import { CompanyQrCard } from './CompanyQrCard';
import { Shield, Plus, Trash2, LogOut, Building, User, Loader2, QrCode } from 'lucide-react';

interface SuperAdminDashboardProps {
  companies: CompanyProfile[];
  onAddCompany: (company: CompanyProfile) => void;
  onDeleteCompany: (id: string) => void;
  onLogout: () => void;
}

const SuperAdminDashboard: React.FC<SuperAdminDashboardProps> = ({ companies, onAddCompany, onDeleteCompany, onLogout }) => {
  const [showAddForm, setShowAddForm] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState<'DB' | 'QR'>('DB');
  
  const [newCompany, setNewCompany] = useState({
    name: '',
    email: '',
    password: '',
    adminEmail: ''
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCompany.name || !newCompany.email || !newCompany.password) return;

    setIsLoading(true);
    setError('');

    try {
        // 1. Create Company Profile in DB
        // Offline check logic handled inside dbService, but for online we do:
        const companyPayload: Partial<CompanyProfile> = {
            name: newCompany.name,
            adminEmail: newCompany.adminEmail || newCompany.email,
            crmConfig: { provider: null, isConnected: false, apiKey: '' },
            username: newCompany.email, // Legacy compat
            password: newCompany.password // Legacy compat
        };

        const createdCompany = await dbService.createCompany(companyPayload);

        if (!createdCompany || !createdCompany.id) {
            throw new Error("Failed to create company profile.");
        }

        // 2. Register User in Supabase Auth (if Online)
        if (!dbService.isOffline()) {
            await signUpWithEmail(newCompany.email, newCompany.password, createdCompany.id);
        }

        onAddCompany(createdCompany);
        setShowAddForm(false);
        setNewCompany({ name: '', email: '', password: '', adminEmail: '' });

    } catch (err: any) {
        console.error("Creation error", err);
        setError(err.message || "Failed to create company and user.");
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
        <button 
          onClick={onLogout}
          className="text-slate-400 hover:text-white flex items-center gap-1 text-sm font-medium transition-colors"
        >
          <LogOut size={16} /> Logout
        </button>
      </header>

      <main className="max-w-5xl mx-auto p-6">
        
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
                                    onChange={e => setNewCompany({...newCompany, name: e.target.value})}
                                    className="w-full bg-slate-900 border border-slate-600 rounded-lg p-3 text-sm focus:border-purple-500 outline-none mt-1"
                                />
                            </div>
                            <div>
                                <label className="text-xs text-slate-400 uppercase font-bold">Admin Email (Login)</label>
                                <input 
                                    placeholder="admin@acme.com"
                                    type="email"
                                    value={newCompany.email}
                                    onChange={e => setNewCompany({...newCompany, email: e.target.value})}
                                    className="w-full bg-slate-900 border border-slate-600 rounded-lg p-3 text-sm focus:border-purple-500 outline-none mt-1"
                                />
                            </div>
                            <div>
                                <label className="text-xs text-slate-400 uppercase font-bold">Password</label>
                                <input 
                                    placeholder="••••••••"
                                    type="password"
                                    value={newCompany.password}
                                    onChange={e => setNewCompany({...newCompany, password: e.target.value})}
                                    className="w-full bg-slate-900 border border-slate-600 rounded-lg p-3 text-sm focus:border-purple-500 outline-none mt-1"
                                />
                            </div>
                            <div className="col-span-2">
                                <label className="text-xs text-slate-400 uppercase font-bold">Dispatch Email (Notifications)</label>
                                <input 
                                    placeholder="dispatch@acme.com"
                                    value={newCompany.adminEmail}
                                    onChange={e => setNewCompany({...newCompany, adminEmail: e.target.value})}
                                    className="w-full bg-slate-900 border border-slate-600 rounded-lg p-3 text-sm focus:border-purple-500 outline-none mt-1"
                                />
                            </div>
                            
                            <div className="col-span-2 flex justify-end gap-2 mt-4">
                                <button type="button" onClick={() => setShowAddForm(false)} className="px-4 py-2 text-slate-400 hover:text-white">Cancel</button>
                                <button 
                                    type="submit" 
                                    disabled={isLoading}
                                    className="px-6 py-2 bg-purple-600 hover:bg-purple-500 rounded-lg font-bold flex items-center gap-2"
                                >
                                    {isLoading && <Loader2 className="animate-spin" size={16}/>}
                                    Create & Register
                                </button>
                            </div>
                        </form>
                    </div>
                )}

                <div className="grid gap-4">
                    {companies.map(comp => (
                        <div key={comp.id} className="bg-slate-800 p-5 rounded-xl border border-slate-700 flex justify-between items-center group">
                            <div>
                                <div className="flex items-center gap-2 mb-1">
                                    <Building size={18} className="text-slate-400" />
                                    <h3 className="font-bold text-lg">{comp.name}</h3>
                                </div>
                                <div className="flex gap-4 text-sm text-slate-400">
                                    <span className="flex items-center gap-1"><User size={14}/> {comp.username}</span>
                                    <span>{comp.adminEmail}</span>
                                    <span className={`px-2 py-0.5 rounded text-xs border ${comp.crmConfig.isConnected ? 'border-green-800 text-green-400' : 'border-slate-600'}`}>
                                        {comp.crmConfig.isConnected ? comp.crmConfig.provider : 'No CRM'}
                                    </span>
                                </div>
                            </div>
                            <button 
                                onClick={() => onDeleteCompany(comp.id)}
                                className="p-2 text-slate-500 hover:text-red-400 hover:bg-slate-700 rounded-lg transition"
                            >
                                <Trash2 size={20} />
                            </button>
                        </div>
                    ))}
                </div>
            </>
        )}

        {activeTab === 'QR' && (
            <div>
                 <div className="flex items-center gap-3 mb-6">
                    <h2 className="text-xl font-semibold">Static Intake Links</h2>
                    <span className="text-xs bg-slate-800 px-2 py-1 rounded text-slate-400">From config/companies.ts</span>
                 </div>
                 <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {COMPANIES.map(comp => (
                        <CompanyQrCard key={comp.slug} company={comp} />
                    ))}
                 </div>
            </div>
        )}

      </main>
    </div>
  );
};

export default SuperAdminDashboard;
