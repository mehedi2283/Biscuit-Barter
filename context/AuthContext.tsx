import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
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
  
  // Ref to track user state inside event listeners (avoids stale closures)
  const userRef = useRef<User | null>(null);

  useEffect(() => {
    userRef.current = user;
  }, [user]);

  // Helper to sync Supabase Auth user with our Public Profile
  const fetchUser = async (userId: string) => {
    try {
      const foundUser = await BackendService.getUserById(userId);
      if (foundUser) {
        setUser(foundUser);
        return true;
      }
      return false;
    } catch (e) {
      console.error("Error fetching user profile:", e);
      return false;
    }
  };

  useEffect(() => {
    let mounted = true;

    // Failsafe: If loading takes longer than 5 seconds, force it off.
    // This prevents the "stuck on loading" screen if Supabase hangs or logic fails.
    const loadingTimeout = setTimeout(() => {
      if (mounted && isLoading) {
        console.warn("Auth loading timed out. Forcing app load.");
        setIsLoading(false);
      }
    }, 5000);

    const initAuth = async () => {
      try {
        // 1. Initial Session Check
        const { data: { session }, error } = await supabase.auth.getSession();
        
        if (error) throw error;

        if (session?.user) {
           const hasProfile = await fetchUser(session.user.id);
           
           // If session exists but profile is missing (DB inconsistency), log them out
           if (!hasProfile && mounted) {
             console.warn("Session found but profile missing. Cleaning up.");
             await supabase.auth.signOut();
             setUser(null);
           }
        }
      } catch (e) {
        console.error("Auth initialization failed:", e);
        // If auth fails completely, ensure we don't leave the user with a broken state
        if (mounted) setUser(null);
      } finally {
        if (mounted) setIsLoading(false);
        clearTimeout(loadingTimeout);
      }
    };

    initAuth();

    // 2. Listen for Auth Changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (!mounted) return;

      if (event === 'SIGNED_IN' && session?.user) {
        // Use Ref to check if we already have this user loaded to prevent race conditions
        const currentUser = userRef.current;
        if (!currentUser || currentUser.id !== session.user.id) {
           await fetchUser(session.user.id);
        }
      } else if (event === 'SIGNED_OUT') {
        setUser(null);
        setIsLoading(false); // Ensure app knows we are done loading to show Login screen
      }
    });

    return () => {
      mounted = false;
      clearTimeout(loadingTimeout);
      subscription.unsubscribe();
    };
  }, []);

  const login = async (email: string, password: string): Promise<RegisterResult> => {
    // We let the component handle UI loading state, but we update Context state on success
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
      return { success: true, message: "Account created! Please check your email to confirm." };
    } else {
      return { success: false, message: error || 'Registration failed' };
    }
  };

  const logout = async () => {
    try {
      await supabase.auth.signOut();
    } catch (e) {
      console.error("Logout error:", e);
    } finally {
      // Force local cleanup immediately
      setUser(null);
      setIsLoading(false); 
    }
  };

  const refreshUser = async () => {
    if (user) await fetchUser(user.id);
  }

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