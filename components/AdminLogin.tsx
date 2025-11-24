
import React, { useState } from 'react';
import { Lock, ArrowLeft, User, Building, Key, Mail, CheckCircle, AlertCircle } from 'lucide-react';

interface AdminLoginProps {
  onLogin: (username: string, password: string) => Promise<boolean>;
  onRequestReset: (username: string) => Promise<{ success: boolean; email?: string; code?: string }>;
  onResetPassword: (username: string, newPassword: string) => void;
  onBack: () => void;
}

type LoginMode = 'LOGIN' | 'FORGOT' | 'VERIFY';

const AdminLogin: React.FC<AdminLoginProps> = ({ onLogin, onRequestReset, onResetPassword, onBack }) => {
  const [mode, setMode] = useState<LoginMode>('LOGIN');
  const [email, setEmail] = useState(''); // Changed from username
  const [password, setPassword] = useState('');
  
  // Reset State
  const [resetEmail, setResetEmail] = useState('');
  const [generatedCode, setGeneratedCode] = useState(''); // In a real app, this happens backend-side
  const [userCode, setUserCode] = useState('');
  const [newPassword, setNewPassword] = useState('');

  const [error, setError] = useState('');
  const [showErrorPopup, setShowErrorPopup] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');

  // --- 1. Login Handler ---
  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');
    
    // Simulate network delay
    await new Promise(r => setTimeout(r, 800));
    
    const success = await onLogin(email, password);
    if (!success) {
        // We use a popup instead of inline error, and keep the message generic for security
        setShowErrorPopup(true);
    }
    setIsLoading(false);
  };

  // --- 2. Request Reset Code Handler ---
  const handleRequestCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    // Simulate delay
    await new Promise(r => setTimeout(r, 1000));

    const result = await onRequestReset(email);

    if (result.success && result.code) {
        setResetEmail(result.email || email);
        setGeneratedCode(result.code);
        
        // SIMULATION: Show code in alert since we can't email
        alert(`[SIMULATION] An email was sent to ${result.email || email} with code: ${result.code}`);
        
        setMode('VERIFY');
    } else {
        // For password reset, we might still show generic error or handle differently, 
        // but typically here we might just say "If account exists, code sent" for high security.
        // For this demo, we'll stick to the existing inline error for reset flow specifically.
        setError('Account not found.');
    }
    setIsLoading(false);
  };

  // --- 3. Finalize Reset Handler ---
  const handleResetSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (userCode !== generatedCode) {
        setError('Invalid verification code.');
        return;
    }

    setIsLoading(true);
    await new Promise(r => setTimeout(r, 1000));

    onResetPassword(email, newPassword);
    
    setSuccessMsg('Password reset successful! Redirecting to login...');
    setTimeout(() => {
        setMode('LOGIN');
        setSuccessMsg('');
        setPassword('');
        setUserCode('');
        setNewPassword('');
        setError('');
        setIsLoading(false);
    }, 2000);
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-slate-50">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-xl p-8 border border-slate-100 relative">
        <button 
          onClick={mode === 'LOGIN' ? onBack : () => { setMode('LOGIN'); setError(''); }}
          className="text-slate-400 hover:text-slate-600 mb-6 flex items-center gap-1 text-sm transition-colors"
        >
          <ArrowLeft size={16} /> {mode === 'LOGIN' ? 'Back' : 'Back to Login'}
        </button>

        {/* --- MODE: LOGIN --- */}
        {mode === 'LOGIN' && (
            <>
                <div className="flex items-center gap-3 mb-2">
                    <div className="p-3 bg-blue-50 rounded-lg text-blue-600">
                        <Building size={24} />
                    </div>
                    <h2 className="text-2xl font-bold text-slate-800">Company Login</h2>
                </div>
                <p className="text-slate-500 mb-6 text-sm">Sign in to manage your company settings.</p>

                <form onSubmit={handleLoginSubmit} className="space-y-4">
                    <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Email</label>
                        <div className="relative">
                        <User className="absolute left-3 top-3 text-slate-400" size={18} />
                        <input
                            type="email"
                            required
                            value={email}
                            onChange={(e) => { setEmail(e.target.value); setError(''); }}
                            className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-100 focus:border-blue-500 focus:outline-none"
                            placeholder="admin@company.com"
                        />
                        </div>
                    </div>
                    
                    <div>
                        <div className="flex justify-between mb-1">
                            <label className="block text-xs font-bold text-slate-500 uppercase">Password</label>
                            <button 
                                type="button"
                                onClick={() => { setError(''); setEmail(''); setMode('FORGOT'); }} 
                                className="text-xs text-blue-600 hover:text-blue-800 font-medium"
                            >
                                Forgot Password?
                            </button>
                        </div>
                        <div className="relative">
                        <Lock className="absolute left-3 top-3 text-slate-400" size={18} />
                        <input
                            type="password"
                            required
                            value={password}
                            onChange={(e) => { setPassword(e.target.value); setError(''); }}
                            className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-100 focus:border-blue-500 focus:outline-none"
                            placeholder="••••••••"
                        />
                        </div>
                    </div>

                    {/* Inline error removed for login, replaced by popup */}
                    {error && mode !== 'LOGIN' && (
                        <div className="bg-red-50 text-red-600 text-xs p-3 rounded-lg border border-red-100">
                            {error}
                        </div>
                    )}

                    <button
                        type="submit"
                        disabled={isLoading}
                        className={`w-full py-3 bg-slate-900 text-white font-semibold rounded-lg hover:bg-slate-800 transition-colors ${isLoading ? 'opacity-75 cursor-wait' : ''}`}
                    >
                        {isLoading ? 'Verifying...' : 'Sign In'}
                    </button>
                </form>
            </>
        )}

        {/* --- MODE: FORGOT PASSWORD --- */}
        {mode === 'FORGOT' && (
            <>
                <div className="flex items-center gap-3 mb-2">
                    <div className="p-3 bg-amber-50 rounded-lg text-amber-600">
                        <Key size={24} />
                    </div>
                    <h2 className="text-2xl font-bold text-slate-800">Reset Password</h2>
                </div>
                <p className="text-slate-500 mb-6 text-sm">Enter your email. We will send a reset code.</p>

                <form onSubmit={handleRequestCode} className="space-y-4">
                    <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Email</label>
                        <div className="relative">
                        <User className="absolute left-3 top-3 text-slate-400" size={18} />
                        <input
                            type="email"
                            autoFocus
                            required
                            value={email}
                            onChange={(e) => { setEmail(e.target.value); setError(''); }}
                            className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-100 focus:border-blue-500 focus:outline-none"
                            placeholder="admin@company.com"
                        />
                        </div>
                    </div>

                    {error && (
                        <div className="bg-red-50 text-red-600 text-xs p-3 rounded-lg border border-red-100">
                            {error}
                        </div>
                    )}

                    <button
                        type="submit"
                        disabled={isLoading}
                        className={`w-full py-3 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 transition-colors ${isLoading ? 'opacity-75 cursor-wait' : ''}`}
                    >
                        {isLoading ? 'Sending Code...' : 'Send Reset Code'}
                    </button>
                </form>
            </>
        )}

        {/* --- MODE: VERIFY & RESET --- */}
        {mode === 'VERIFY' && (
             <>
                <div className="flex items-center gap-3 mb-2">
                    <div className="p-3 bg-green-50 rounded-lg text-green-600">
                        <Mail size={24} />
                    </div>
                    <h2 className="text-2xl font-bold text-slate-800">Check your Email</h2>
                </div>
                <p className="text-slate-500 mb-6 text-sm">We sent a code to <strong>{resetEmail}</strong>. Enter it below to reset your password.</p>

                <form onSubmit={handleResetSubmit} className="space-y-4">
                    {successMsg ? (
                         <div className="bg-green-50 border border-green-100 text-green-700 p-4 rounded-lg flex flex-col items-center text-center animate-in fade-in zoom-in">
                             <CheckCircle size={32} className="mb-2"/>
                             <p className="font-semibold">{successMsg}</p>
                         </div>
                    ) : (
                        <>
                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Verification Code</label>
                                <input
                                    type="text"
                                    required
                                    maxLength={6}
                                    value={userCode}
                                    onChange={(e) => { setUserCode(e.target.value); setError(''); }}
                                    className="w-full px-4 py-2.5 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-100 focus:border-blue-500 focus:outline-none text-center tracking-[0.5em] font-mono text-lg"
                                    placeholder="000000"
                                />
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">New Password</label>
                                <div className="relative">
                                    <Lock className="absolute left-3 top-3 text-slate-400" size={18} />
                                    <input
                                        type="password"
                                        required
                                        minLength={6}
                                        value={newPassword}
                                        onChange={(e) => { setNewPassword(e.target.value); setError(''); }}
                                        className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-100 focus:border-blue-500 focus:outline-none"
                                        placeholder="New password"
                                    />
                                </div>
                            </div>

                            {error && (
                                <div className="bg-red-50 text-red-600 text-xs p-3 rounded-lg border border-red-100">
                                    {error}
                                </div>
                            )}

                            <button
                                type="submit"
                                disabled={isLoading}
                                className={`w-full py-3 bg-slate-900 text-white font-semibold rounded-lg hover:bg-slate-800 transition-colors ${isLoading ? 'opacity-75 cursor-wait' : ''}`}
                            >
                                {isLoading ? 'Updating...' : 'Reset Password'}
                            </button>
                        </>
                    )}
                </form>
             </>
        )}

      </div>

      {/* ERROR POPUP MODAL */}
      {showErrorPopup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in duration-200">
            <div className="bg-white rounded-xl shadow-2xl p-6 max-w-sm w-full text-center border border-slate-100 transform scale-100">
                <div className="w-16 h-16 bg-red-100 text-red-500 rounded-full flex items-center justify-center mx-auto mb-4">
                    <AlertCircle size={32} />
                </div>
                <h3 className="text-xl font-bold text-slate-800 mb-2">Login Failed</h3>
                <div className="text-slate-600 mb-6 text-sm space-y-2">
                    <p>Invalid email or password.</p>
                    <p className="text-slate-400 text-xs">If you do not have an account, please contact the Super Admin to request access.</p>
                </div>
                <button 
                    onClick={() => setShowErrorPopup(false)}
                    className="w-full py-3 bg-slate-900 text-white rounded-xl font-bold hover:bg-slate-800 transition-colors"
                >
                    Try Again
                </button>
            </div>
        </div>
      )}

    </div>
  );
};

export default AdminLogin;
