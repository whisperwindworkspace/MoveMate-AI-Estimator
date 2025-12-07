
import React, { useState, useEffect, useCallback } from 'react';
import { AppSettings, CRMConfig, JobRecord } from '../types';
import { Settings, LogOut, Mail, CloudLightning, Save, CheckCircle, BarChart3, Calendar, Loader2, QrCode, Copy, ExternalLink, Palette, Activity, Infinity, RefreshCw } from 'lucide-react';
import CRMConfigModal from './CRMConfigModal';
import { dbService } from '../services/dbService';
import { getUserProfile, getCurrentSession } from '../services/authService';
import { CompanyQrCard } from './CompanyQrCard';

interface AdminDashboardProps {
  settings: AppSettings;
  onUpdateSettings: (settings: AppSettings) => Promise<void>;
  onLogout: () => void;
}

const AdminDashboard: React.FC<AdminDashboardProps> = ({ settings, onUpdateSettings, onLogout }) => {
  const [email, setEmail] = useState(settings.adminEmail);
  const [primaryColor, setPrimaryColor] = useState(settings.primaryColor || '#2563eb');
  
  const [isSaved, setIsSaved] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [showCRM, setShowCRM] = useState(false);
  
  const [stats, setStats] = useState<JobRecord[]>([]);
  const [loadingStats, setLoadingStats] = useState(true);
  
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [companySlug, setCompanySlug] = useState<string | null>(null);
  const [usageData, setUsageData] = useState<{count: number, limit: number | null}>({ count: 0, limit: null });
  const [showQr, setShowQr] = useState(false);

  const fetchData = useCallback(async () => {
    setLoadingStats(true);
    try {
        const session = await getCurrentSession();
        if (session?.user) {
            const profile = await getUserProfile(session.user.id);
            if (profile) {
                setCompanyId(profile.company_id);
                const companyData = Array.isArray(profile.companies) ? profile.companies[0] : profile.companies;
                if (companyData) {
                    if (companyData.slug) setCompanySlug(companyData.slug);
                    if (companyData.primary_color) setPrimaryColor(companyData.primary_color);
                    setUsageData({
                        count: companyData.usage_count || 0,
                        limit: companyData.usage_limit
                    });
                }

                const jobs = await dbService.getCompanyJobs(profile.company_id);
                setStats(jobs);
            }
        }
    } catch (e) {
        console.error("Error fetching stats", e);
    } finally {
        setLoadingStats(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleSaveSettings = async () => {
    setIsSaving(true);
    try {
        await onUpdateSettings({
            ...settings,
            adminEmail: email,
            primaryColor: primaryColor
        });
        setIsSaved(true);
        setTimeout(() => setIsSaved(false), 2000);
    } catch (error) {
        console.error("Failed to save settings:", error);
        alert("Failed to save settings. Please try again.");
    } finally {
        setIsSaving(false);
    }
  };

  const handleUpdateCRM = async (newCRMConfig: CRMConfig) => {
    try {
        await onUpdateSettings({
            ...settings,
            crmConfig: newCRMConfig
        });
        setShowCRM(false);
    } catch (error) {
        console.error("Failed to update CRM config:", error);
        alert("Failed to save CRM settings.");
    }
  };

  // Use Hash URL format /#slug (No trailing slash)
  const shareUrl = companySlug 
    ? `${window.location.origin}/#${companySlug}` 
    : `${window.location.origin}/?cid=${companyId}`;

  const usagePercent = usageData.limit 
      ? Math.min(100, (usageData.count / usageData.limit) * 100) 
      : 0;

  return (
    <div className="min-h-screen bg-slate-50">
       <header className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2 text-slate-800 font-bold text-lg">
             <Settings className="text-blue-600" /> Admin Dashboard
          </div>
          <div className="flex items-center gap-2">
            <button 
                onClick={fetchData}
                className="text-slate-500 hover:text-blue-600 flex items-center gap-1 text-sm font-medium transition-colors mr-4"
                title="Refresh Stats"
            >
                <RefreshCw size={16} className={loadingStats ? "animate-spin" : ""} /> Refresh
            </button>
            <button 
                onClick={onLogout}
                className="text-slate-500 hover:text-red-600 flex items-center gap-1 text-sm font-medium transition-colors"
            >
                <LogOut size={16} /> Logout
            </button>
          </div>
       </header>

       <main className="max-w-5xl mx-auto p-6 space-y-6">
            
            {/* Top Row: Usage & Quick Stats */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                
                {/* Usage Card */}
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 flex flex-col justify-between">
                    <div>
                        <h3 className="text-sm font-bold text-slate-500 uppercase flex items-center gap-2 mb-2">
                            <Activity size={16} /> Plan Usage
                        </h3>
                        <div className="flex items-baseline gap-2">
                             <span className="text-3xl font-bold text-slate-800">{usageData.count}</span>
                             <span className="text-sm text-slate-400">/ {usageData.limit ?? <Infinity size={14} className="inline"/>} jobs</span>
                        </div>
                    </div>
                    {usageData.limit && (
                        <div className="mt-4">
                             <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                                 <div 
                                    className={`h-full rounded-full ${usagePercent > 90 ? 'bg-red-500' : 'bg-blue-600'}`} 
                                    style={{ width: `${usagePercent}%` }} 
                                 />
                             </div>
                             {usagePercent > 90 && (
                                 <p className="text-xs text-red-500 mt-2 font-medium">Limit Reached. Please upgrade.</p>
                             )}
                        </div>
                    )}
                </div>

                <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
                    <h3 className="text-sm font-bold text-slate-500 uppercase mb-2">Total Submissions</h3>
                    <div className="text-3xl font-bold text-slate-800">{stats.length}</div>
                    <div className="text-xs text-green-600 mt-1 flex items-center gap-1">
                        <CheckCircle size={12} /> Live tracking active
                    </div>
                </div>

                <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
                     <h3 className="text-sm font-bold text-slate-500 uppercase mb-2">CRM Status</h3>
                     {settings.crmConfig.isConnected ? (
                         <>
                            <div className="text-xl font-bold text-green-600 flex items-center gap-2">
                                <CheckCircle size={24} /> Connected
                            </div>
                            <p className="text-xs text-slate-400 mt-1 capitalize">{settings.crmConfig.provider}</p>
                         </>
                     ) : (
                         <>
                            <div className="text-xl font-bold text-slate-400 flex items-center gap-2">
                                <Activity size={24} /> Not Connected
                            </div>
                            <button onClick={() => setShowCRM(true)} className="text-xs text-blue-600 hover:underline mt-1">Configure Now</button>
                         </>
                     )}
                </div>
            </div>

            {/* Statistics Table Panel */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
                <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
                    <BarChart3 size={20} className="text-blue-600" /> Recent Submissions
                </h3>

                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left text-slate-500">
                        <thead className="text-xs text-slate-700 uppercase bg-slate-50">
                            <tr>
                                <th className="px-4 py-3">Job ID</th>
                                <th className="px-4 py-3">Date Submitted</th>
                                <th className="px-4 py-3">Status</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loadingStats ? (
                                <tr><td colSpan={3} className="px-4 py-4 text-center">Loading...</td></tr>
                            ) : stats.length === 0 ? (
                                <tr><td colSpan={3} className="px-4 py-4 text-center text-slate-400">No inventories submitted yet.</td></tr>
                            ) : (
                                stats.slice(0, 10).map(job => (
                                    <tr key={job.id} className="bg-white border-b hover:bg-slate-50">
                                        <td className="px-4 py-3 font-medium text-slate-900">{job.job_id_input || '-'}</td>
                                        <td className="px-4 py-3 whitespace-nowrap flex items-center gap-2">
                                            <Calendar size={14} className="text-slate-400"/>
                                            {new Date(job.created_at).toLocaleDateString()}
                                        </td>
                                        <td className="px-4 py-3">
                                            <span className={`px-2 py-1 rounded text-xs font-bold ${
                                                job.crm_status === 'synced' 
                                                ? 'bg-green-100 text-green-700' 
                                                : 'bg-slate-100 text-slate-500'
                                            }`}>
                                                {job.crm_status.toUpperCase()}
                                            </span>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Intake Tools Card */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
                <div className="flex justify-between items-center mb-4">
                    <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                        <QrCode size={20} className="text-blue-600" /> Customer Intake Link
                    </h3>
                    <button onClick={() => setShowQr(!showQr)} className="text-sm text-blue-600 hover:underline font-medium">
                        {showQr ? 'Hide QR' : 'Show QR'}
                    </button>
                </div>
                
                {companyId ? (
                    <div className="space-y-4">
                        <p className="text-sm text-slate-600">Share this link with customers to start a branded inventory session.</p>
                        <div className="flex gap-2">
                            <code className="flex-1 p-3 bg-slate-50 rounded-lg border border-slate-200 text-xs font-mono break-all text-slate-700 flex items-center">
                                {shareUrl}
                            </code>
                            <button 
                                onClick={() => navigator.clipboard.writeText(shareUrl)}
                                className="p-2 bg-slate-100 hover:bg-slate-200 rounded-lg text-slate-600 border border-slate-200"
                                title="Copy Link"
                            >
                                <Copy size={18} />
                            </button>
                            <a 
                                href={shareUrl} 
                                target="_blank" 
                                rel="noreferrer"
                                className="p-2 bg-slate-100 hover:bg-slate-200 rounded-lg text-slate-600 border border-slate-200"
                                title="Open Link"
                            >
                                <ExternalLink size={18} />
                            </a>
                        </div>
                        
                        {showQr && (
                            <div className="flex justify-center mt-4 p-4 bg-slate-50 rounded-xl border border-slate-200">
                                <CompanyQrCard 
                                    name={settings.companyName} 
                                    url={shareUrl} 
                                    description="Scan to start inventory"
                                    color={primaryColor}
                                />
                            </div>
                        )}
                    </div>
                ) : (
                    <div className="text-sm text-slate-400 italic flex items-center gap-2">
                        <Loader2 className="animate-spin" size={14} /> Loading link details...
                    </div>
                )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Branding & Settings */}
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 h-full">
                    <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
                        <Palette size={20} className="text-slate-400" /> Branding & Settings
                    </h3>
                    <div className="space-y-6">
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">Destination Email</label>
                            <input 
                                type="email" 
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                className="w-full p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 mb-1"
                                placeholder="dispatch@company.com"
                            />
                            <p className="text-xs text-slate-500">Inventory manifests will be sent here.</p>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-2">Brand Color</label>
                            <div className="flex items-center gap-3">
                                <input 
                                    type="color" 
                                    value={primaryColor}
                                    onChange={(e) => setPrimaryColor(e.target.value)}
                                    className="w-12 h-12 p-1 rounded-lg border border-slate-200 cursor-pointer"
                                />
                                <div className="text-xs text-slate-500">
                                    This color will be used for the QR code and app header.
                                </div>
                            </div>
                        </div>

                        <button 
                            onClick={handleSaveSettings}
                            disabled={isSaving}
                            className={`w-full px-4 py-2 rounded-lg font-medium flex items-center justify-center gap-2 transition-all ${
                                isSaved 
                                ? 'bg-green-100 text-green-700' 
                                : 'bg-blue-600 text-white hover:bg-blue-700'
                            } ${isSaving ? 'opacity-75 cursor-wait' : ''}`}
                        >
                            {isSaving ? (
                                <Loader2 size={18} className="animate-spin" />
                            ) : isSaved ? (
                                <><CheckCircle size={18}/> Settings Saved</>
                            ) : (
                                <><Save size={18}/> Save Changes</>
                            )}
                        </button>
                    </div>
                </div>

                {/* CRM Config */}
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 h-full flex flex-col">
                    <div className="flex justify-between items-start mb-4">
                        <div>
                            <h3 className="text-lg font-bold text-slate-800 mb-1 flex items-center gap-2">
                                <CloudLightning size={20} className="text-slate-400" /> CRM Integration
                            </h3>
                            <p className="text-sm text-slate-500">Connect to Supermove or Salesforce.</p>
                        </div>
                        <div className={`px-3 py-1 rounded-full text-xs font-bold border ${
                            settings.crmConfig.isConnected 
                            ? 'bg-green-100 text-green-700 border-green-200' 
                            : 'bg-slate-100 text-slate-500 border-slate-200'
                        }`}>
                            {settings.crmConfig.isConnected ? 'Connected' : 'Disconnected'}
                        </div>
                    </div>
                    
                    <div className="mt-auto">
                        <button 
                            onClick={() => setShowCRM(true)}
                            className="w-full py-3 border border-slate-300 rounded-lg text-slate-700 font-medium hover:bg-slate-50 hover:border-slate-400 transition-all"
                        >
                            Manage CRM Settings
                        </button>
                    </div>
                </div>
            </div>

       </main>

       {/* Reuse existing CRM Modal */}
       <CRMConfigModal 
         isOpen={showCRM} 
         onClose={() => setShowCRM(false)} 
         config={settings.crmConfig}
         onSave={handleUpdateCRM}
       />
    </div>
  );
};

export default AdminDashboard;
