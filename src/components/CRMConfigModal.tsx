import React, { useState } from 'react';
import { CRMConfig } from '../types';
import { X, CheckCircle, Cloud, ArrowRight, Link2 } from 'lucide-react';

interface CRMConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  config: CRMConfig;
  onSave: (config: CRMConfig) => void;
}

const CRMConfigModal: React.FC<CRMConfigModalProps> = ({ isOpen, onClose, config, onSave }) => {
  const [tempConfig, setTempConfig] = useState<CRMConfig>(config);
  const [isSaving, setIsSaving] = useState(false);

  const handleProviderSelect = (provider: 'supermove' | 'salesforce') => {
    setTempConfig({
      ...tempConfig,
      provider: provider
    });
  };

  const handleConnect = () => {
    if (!tempConfig.provider) return;
    
    setIsSaving(true);
    // For real integration, we just save the config. The "Sync" button in SummaryPanel triggers the actual call.
    // Here we just validate and close.
    setTimeout(() => {
      onSave({
        ...tempConfig,
        isConnected: true
      });
      setIsSaving(false);
      onClose();
    }, 800);
  };

  const handleDisconnect = () => {
    const newConfig: CRMConfig = { provider: null, isConnected: false, apiKey: '', endpointUrl: '' };
    setTempConfig(newConfig);
    onSave(newConfig);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-white w-full max-w-md rounded-2xl shadow-xl overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
          <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
            <Cloud size={20} className="text-blue-500" /> CRM Integration
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X size={20} />
          </button>
        </div>

        <div className="p-6">
          {!config.isConnected ? (
            <div className="space-y-6">
              <p className="text-sm text-slate-600">
                Select your CRM provider to automatically sync inventory manifests.
              </p>

              <div className="grid grid-cols-2 gap-4">
                <button
                  onClick={() => handleProviderSelect('supermove')}
                  className={`p-4 border-2 rounded-xl flex flex-col items-center gap-2 transition-all ${
                    tempConfig.provider === 'supermove' 
                      ? 'border-blue-500 bg-blue-50 text-blue-800' 
                      : 'border-slate-200 hover:border-blue-200 text-slate-600'
                  }`}
                >
                  <div className="w-10 h-10 bg-indigo-900 rounded-lg flex items-center justify-center text-white font-bold text-xs">SM</div>
                  <span className="font-semibold text-sm">Supermove</span>
                </button>

                <button
                  onClick={() => handleProviderSelect('salesforce')}
                  className={`p-4 border-2 rounded-xl flex flex-col items-center gap-2 transition-all ${
                    tempConfig.provider === 'salesforce' 
                      ? 'border-blue-500 bg-blue-50 text-blue-800' 
                      : 'border-slate-200 hover:border-blue-200 text-slate-600'
                  }`}
                >
                   <div className="w-10 h-10 bg-blue-500 rounded-lg flex items-center justify-center text-white font-bold text-xs">SF</div>
                  <span className="font-semibold text-sm">Salesforce</span>
                </button>
              </div>

              {tempConfig.provider && (
                <div className="animate-in slide-in-from-top-2 duration-300 space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">
                      API Endpoint URL
                    </label>
                    <div className="relative">
                        <Link2 className="absolute left-3 top-3 text-slate-400" size={16}/>
                        <input 
                            type="url"
                            value={tempConfig.endpointUrl || ''}
                            onChange={(e) => setTempConfig({...tempConfig, endpointUrl: e.target.value})}
                            placeholder={`https://api.${tempConfig.provider}.com/v1/inventories`}
                            className="w-full pl-10 p-2.5 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                        />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">
                      API Key
                    </label>
                    <input 
                        type="password"
                        value={tempConfig.apiKey || ''}
                        onChange={(e) => setTempConfig({...tempConfig, apiKey: e.target.value})}
                        placeholder="Enter your API Key"
                        className="w-full p-2.5 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  <button
                    onClick={handleConnect}
                    disabled={isSaving || !tempConfig.apiKey || !tempConfig.endpointUrl}
                    className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold shadow-lg shadow-blue-200 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isSaving ? 'Saving...' : `Save & Connect`}
                    {!isSaving && <ArrowRight size={16} />}
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="text-center py-6">
               <div className="w-16 h-16 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-4">
                  <CheckCircle size={32} />
               </div>
               <h4 className="text-xl font-bold text-slate-800 mb-1">Connected!</h4>
               <p className="text-slate-500 mb-6">
                 Your account is successfully linked to <span className="font-semibold capitalize text-slate-800">{config.provider}</span>.
               </p>
               <div className="text-xs text-slate-400 break-all mb-6 bg-slate-50 p-2 rounded border border-slate-100">
                  {config.endpointUrl}
               </div>
               <button 
                 onClick={handleDisconnect}
                 className="text-red-500 text-sm font-medium hover:underline"
               >
                 Disconnect Integration
               </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default CRMConfigModal;