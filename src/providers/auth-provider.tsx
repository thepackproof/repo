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
import { acceptLegalPolicies, callFunction, ensureProfile, getLegalAcceptanceStatus } from '@/lib/api';
import { CURRENT_APP_VERSION, CURRENT_PRIVACY_VERSION, CURRENT_TERMS_VERSION, LEGAL_AFFIRMATION } from '@/constants/legal';
import { featureFlags } from '@/constants/features';
import { auth, forceFreshCallableCredentials, initializeSecurity } from '@/lib/firebase';
import { describeCallableError, shouldKeepSignedInAfterCallableFailure } from '@/lib/callable-error';
import type { UserProfile } from '@/types/models';

WebBrowser.maybeCompleteAuthSession();

type AuthContextValue = {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  legalAccepted: boolean;
  sessionReady: boolean;
  signInGoogle: (link?: boolean, acceptCurrentPolicies?: boolean) => Promise<void>;
  signInFacebook: (link?: boolean, acceptCurrentPolicies?: boolean) => Promise<void>;
  signInTikTok: (acceptCurrentPolicies?: boolean) => Promise<void>;
  acceptCurrentPolicies: () => Promise<void>;
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
  const [legalAccepted, setLegalAccepted] = useState(false);
  const [loading, setLoading] = useState(true);

  const refreshProfile = useCallback(async () => {
    if (!auth.currentUser) { setProfile(null); return; }
    const [profileResult, legalResult] = await Promise.allSettled([ensureProfile(), getLegalAcceptanceStatus()]);
    if (profileResult.status === 'fulfilled') setProfile(profileResult.value);
    else setProfile(null);
    if (legalResult.status === 'fulfilled') setLegalAccepted(legalResult.value.accepted);
    else setLegalAccepted(false);
    if (profileResult.status === 'rejected') throw profileResult.reason;
    if (legalResult.status === 'rejected') throw legalResult.reason;
  }, []);

  useEffect(() => {
    let cancelled = false;
    let unsubscribe: () => void = () => {};
    void (async () => {
      try {
        await initializeSecurity();
      } catch {
        // App Check init must not skip auth restoration. Callables still
        // fail closed if attestation cannot be obtained later.
      }
      if (cancelled) return;
      unsubscribe = onAuthStateChanged(auth, async (nextUser) => {
        setUser(nextUser);
        if (nextUser) {
          try {
            await forceFreshCallableCredentials();
            const [profileResult, legalResult] = await Promise.allSettled([ensureProfile(), getLegalAcceptanceStatus()]);
            if (profileResult.status === 'fulfilled') setProfile(profileResult.value);
            else setProfile(null);
            if (legalResult.status === 'fulfilled') setLegalAccepted(legalResult.value.accepted);
            else setLegalAccepted(false);
          } catch {
            setProfile(null);
            setLegalAccepted(false);
          }
        } else {
          setProfile(null);
          setLegalAccepted(false);
        }
        setLoading(false);
      });
    })();
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  const recordCurrentPolicies = useCallback(async () => {
    await acceptLegalPolicies({
      termsVersion: CURRENT_TERMS_VERSION,
      privacyVersion: CURRENT_PRIVACY_VERSION,
      appVersion: CURRENT_APP_VERSION,
      affirmation: LEGAL_AFFIRMATION,
    });
    setLegalAccepted(true);
  }, []);

  const applyCredential = useCallback(async (credential: AuthCredential, link = false, acceptCurrentPolicies = false) => {
    if (link && auth.currentUser) await linkWithCredential(auth.currentUser, credential);
    else await signInWithCredential(auth, credential);
    try {
      await forceFreshCallableCredentials();
      if (acceptCurrentPolicies) await recordCurrentPolicies();
      await refreshProfile();
    } catch (error) {
      const signedIn = Boolean(auth.currentUser);
      if (!link && !shouldKeepSignedInAfterCallableFailure(error, signedIn)) {
        await firebaseSignOut(auth).catch(() => undefined);
      }
      throw new Error(describeCallableError(error, { functionName: 'signIn', signedIn }));
    }
  }, [recordCurrentPolicies, refreshProfile]);

  const signInGoogle = useCallback(async (link = false, acceptCurrentPolicies = false) => applyCredential(await googleCredential(), link, acceptCurrentPolicies), [applyCredential]);
  const signInFacebook = useCallback(async (link = false, acceptCurrentPolicies = false) => applyCredential(await facebookCredential(), link, acceptCurrentPolicies), [applyCredential]);

  const signInTikTok = useCallback(async (acceptCurrentPolicies = false) => {
    const session = await callFunction<Record<string, never>, { authorizationUrl: string }>('createTikTokAuthSession', {});
    const result = await WebBrowser.openAuthSessionAsync(session.authorizationUrl, 'packproof://auth/tiktok');
    if (result.type !== 'success' || !result.url) throw new Error('TikTok sign-in was cancelled.');
    const grant = new URL(result.url).searchParams.get('grant');
    if (!grant) throw new Error('TikTok did not return a valid sign-in grant.');
    const redemption = await callFunction<{ grant: string }, { customToken: string }>('redeemTikTokGrant', { grant });
    await signInWithCustomToken(auth, redemption.customToken);
    try {
      await forceFreshCallableCredentials();
      if (acceptCurrentPolicies) await recordCurrentPolicies();
      await refreshProfile();
    } catch (error) {
      const signedIn = Boolean(auth.currentUser);
      if (!shouldKeepSignedInAfterCallableFailure(error, signedIn)) {
        await firebaseSignOut(auth).catch(() => undefined);
      }
      throw new Error(describeCallableError(error, { functionName: 'signInTikTok', signedIn }));
    }
  }, [recordCurrentPolicies, refreshProfile]);

  const refreshAuthentication = useCallback(async () => {
    const current = auth.currentUser;
    if (!current) throw new Error('Sign in is required.');
    const providerIds = new Set(current.providerData.map((item) => item.providerId));
    if (providerIds.has('google.com')) await reauthenticateWithCredential(current, await googleCredential());
    else if (providerIds.has('facebook.com')) await reauthenticateWithCredential(current, await facebookCredential());
    else if (profile?.providers.some((providerId) => providerId === 'tiktok.com')) await signInTikTok(false);
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

  const sessionReady = Boolean(user && legalAccepted);
  const value = useMemo<AuthContextValue>(() => ({
    user,
    profile,
    loading,
    legalAccepted,
    sessionReady,
    signInGoogle,
    signInFacebook,
    signInTikTok,
    acceptCurrentPolicies: recordCurrentPolicies,
    refreshAuthentication,
    refreshProfile,
    signOut,
  }), [user, profile, loading, legalAccepted, sessionReady, signInGoogle, signInFacebook, signInTikTok, recordCurrentPolicies, refreshAuthentication, refreshProfile, signOut]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside AuthProvider.');
  return value;
}
