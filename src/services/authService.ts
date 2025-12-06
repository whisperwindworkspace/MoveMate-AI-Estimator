import { supabase } from './supabaseClient';
import { UserProfile } from '../types';

export async function signInWithEmail(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) throw error;
  return data.user;
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export async function getCurrentSession() {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  return data.session ?? null;
}

// Additional helpers required by App.tsx and SuperAdminDashboard
export async function signUpWithEmail(email: string, password: string, companyId: string) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
  });

  if (error) throw error;
  const user = data.user;
  if (!user) throw new Error('Signup succeeded but no user returned');

  // Create profile row in public schema
  const { error: profileError } = await supabase.from('users').insert({
    id: user.id,
    company_id: companyId,
    role: 'COMPANY_ADMIN',
  });

  if (profileError) throw profileError;
  return user;
}

export async function getUserProfile(userId: string): Promise<UserProfile | null> {
    const { data, error } = await supabase
        .from('users')
        .select(`
            *,
            companies (
                id,
                name,
                slug,
                admin_email,
                crm_config,
                usage_count,
                usage_limit,
                primary_color,
                logo_url
            )
        `)
        .eq('id', userId)
        .single();
    
    if (error) {
        console.error("Error fetching user profile:", error);
        return null;
    }

    return data as any; 
}

export function subscribeToAuthChanges(
  callback: (session: Awaited<ReturnType<typeof getCurrentSession>>) => void
) {
  const {
    data: { subscription },
  } = supabase.auth.onAuthStateChange((_event, session) => {
    callback(session);
  });

  return subscription;
}