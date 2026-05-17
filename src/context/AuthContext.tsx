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
  signUp: (email: string, password: string) => Promise<{ error: string | null }>;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  enterGuestMode: () => void;
  exitGuestMode: () => void;
  updateProfile: (data: Partial<Profile>) => Promise<{ error: string | null }>;
  hasCompletedSetup: boolean;
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

  async function signUp(email: string, password: string) {
    const { error } = await supabase.auth.signUp({ email, password });
    if (error) return { error: error.message };
    return { error: null };
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

    const { error } = await supabase
      .from('profiles')
      .upsert({ id: user.id, ...data, updated_at: new Date().toISOString() });

    if (error) return { error: error.message };

    setProfile((prev) => prev ? { ...prev, ...data } : null);
    return { error: null };
  }

  const hasCompletedSetup = !!profile?.username && profile.username.length > 0;

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
        hasCompletedSetup,
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
