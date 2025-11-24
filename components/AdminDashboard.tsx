
import React, { useState } from 'react';
import { AppSettings, CRMConfig } from '../types';
import { Settings, LogOut, Mail, CloudLightning, Save, CheckCircle } from 'lucide-react';
import CRMConfigModal from './CRMConfigModal';

interface AdminDashboardProps {
  settings: AppSettings;
  onUpdateSettings: (settings: AppSettings) => void;
  onLogout: () => void;
}

const AdminDashboard: React.FC<AdminDashboardProps> = ({ settings, onUpdateSettings, onLogout }) => {
  const [email, setEmail] = useState(settings.adminEmail);
  const [isSaved, setIsSaved] = useState(false);
  const [showCRM, setShowCRM] = useState(false);

  const handleSaveEmail = () => {
    onUpdateSettings({
        ...settings,
        adminEmail: email
    });
    setIsSaved(true);
    setTimeout(() => setIsSaved(false), 2000);
  };

  const handleUpdateCRM = (newCRMConfig: CRMConfig) => {
    onUpdateSettings({
        ...settings,
        crmConfig: newCRMConfig
    });
    setShowCRM(false);
  };

  return (
    <div className="min-h-screen bg-slate-50">
       <header className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2 text-slate-800 font-bold text-lg">
             <Settings className="text-blue-600" /> Admin Dashboard
          </div>
          <button 
            onClick={onLogout}
            className="text-slate-500 hover:text-red-600 flex items-center gap-1 text-sm font-medium transition-colors"
          >
            <LogOut size={16} /> Logout
          </button>
       </header>

       <main className="max-w-2xl mx-auto p-6 space-y-6">
            
            {/* Email Config */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
                <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
                    <Mail size={20} className="text-slate-400" /> Notification Settings
                </h3>
                <div className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Destination Email</label>
                        <p className="text-xs text-slate-500 mb-2">Inventory manifests will be sent to this address.</p>
                        <div className="flex gap-2">
                            <input 
                                type="email" 
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                className="flex-1 p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                            />
                            <button 
                                onClick={handleSaveEmail}
                                className={`px-4 py-2 rounded-lg font-medium flex items-center gap-2 transition-all ${
                                    isSaved 
                                    ? 'bg-green-100 text-green-700' 
                                    : 'bg-blue-600 text-white hover:bg-blue-700'
                                }`}
                            >
                                {isSaved ? <><CheckCircle size={18}/> Saved</> : <><Save size={18}/> Save</>}
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {/* CRM Config */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
                <div className="flex justify-between items-start">
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
                
                <div className="mt-6">
                    <button 
                        onClick={() => setShowCRM(true)}
                        className="w-full py-3 border border-slate-300 rounded-lg text-slate-700 font-medium hover:bg-slate-50 hover:border-slate-400 transition-all"
                    >
                        Manage CRM Settings
                    </button>
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
