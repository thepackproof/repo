import { GoogleSignin } from '@react-native-google-signin/google-signin';
import {
  FacebookAuthProvider,
  GoogleAuthProvider,
  linkWithCredential,
  onAuthStateChanged,
  reauthenticateWithCredential,
  signInWithCredential,
  signInWithCustomToken,
  signOut as firebaseSignOut,
  type AuthCredential,
  type User,
} from '@react-native-firebase/auth';
import * as WebBrowser from 'expo-web-browser';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type PropsWithChildren } from 'react';
import { callFunction, ensureProfile } from '@/lib/api';
import { featureFlags } from '@/constants/features';
import { auth, initializeSecurity } from '@/lib/firebase';
import type { UserProfile } from '@/types/models';

WebBrowser.maybeCompleteAuthSession();

type AuthContextValue = {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  signInGoogle: (link?: boolean) => Promise<void>;
  signInFacebook: (link?: boolean) => Promise<void>;
  signInTikTok: () => Promise<void>;
  refreshAuthentication: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

GoogleSignin.configure({ webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID, offlineAccess: false });

type GoogleResult = { data?: { idToken?: string | null }; idToken?: string | null };

async function googleCredential() {
  await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
  const result = await GoogleSignin.signIn() as GoogleResult;
  const idToken = result.data?.idToken ?? result.idToken;
  if (!idToken) throw new Error('Google did not return a secure sign-in token.');
  return GoogleAuthProvider.credential(idToken);
}

async function facebookCredential() {
  if (!featureFlags.facebookAuth) {
    throw new Error('Facebook sign-in is not enabled in this PackProof build.');
  }
  // This import must remain behind the feature flag. Evaluating the native
  // Facebook module in a build without its config plugin initializes an
  // unconfigured FB SDK and prevents Expo Router from registering any route.
  const { AccessToken, LoginManager } = await import('react-native-fbsdk-next');
  const login = await LoginManager.logInWithPermissions(['public_profile', 'email']);
  if (login.isCancelled) throw new Error('Facebook sign-in was cancelled.');
  const token = await AccessToken.getCurrentAccessToken();
  if (!token?.accessToken) throw new Error('Facebook did not return a secure sign-in token.');
  return FacebookAuthProvider.credential(token.accessToken);
}

export function AuthProvider({ children }: PropsWithChildren) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshProfile = useCallback(async () => {
    if (!auth.currentUser) { setProfile(null); return; }
    const next = await ensureProfile();
    setProfile(next);
  }, []);

  useEffect(() => {
    let unsubscribe: () => void = () => {};
    initializeSecurity()
      .then(() => {
        unsubscribe = onAuthStateChanged(auth, async (nextUser) => {
          setUser(nextUser);
          if (nextUser) {
            try { setProfile(await ensureProfile()); } catch { setProfile(null); }
          } else setProfile(null);
          setLoading(false);
        });
      })
      .catch(() => setLoading(false));
    return () => unsubscribe();
  }, []);

  const applyCredential = useCallback(async (credential: AuthCredential, link = false) => {
    if (link && auth.currentUser) await linkWithCredential(auth.currentUser, credential);
    else await signInWithCredential(auth, credential);
    await refreshProfile();
  }, [refreshProfile]);

  const signInGoogle = useCallback(async (link = false) => applyCredential(await googleCredential(), link), [applyCredential]);
  const signInFacebook = useCallback(async (link = false) => applyCredential(await facebookCredential(), link), [applyCredential]);

  const signInTikTok = useCallback(async () => {
    const session = await callFunction<Record<string, never>, { authorizationUrl: string }>('createTikTokAuthSession', {});
    const result = await WebBrowser.openAuthSessionAsync(session.authorizationUrl, 'packproof://auth/tiktok');
    if (result.type !== 'success' || !result.url) throw new Error('TikTok sign-in was cancelled.');
    const grant = new URL(result.url).searchParams.get('grant');
    if (!grant) throw new Error('TikTok did not return a valid sign-in grant.');
    const redemption = await callFunction<{ grant: string }, { customToken: string }>('redeemTikTokGrant', { grant });
    await signInWithCustomToken(auth, redemption.customToken);
    await refreshProfile();
  }, [refreshProfile]);

  const refreshAuthentication = useCallback(async () => {
    const current = auth.currentUser;
    if (!current) throw new Error('Sign in is required.');
    const providerIds = new Set(current.providerData.map((item) => item.providerId));
    if (providerIds.has('google.com')) await reauthenticateWithCredential(current, await googleCredential());
    else if (providerIds.has('facebook.com')) await reauthenticateWithCredential(current, await facebookCredential());
    else if (profile?.providers.some((providerId) => providerId === 'tiktok.com')) await signInTikTok();
    else throw new Error('Link Google, Facebook, or TikTok before performing this security-sensitive action.');
  }, [profile?.providers, signInTikTok]);

  const signOut = useCallback(async () => {
    try { await callFunction('unregisterPushToken', {}); } catch { /* Sign-out must still work if offline. */ }
    try { await GoogleSignin.signOut(); } catch { /* provider may not be active */ }
    if (featureFlags.facebookAuth) {
      try {
        const { LoginManager } = await import('react-native-fbsdk-next');
        LoginManager.logOut();
      } catch { /* provider may not be active */ }
    }
    await firebaseSignOut(auth);
  }, []);

  const value = useMemo<AuthContextValue>(() => ({
    user,
    profile,
    loading,
    signInGoogle,
    signInFacebook,
    signInTikTok,
    refreshAuthentication,
    refreshProfile,
    signOut,
  }), [user, profile, loading, signInGoogle, signInFacebook, signInTikTok, refreshAuthentication, refreshProfile, signOut]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside AuthProvider.');
  return value;
}
