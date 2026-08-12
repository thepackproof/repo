import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getAppCheck } from 'firebase-admin/app-check';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { defineSecret, defineString } from 'firebase-functions/params';
import { setGlobalOptions } from 'firebase-functions/v2';

initializeApp();
setGlobalOptions({ region: 'us-east1', maxInstances: 100 });

export const db = getFirestore();
export const adminAuth = getAuth();
export const adminAppCheck = getAppCheck();
export const storage = getStorage();

export const connectLinkBaseUrl = defineString('CONNECT_LINK_BASE_URL', {
  default: 'https://packproof.link',
  description: 'Verified App Link domain used for PackProof Connect capture handoff.',
});
export const publicAppUrl = defineString('PUBLIC_APP_URL', {
  default: 'https://YOUR_PROJECT.web.app',
  description: 'Public Firebase Hosting URL used for invites and policy pages.',
});
export const tikTokRedirectUri = defineString('TIKTOK_REDIRECT_URI', {
  default: 'https://us-east1-YOUR_PROJECT.cloudfunctions.net/tiktokAuthCallback',
});
export const tikTokClientKey = defineSecret('TIKTOK_CLIENT_KEY');
export const tikTokClientSecret = defineSecret('TIKTOK_CLIENT_SECRET');
export const revenueCatWebhookSecret = defineSecret('REVENUECAT_WEBHOOK_SECRET');
export const manifestSigningSecret = defineSecret('MANIFEST_SIGNING_SECRET');
export const webhookSigningSecret = defineSecret('WEBHOOK_SIGNING_SECRET');
export const apiCredentialPepper = defineSecret('API_CREDENTIAL_PEPPER');
export const publicHandoffSigningSecret = defineSecret('PUBLIC_HANDOFF_SIGNING_SECRET');
export const participantHandoffSigningSecret = defineSecret('PARTICIPANT_HANDOFF_SIGNING_SECRET');
export const apiEnvironment = defineString('API_ENVIRONMENT', {
  default: 'sandbox',
  description: 'Merchant API credential and data environment: sandbox or live.',
});
export const manifestSigningKeyId = defineString('MANIFEST_SIGNING_KEY_ID', {
  default: 'manifest-hmac-v1',
  description: 'Non-secret identifier for the HMAC key version used to authenticate evidence manifests.',
});
