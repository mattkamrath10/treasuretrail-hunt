import { createContext, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import type { User, Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import type { Profile } from '../lib/supabase';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  isGuest: boolean;
  signUp: (email: string, password: string) => Promise<{ error: string | null; needsConfirmation: boolean }>;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  enterGuestMode: () => void;
  exitGuestMode: () => void;
  updateProfile: (data: Partial<Profile>) => Promise<{ error: string | null }>;
  refreshProfile: () => Promise<void>;
  hasCompletedSetup: boolean;
  isAdmin: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [isGuest, setIsGuest] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
      setUser(s?.user ?? null);
      if (s?.user) {
        fetchProfile(s.user.id);
      } else {
        setLoading(false);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      setUser(s?.user ?? null);
      if (s?.user) {
        setIsGuest(false);
        fetchProfile(s.user.id);
      } else {
        setProfile(null);
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  async function fetchProfile(userId: string) {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle();

    if (!error && data) {
      setProfile(data as Profile);
    }
    setLoading(false);
  }

  // Public refresh: re-reads the current user's profile row. Used after
  // server-side state changes (e.g. an admin approves a Scout application —
  // the apply_scout_verification trigger flips profiles.scout_verified, but
  // the client's cached profile is stale until we re-fetch).
  async function refreshProfile() {
    if (!user) return;
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .maybeSingle();
    if (!error && data) setProfile(data as Profile);
  }

  async function signUp(email: string, password: string) {
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) return { error: error.message, needsConfirmation: false };

    // Supabase quirk: when "Confirm email" is enabled and the email is ALREADY
    // registered, signUp returns no error but a user with an empty `identities`
    // array. Surface this as a friendly error so a confused reviewer who taps
    // "Create Account" twice doesn't hit a raw error prompt.
    if (data.user && (data.user.identities?.length ?? 0) === 0) {
      return {
        error: 'An account with this email already exists. Please log in instead.',
        needsConfirmation: false,
      };
    }

    // No session means email confirmation is required. Tell the caller so it can
    // show a "check your email" message instead of silently doing nothing.
    const needsConfirmation = !data.session;
    return { error: null, needsConfirmation };
  }

  async function signIn(email: string, password: string) {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return { error: error.message };
    return { error: null };
  }

  async function signOut() {
    await supabase.auth.signOut();
    setProfile(null);
    setIsGuest(false);
  }

  function enterGuestMode() {
    setIsGuest(true);
  }

  function exitGuestMode() {
    setIsGuest(false);
  }

  async function updateProfile(data: Partial<Profile>) {
    if (!user) return { error: 'Not authenticated' };

    // Upsert + return the full row. Crucial for first-time setup on
    // brand-new accounts that have NO profile row yet — without this
    // re-read, the local merge `prev ? {...prev,...data} : null` would
    // keep profile=null, hasCompletedSetup stays false, and the user
    // gets stuck on the ProfileSetup screen after pressing "Start
    // Hunting" because App never swaps to AppShell.
    const { data: row, error } = await supabase
      .from('profiles')
      .upsert({ id: user.id, ...data, updated_at: new Date().toISOString() })
      .select('*')
      .single();

    if (error) return { error: error.message };

    if (row) {
      setProfile(row as Profile);
    } else {
      setProfile((prev) => (prev ? { ...prev, ...data } : ({ id: user.id, ...data } as Profile)));
    }
    return { error: null };
  }

  const hasCompletedSetup = !!profile?.username && profile.username.length > 0;
  // Admin role is server-controlled (see prevent_profile_field_escalation
  // trigger + the 20260519000001_admin_role_and_moderation migration).
  // The client surfaces it for UI hints only — every privileged action
  // is enforced again by Supabase RLS using public.is_admin().
  const isAdmin = profile?.role === 'admin';

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        profile,
        loading,
        isGuest,
        signUp,
        signIn,
        signOut,
        enterGuestMode,
        exitGuestMode,
        updateProfile,
        refreshProfile,
        hasCompletedSetup,
        isAdmin,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}
