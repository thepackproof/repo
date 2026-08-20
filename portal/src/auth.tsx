import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  type User,
} from 'firebase/auth';
import { auth, firebaseEnabled, googleProvider } from './firebase';

type AuthState = {
  user: User | null;
  loading: boolean;
  enabled: boolean;
  signInEmail: (email: string, password: string) => Promise<void>;
  signInGoogle: () => Promise<void>;
  signOutUser: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!auth) {
      setLoading(false);
      return;
    }
    return onAuthStateChanged(auth, (next) => {
      setUser(next);
      setLoading(false);
    });
  }, []);

  const value = useMemo<AuthState>(() => ({
    user,
    loading,
    enabled: firebaseEnabled,
    async signInEmail(email, password) {
      if (!auth) throw new Error('Firebase is not configured for this portal build.');
      await signInWithEmailAndPassword(auth, email, password);
    },
    async signInGoogle() {
      if (!auth) throw new Error('Firebase is not configured for this portal build.');
      await signInWithPopup(auth, googleProvider);
    },
    async signOutUser() {
      if (!auth) return;
      await signOut(auth);
    },
  }), [loading, user]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used within AuthProvider.');
  return value;
}
