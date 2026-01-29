import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { User } from '../types';
import { BackendService, supabase } from '../services/backend';

interface RegisterResult {
  success: boolean;
  message?: string;
}

interface AuthContextType {
  user: User | null;
  login: (email: string, password: string) => Promise<RegisterResult>;
  register: (name: string, email: string, password: string) => Promise<RegisterResult>;
  logout: () => void;
  refreshUser: () => void;
  isAuthenticated: boolean;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Optimistic User Setter: Sets user from Session immediately, then tries DB
  const processSession = useCallback(async (sessionUser: any) => {
    if (!sessionUser) return;

    // 1. Construct Basic User from Session (Fast)
    const basicUser: User = {
      id: sessionUser.id,
      email: sessionUser.email,
      name: sessionUser.user_metadata?.name || sessionUser.email?.split('@')[0] || 'Trader',
      role: 'USER', // Default, upgraded later if DB fetch succeeds
      isFrozen: false
    };

    // Set immediately if we don't have a user, to unblock UI
    setUser(prev => prev ? prev : basicUser);

    // 2. Fetch Full Profile from DB (Async)
    try {
      const dbUser = await BackendService.getUserById(sessionUser.id);
      if (dbUser) {
        setUser(dbUser);
      }
    } catch (e) {
      console.warn("DB Profile fetch failed, using session fallback.", e);
    }
  }, []);

  useEffect(() => {
    let mounted = true;

    // Safety: Force loading to false after 2s max to prevent black screen
    const safetyTimer = setTimeout(() => {
       if (mounted && isLoading) setIsLoading(false);
    }, 2000);

    const initAuth = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user && mounted) {
           await processSession(session.user);
        }
      } catch (err) {
        console.error("Session check failed", err);
      } finally {
        if (mounted) setIsLoading(false);
      }
    };

    initAuth();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) return;
      
      if (event === 'SIGNED_IN' || event === 'INITIAL_SESSION') {
        if (session?.user) {
          processSession(session.user);
          // Don't wait for DB to stop loading, session is enough for UI
          setIsLoading(false);
        }
      } else if (event === 'SIGNED_OUT') {
        setUser(null);
        setIsLoading(false);
      }
    });

    return () => {
      mounted = false;
      clearTimeout(safetyTimer);
      subscription.unsubscribe();
    };
  }, [processSession]);

  const login = async (email: string, password: string): Promise<RegisterResult> => {
    const { user: foundUser, error } = await BackendService.authenticate(email, password);
    if (foundUser) {
      setUser(foundUser);
      return { success: true };
    } else {
      return { success: false, message: error || 'Login failed.' };
    }
  };

  const register = async (name: string, email: string, password: string): Promise<RegisterResult> => {
    const { user: newUser, error } = await BackendService.createUser(name, email, password);
    if (newUser) {
      return { success: true, message: "Account created! Check email." };
    } else {
      return { success: false, message: error || 'Registration failed' };
    }
  };

  const logout = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setIsLoading(false);
  };

  const refreshUser = async () => {
    if (user) {
        const foundUser = await BackendService.getUserById(user.id);
        if (foundUser) setUser(foundUser);
    }
  };

  return (
    <AuthContext.Provider value={{ user, login, register, logout, refreshUser, isAuthenticated: !!user, isLoading }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};