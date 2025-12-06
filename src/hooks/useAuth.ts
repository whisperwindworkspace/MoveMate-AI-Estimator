import React, { useState, useEffect } from 'react';
import { UserRole, ViewMode, AppSettings } from '../types';
import { subscribeToAuthChanges, getUserProfile, signOut, signInWithEmail } from '../services/authService';
import { dbService } from '../services/dbService';

interface UseAuthResult {
  currentUserRole: UserRole;
  currentCompanyId: string | null;
  setCurrentUserRole: React.Dispatch<React.SetStateAction<UserRole>>;
  setCurrentCompanyId: React.Dispatch<React.SetStateAction<string | null>>;
  handleLogin: (u: string, p: string) => Promise<boolean>;
  handleLogout: (setView: (v: ViewMode) => void) => Promise<void>;
}

export const useAuth = (
  view: ViewMode, 
  setView: (v: ViewMode) => void, 
  setSettings: (s: AppSettings) => void,
  setIsLimitReached: (b: boolean) => void,
  reInitCompany: () => void
): UseAuthResult => {
  const [currentUserRole, setCurrentUserRole] = useState<UserRole>('GUEST');
  const [currentCompanyId, setCurrentCompanyId] = useState<string | null>(null);

  useEffect(() => {
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
                        setIsLimitReached(false); // Admins bypass limit
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
                        setIsLimitReached(false);
                    }
                }
            } catch (e) {
                console.error("Error restoring session profile", e);
            }
        } else {
            // Logout detected
            if (view === 'COMPANY_DASHBOARD' || view === 'SUPER_ADMIN_DASHBOARD') {
                setCurrentUserRole('GUEST');
                setCurrentCompanyId(null);
                setView('INVENTORY');
                reInitCompany(); // Re-check context
            }
        }
    });

    return () => {
        subscription.unsubscribe();
    };
  }, [view, setView, setSettings, setIsLimitReached]);

  const handleLogin = async (u: string, p: string) => {
      const user = await signInWithEmail(u, p);
      if (!user) return false;
      const profile = await getUserProfile(user.id);
      if (!profile) { await signOut(); return false; }
      return true;
  };

  const handleLogout = async (updateView: (v: ViewMode) => void) => {
    if (!dbService.isOffline()) try { await signOut(); } catch {}
    setCurrentUserRole('GUEST'); 
    setCurrentCompanyId(null); 
    updateView('INVENTORY');
  };

  return {
    currentUserRole,
    currentCompanyId,
    setCurrentUserRole,
    setCurrentCompanyId,
    handleLogin,
    handleLogout
  };
};