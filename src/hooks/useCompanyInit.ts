import React, { useState, useEffect } from 'react';
import { AppSettings, CompanyProfile } from '../types';
import { dbService } from '../services/dbService';
import { getCompanyBySlug } from '../config/companies';
import { DEFAULT_ADMIN_EMAIL } from '../constants';

interface UseCompanyInitResult {
  isInitComplete: boolean;
  isLimitReached: boolean;
  detectedCompanyId: string | null;
  settings: AppSettings;
  setSettings: React.Dispatch<React.SetStateAction<AppSettings>>;
  setDetectedCompanyId: React.Dispatch<React.SetStateAction<string | null>>;
  setIsLimitReached: React.Dispatch<React.SetStateAction<boolean>>;
}

export const useCompanyInit = (initialSlug?: string): UseCompanyInitResult => {
  const [isInitComplete, setIsInitComplete] = useState(false);
  const [isLimitReached, setIsLimitReached] = useState(false);
  const [detectedCompanyId, setDetectedCompanyId] = useState<string | null>(null);
  const [settings, setSettings] = useState<AppSettings>({
    companyName: 'MoveMate AI',
    adminEmail: DEFAULT_ADMIN_EMAIL,
    crmConfig: { provider: null, isConnected: false, apiKey: '' },
    primaryColor: '#2563eb'
  });

  useEffect(() => {
    const initCompany = async () => {
        const params = new URLSearchParams(window.location.search);
        const companyId = params.get('cid');
        
        // ROBUST SLUG PARSING
        const hashSlug = window.location.hash.replace(/^#/, '').replace(/^\/+/, '');
        const companySlug = initialSlug || hashSlug || params.get('slug');
        
        console.log("App Init - Parsed Slug:", companySlug, "Direct ID:", companyId);

        // Reset states
        setIsLimitReached(false);

        let profile: CompanyProfile | null = null;

        if (companyId) {
            setDetectedCompanyId(companyId);
            profile = await dbService.getCompanyPublicProfile(companyId);
        } else if (companySlug) {
            profile = await dbService.getCompanyBySlug(companySlug);
            
            // Fallback to static config if DB fails
            if (!profile) {
                const configProfile = getCompanyBySlug(companySlug);
                if (configProfile) {
                    setSettings({
                        companyName: configProfile.name,
                        adminEmail: configProfile.destinationEmail,
                        crmConfig: { provider: null, isConnected: false, apiKey: '' },
                        primaryColor: configProfile.primaryColor,
                        logoUrl: configProfile.logoUrl
                    });
                    setIsInitComplete(true);
                    return;
                }
            }
        }

        if (profile) {
             if (profile.id) setDetectedCompanyId(profile.id);
             
             // STRICT LIMIT CHECK
             if (profile.usageLimit !== null && profile.usageLimit !== undefined) {
                if ((profile.usageCount || 0) >= profile.usageLimit) {
                    setIsLimitReached(true);
                    setIsInitComplete(true);
                    return;
                }
            }

            setSettings({
                companyName: profile.name,
                adminEmail: profile.adminEmail,
                crmConfig: profile.crmConfig,
                primaryColor: profile.primaryColor,
                logoUrl: profile.logoUrl
            });
        }
        
        setIsInitComplete(true);
    };

    initCompany();
  }, [initialSlug]);

  return { 
    isInitComplete, 
    isLimitReached, 
    detectedCompanyId, 
    settings, 
    setSettings,
    setDetectedCompanyId,
    setIsLimitReached
  };
};