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

export const firebaseApp = getApp();
export const auth = getAuth(firebaseApp);
export const db = getFirestore(firebaseApp);
export const functions = getFunctions(firebaseApp, process.env.EXPO_PUBLIC_FIREBASE_FUNCTIONS_REGION ?? 'us-east1');
export const fileStorage = getStorage(firebaseApp);

let appCheckPromise: Promise<AppCheck> | null = null;

export function initializeSecurity(): Promise<AppCheck> {
  if (appCheckPromise) return appCheckPromise;
  const provider = new ReactNativeFirebaseAppCheckProvider();
  provider.configure({
    android: { provider: __DEV__ ? 'debug' : 'playIntegrity' },
    apple: { provider: __DEV__ ? 'debug' : 'appAttestWithDeviceCheckFallback' },
  });
  appCheckPromise = Promise.resolve(initializeAppCheck(firebaseApp, { provider, isTokenAutoRefreshEnabled: true }));
  return appCheckPromise;
}

export async function forceFreshAttestationToken(): Promise<void> {
  const appCheck = await initializeSecurity();
  await getToken(appCheck, true);
}

export async function forceFreshCallableCredentials(): Promise<void> {
  const user = auth.currentUser;
  if (!user) throw new Error('Sign in before performing this protected operation.');
  await Promise.all([
    getIdToken(user, true),
    forceFreshAttestationToken(),
  ]);
}
