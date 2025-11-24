import React, { useState } from 'react';
import { CompanyProfile } from '../types';
import { dbService } from '../services/dbService';
import { signUpWithEmail } from '../services/authService';
import { COMPANIES } from '../config/companies';
import { CompanyQrCard } from './CompanyQrCard';
import DatabaseSetupModal from './DatabaseSetupModal';
import {
  Shield,
  Plus,
  Trash2,
  LogOut,
  Building,
  User,
  Loader2,
  Database,
  QrCode,
  X,
} from 'lucide-react';

interface SuperAdminDashboardProps {
  companies: CompanyProfile[];
  onAddCompany: (company: CompanyProfile) => void;
  onDeleteCompany: (id: string) => void;
  onLogout: () => void;
}

const SuperAdminDashboard: React.FC<SuperAdminDashboardProps> = ({
  companies,
  onAddCompany,
  onDeleteCompany,
  onLogout,
}) => {
  const [showAddForm, setShowAddForm] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState<'DB' | 'QR'>('DB');
  const [showDbSetup, setShowDbSetup] = useState(false);

  // QR modal state for DB-backed companies
  const [qrModalOpen, setQrModalOpen] = useState(false);
  const [selectedQrCompany, setSelectedQrCompany] = useState<{
    name: string;
    url: string;
  } | null>(null);

  const [newCompany, setNewCompany] = useState({
    name: '',
    email: '',
    password: '',
    adminEmail: '',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCompany.name || !newCompany.email || !newCompany.password) return;

    setIsLoading(true);
    setError('');

    try {
      // 1. Create company profile in DB
      const companyPayload: Partial<CompanyProfile> = {
        name: newCompany.name,
        adminEmail: newCompany.adminEmail || newCompany.email,
        crmConfig: { provider: null, isConnected: false, apiKey: '' },
        username: newCompany.email, // legacy compatibility
        password: newCompany.password, // legacy compatibility
      };

      const createdCompany = await dbService.createCompany(companyPayload);

      if (!createdCompany || !createdCompany.id) {
        throw new Error('Failed to create company profile.');
      }

      // 2. Register auth user (only when online)
      if (!dbService.isOffline()) {
        await signUpWithEmail(
          newCompany.email,
          newCompany.password,
          createdCompany.id,
        );
      }

      onAddCompany(createdCompany as CompanyProfile);
      setShowAddForm(false);
      setNewCompany({ name: '', email: '', password: '', adminEmail: '' });
    } catch (err: any) {
      console.error('Creation error', err);
      setError(err.message || 'Failed to create company and user.');
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Build an intake URL for a DB company.
   * Priority:
   *   1) company.slug  -> /c/<slug>
   *   2) company.id    -> /?cid=<id>  (legacy fallback)
   */
  const openQrModal = (company: CompanyProfile) => {
    const baseUrl = window.location.origin;

    const slug = (company as any).slug as string | undefined;
    const id = company?.id;

    const link = slug
      ? `${baseUrl}/c/${slug}`
      : id
      ? `${baseUrl}/?cid=${id}`
      : null;

    if (!link) {
      console.error('QR generation failed: company has no slug or id');
      return;
    }

    setSelectedQrCompany({ name: company.name, url: link });
    setQrModalOpen(true);
  };

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100">
      {/* HEADER */}
      <header className="bg-slate-800 border-b border-slate-700 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2 font-bold text-lg text-purple-400">
          <Shield className="w-5 h-5" />
          <span>Super Admin Console</span>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowDbSetup(true)}
            className="flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-600 text-sm text-slate-200 hover:bg-slate-700 hover:border-purple-500 transition-colors"
          >
            <Database size={16} /> System Setup
          </button>
          <button
            onClick={onLogout}
            className="flex items-center gap-2 px-3 py-2 rounded-lg border border-red-500/60 text-sm text-red-300 hover:bg-red-600/10 hover:border-red-400 transition-colors"
          >
            <LogOut size={16} /> Logout
          </button>
        </div>
      </header>

      {/* MAIN CONTENT */}
      <main className="max-w-6xl mx-auto px-4 py-8 space-y-8">
        {/* Tabs */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex gap-6 border-b border-slate-700">
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
              Legacy/Static Config Links
            </button>
          </div>

          {activeTab === 'DB' && (
            <button
              onClick={() => setShowAddForm((v) => !v)}
              className="flex items-center gap-2 bg-purple-600 hover:bg-purple-500 text-sm font-medium px-3 py-2 rounded-lg shadow-sm shadow-purple-900/40"
            >
              <Plus size={16} /> Add Company
            </button>
          )}
        </div>

        {/* DB TAB */}
        {activeTab === 'DB' && (
          <>
            {/* Add company form */}
            {showAddForm && (
              <section className="bg-slate-800/80 border border-slate-700 rounded-xl p-5 mb-6">
                <div className="flex justify-between items-center mb-4">
                  <h2 className="font-semibold text-lg">Onboard New Company</h2>
                  <button
                    onClick={() => setShowAddForm(false)}
                    className="text-slate-400 hover:text-slate-100"
                  >
                    <X size={18} />
                  </button>
                </div>

                {error && (
                  <div className="mb-3 text-sm text-red-400 bg-red-950/40 border border-red-700/60 rounded p-2">
                    {error}
                  </div>
                )}

                <form
                  onSubmit={handleSubmit}
                  className="grid grid-cols-2 gap-4 text-sm"
                >
                  <div className="col-span-2">
                    <label className="text-xs text-slate-400 uppercase font-semibold">
                      Company Name
                    </label>
                    <input
                      required
                      placeholder="Acme Moving Co"
                      value={newCompany.name}
                      onChange={(e) =>
                        setNewCompany({ ...newCompany, name: e.target.value })
                      }
                      className="mt-1 w-full bg-slate-900 border border-slate-700 rounded-lg p-3 text-sm focus:border-purple-500 outline-none"
                    />
                  </div>

                  <div>
                    <label className="text-xs text-slate-400 uppercase font-semibold">
                      Admin Login Email
                    </label>
                    <input
                      required
                      type="email"
                      placeholder="admin@acme.com"
                      value={newCompany.email}
                      onChange={(e) =>
                        setNewCompany({ ...newCompany, email: e.target.value })
                      }
                      className="mt-1 w-full bg-slate-900 border border-slate-700 rounded-lg p-3 text-sm focus:border-purple-500 outline-none"
                    />
                  </div>

                  <div>
                    <label className="text-xs text-slate-400 uppercase font-semibold">
                      Temporary Password
                    </label>
                    <input
                      required
                      type="password"
                      placeholder="One-time setup password"
                      value={newCompany.password}
                      onChange={(e) =>
                        setNewCompany({
                          ...newCompany,
                          password: e.target.value,
                        })
                      }
                      className="mt-1 w-full bg-slate-900 border border-slate-700 rounded-lg p-3 text-sm focus:border-purple-500 outline-none"
                    />
                  </div>

                  <div className="col-span-2">
                    <label className="text-xs text-slate-400 uppercase font-semibold">
                      Dispatch / Manifest Email (optional)
                    </label>
                    <input
                      placeholder="dispatch@acme.com"
                      value={newCompany.adminEmail}
                      onChange={(e) =>
                        setNewCompany({
                          ...newCompany,
                          adminEmail: e.target.value,
                        })
                      }
                      className="mt-1 w-full bg-slate-900 border border-slate-700 rounded-lg p-3 text-sm focus:border-purple-500 outline-none"
                    />
                  </div>

                  <div className="col-span-2 flex justify-end gap-2 mt-2">
                    <button
                      type="button"
                      onClick={() => setShowAddForm(false)}
                      className="px-4 py-2 text-slate-400 hover:text-slate-100"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={isLoading}
                      className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-500 text-sm font-medium disabled:opacity-60 disabled:cursor-not-allowed"
                    >
                      {isLoading && <Loader2 size={16} className="animate-spin" />}
                      <span>Create Company</span>
                    </button>
                  </div>
                </form>
              </section>
            )}

            {/* Companies list */}
            <section className="bg-slate-800/60 border border-slate-700 rounded-xl p-5">
              <h2 className="font-semibold mb-4">Registered Companies</h2>

              {companies.length === 0 && (
                <p className="text-sm text-slate-400">
                  No companies found. Use “Add Company” to onboard your first
                  tenant.
                </p>
              )}

              <div className="grid gap-4">
                {companies.map((comp) => (
                  <div
                    key={comp.id}
                    className="bg-slate-900/60 border border-slate-700 rounded-lg px-4 py-3 flex justify-between items-center group"
                  >
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <Building size={18} className="text-slate-400" />
                        <h3 className="font-bold text-lg">{comp.name}</h3>
                      </div>
                      <div className="flex flex-wrap gap-4 text-xs text-slate-400">
                        <span className="flex items-center gap-1">
                          <User size={14} /> {comp.username}
                        </span>
                        {comp.adminEmail && <span>{comp.adminEmail}</span>}
                        {comp.crmConfig && (
                          <span
                            className={`px-2 py-0.5 rounded-full border ${
                              comp.crmConfig.isConnected
                                ? 'border-green-700 text-green-400'
                                : 'border-slate-600 text-slate-400'
                            }`}
                          >
                            {comp.crmConfig.isConnected
                              ? comp.crmConfig.provider
                              : 'No CRM'}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => openQrModal(comp)}
                        className="p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition"
                        title="Generate QR / Intake Link"
                      >
                        <QrCode size={20} />
                      </button>
                      <button
                        onClick={() => onDeleteCompany(comp.id)}
                        className="p-2 text-slate-500 hover:text-red-400 hover:bg-slate-800 rounded-lg transition"
                        title="Delete Company"
                      >
                        <Trash2 size={20} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </>
        )}

        {/* STATIC CONFIG / LEGACY QR TAB */}
        {activeTab === 'QR' && (
          <section className="bg-slate-800/60 border border-slate-700 rounded-xl p-5">
            <div className="flex items-center gap-3 mb-6">
              <h2 className="text-xl font-semibold">Static Intake Links</h2>
              <span className="text-xs bg-slate-900 px-2 py-1 rounded text-slate-400 border border-slate-700">
                Source: config/companies.ts
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {COMPANIES.map((comp) => {
                const baseUrl = window.location.origin;
                const url = `${baseUrl}/c/${comp.slug}`;

                return (
                  <div key={comp.slug} className="relative flex justify-center">
                    <CompanyQrCard name={comp.name} url={url} />
                    <button
                      onClick={() => {
                        setSelectedQrCompany({ name: comp.name, url });
                        setQrModalOpen(true);
                      }}
                      className="absolute top-2 right-2 bg-slate-900/80 border border-slate-600 rounded-lg p-1.5 hover:bg-slate-700 transition"
                      title="Enlarge QR"
                    >
                      <QrCode
                        size={16}
                        className="text-slate-200"
                      />
                    </button>
                  </div>
                );
              })}
            </div>
          </section>
        )}
      </main>

      {/* DB SETUP MODAL */}
      {showDbSetup && <DatabaseSetupModal onClose={() => setShowDbSetup(false)} />}

      {/* QR MODAL (shared for DB and static companies) */}
      {qrModalOpen && selectedQrCompany && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="relative">
            <button
              onClick={() => setQrModalOpen(false)}
              className="absolute -top-3 -right-3 bg-white text-slate-900 rounded-full p-1 shadow-lg hover:bg-slate-200 z-10"
            >
              <X size={18} />
            </button>
            <CompanyQrCard
              name={selectedQrCompany.name}
              url={selectedQrCompany.url}
              description="Customer Intake Link"
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default SuperAdminDashboard;
