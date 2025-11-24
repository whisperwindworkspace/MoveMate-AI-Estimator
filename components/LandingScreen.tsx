
import React, { useState } from 'react';
import { JobDetails } from '../types';
import { Truck, Calendar, User, Hash, Lock } from 'lucide-react';

interface LandingScreenProps {
  onStartJob: (details: JobDetails) => void;
  onAdminLogin: () => void;
}

const LandingScreen: React.FC<LandingScreenProps> = ({ onStartJob, onAdminLogin }) => {
  const [mode, setMode] = useState<'JOB_ID' | 'MANUAL'>('JOB_ID');
  const [jobId, setJobId] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [moveDate, setMoveDate] = useState(new Date().toISOString().split('T')[0]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (mode === 'JOB_ID' && jobId) {
      onStartJob({ jobId });
    } else if (mode === 'MANUAL' && customerName && moveDate) {
      onStartJob({ customerName, moveDate });
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-gradient-to-br from-slate-50 to-blue-50">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl overflow-hidden">
        <div className="bg-blue-600 p-8 text-center">
          <div className="w-16 h-16 bg-white/20 rounded-2xl flex items-center justify-center mx-auto mb-4 backdrop-blur-sm">
            <Truck size={32} className="text-white" />
          </div>
          <h1 className="text-2xl font-bold text-white mb-1">MoveMate AI</h1>
          <p className="text-blue-100">Intelligent Inventory Estimation</p>
        </div>

        <div className="p-8">
          <div className="flex bg-slate-100 p-1 rounded-lg mb-6">
            <button
              onClick={() => setMode('JOB_ID')}
              className={`flex-1 py-2 text-sm font-medium rounded-md transition-all ${
                mode === 'JOB_ID' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              Have Job ID?
            </button>
            <button
              onClick={() => setMode('MANUAL')}
              className={`flex-1 py-2 text-sm font-medium rounded-md transition-all ${
                mode === 'MANUAL' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              No Job ID?
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === 'JOB_ID' ? (
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Job ID Number</label>
                <div className="relative">
                  <Hash className="absolute left-3 top-3 text-slate-400" size={20} />
                  <input
                    type="text"
                    required
                    value={jobId}
                    onChange={(e) => setJobId(e.target.value)}
                    placeholder="e.g. JB-4923"
                    className="w-full pl-10 pr-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                  />
                </div>
              </div>
            ) : (
              <>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Customer Name</label>
                  <div className="relative">
                    <User className="absolute left-3 top-3 text-slate-400" size={20} />
                    <input
                      type="text"
                      required
                      value={customerName}
                      onChange={(e) => setCustomerName(e.target.value)}
                      placeholder="Jane Doe"
                      className="w-full pl-10 pr-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Move Date</label>
                  <div className="relative">
                    <Calendar className="absolute left-3 top-3 text-slate-400" size={20} />
                    <input
                      type="date"
                      required
                      value={moveDate}
                      onChange={(e) => setMoveDate(e.target.value)}
                      className="w-full pl-10 pr-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                    />
                  </div>
                </div>
              </>
            )}

            <button
              type="submit"
              className="w-full py-4 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl shadow-lg shadow-blue-200 transition-all active:scale-95 flex items-center justify-center gap-2 mt-4"
            >
              Start Inventory <Truck size={20} />
            </button>
          </form>
        </div>
      </div>

      <button 
        onClick={onAdminLogin}
        className="mt-8 text-slate-400 hover:text-slate-600 text-sm flex items-center gap-1 transition-colors"
      >
        <Lock size={14} /> Admin Access
      </button>
    </div>
  );
};

export default LandingScreen;
