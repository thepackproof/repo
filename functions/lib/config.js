"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.manifestSigningSecret = exports.revenueCatWebhookSecret = exports.tikTokClientSecret = exports.tikTokClientKey = exports.tikTokRedirectUri = exports.publicAppUrl = exports.connectLinkBaseUrl = exports.storage = exports.adminAuth = exports.db = void 0;
const app_1 = require("firebase-admin/app");
const auth_1 = require("firebase-admin/auth");
const firestore_1 = require("firebase-admin/firestore");
const storage_1 = require("firebase-admin/storage");
const params_1 = require("firebase-functions/params");
const v2_1 = require("firebase-functions/v2");
(0, app_1.initializeApp)();
(0, v2_1.setGlobalOptions)({ region: 'us-central1', maxInstances: 100 });
exports.db = (0, firestore_1.getFirestore)();
exports.adminAuth = (0, auth_1.getAuth)();
exports.storage = (0, storage_1.getStorage)();
exports.connectLinkBaseUrl = (0, params_1.defineString)('CONNECT_LINK_BASE_URL', {
    default: 'https://packproof.link',
    description: 'Verified App Link domain used for PackProof Connect capture handoff.',
});
exports.publicAppUrl = (0, params_1.defineString)('PUBLIC_APP_URL', {
    default: 'https://YOUR_PROJECT.web.app',
    description: 'Public Firebase Hosting URL used for invites and policy pages.',
});
exports.tikTokRedirectUri = (0, params_1.defineString)('TIKTOK_REDIRECT_URI', {
    default: 'https://us-central1-YOUR_PROJECT.cloudfunctions.net/tiktokAuthCallback',
});
exports.tikTokClientKey = (0, params_1.defineSecret)('TIKTOK_CLIENT_KEY');
exports.tikTokClientSecret = (0, params_1.defineSecret)('TIKTOK_CLIENT_SECRET');
exports.revenueCatWebhookSecret = (0, params_1.defineSecret)('REVENUECAT_WEBHOOK_SECRET');
exports.manifestSigningSecret = (0, params_1.defineSecret)('MANIFEST_SIGNING_SECRET');
//# sourceMappingURL=config.js.map