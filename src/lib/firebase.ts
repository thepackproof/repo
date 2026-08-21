import { getApp } from '@react-native-firebase/app';
import {
  getToken,
  initializeAppCheck,
  ReactNativeFirebaseAppCheckProvider,
  type AppCheck,
} from '@react-native-firebase/app-check';
import { getAuth, getIdToken } from '@react-native-firebase/auth';
import { getFirestore } from '@react-native-firebase/firestore';
import { getFunctions } from '@react-native-firebase/functions';
import { getStorage } from '@react-native-firebase/storage';
import { describeCallableError } from '@/lib/callable-error';

export const firebaseApp = getApp();
export const auth = getAuth(firebaseApp);
export const db = getFirestore(firebaseApp);
export const functions = getFunctions(firebaseApp, process.env.EXPO_PUBLIC_FIREBASE_FUNCTIONS_REGION ?? 'us-east1');
export const fileStorage = getStorage(firebaseApp);

let appCheckInstance: AppCheck | null = null;
let appCheckPromise: Promise<AppCheck> | null = null;

function androidAppCheckProvider(): 'debug' | 'playIntegrity' {
  const requested = process.env.EXPO_PUBLIC_APP_CHECK_PROVIDER?.trim().toLowerCase();
  if (requested === 'debug' || (__DEV__ && requested !== 'playintegrity')) return 'debug';
  return 'playIntegrity';
}

export function initializeSecurity(): Promise<AppCheck> {
  if (appCheckPromise) return appCheckPromise;
  const provider = new ReactNativeFirebaseAppCheckProvider();
  provider.configure({
    android: { provider: androidAppCheckProvider() },
    apple: { provider: __DEV__ ? 'debug' : 'appAttestWithDeviceCheckFallback' },
  });
  appCheckPromise = (async () => {
    if (!appCheckInstance) {
      appCheckInstance = initializeAppCheck(firebaseApp, { provider, isTokenAutoRefreshEnabled: true });
    }
    try {
      await getToken(appCheckInstance, false);
    } catch (error) {
      throw new Error(describeCallableError(error, { functionName: 'appCheck', signedIn: Boolean(auth.currentUser) }));
    }
    return appCheckInstance;
  })().catch((error) => {
    appCheckPromise = null;
    throw error;
  });
  return appCheckPromise;
}

export async function forceFreshAttestationToken(): Promise<void> {
  const appCheck = await initializeSecurity();
  try {
    await getToken(appCheck, true);
  } catch (error) {
    throw new Error(describeCallableError(error, { functionName: 'appCheck', signedIn: Boolean(auth.currentUser) }));
  }
}

export async function ensureCallableCredentials(): Promise<void> {
  await initializeSecurity();
  const user = auth.currentUser;
  if (user) await getIdToken(user, false);
}

export async function forceFreshCallableCredentials(): Promise<void> {
  const user = auth.currentUser;
  if (!user) throw new Error('Sign in before performing this protected operation.');
  await Promise.all([
    getIdToken(user, true),
    forceFreshAttestationToken(),
  ]);
}
