"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.expiresIn = exports.randomToken = exports.hash = void 0;
exports.requireUid = requireUid;
exports.requireRecentSignIn = requireRecentSignIn;
exports.getTransaction = getTransaction;
exports.assertParticipant = assertParticipant;
exports.assertSeller = assertSeller;
exports.appendEvent = appendEvent;
exports.assertAccountActive = assertAccountActive;
exports.publicUser = publicUser;
exports.notifyOtherParticipants = notifyOtherParticipants;
const node_crypto_1 = require("node:crypto");
const https_1 = require("firebase-functions/v2/https");
const firestore_1 = require("firebase-admin/firestore");
const config_1 = require("./config");
function requireUid(request) {
    if (!request.auth?.uid)
        throw new https_1.HttpsError('unauthenticated', 'Sign in is required.');
    return request.auth.uid;
}
function requireRecentSignIn(request, maxAgeSeconds = 600) {
    const uid = requireUid(request);
    const authTime = Number(request.auth?.token.auth_time ?? 0);
    if (!authTime || Date.now() / 1000 - authTime > maxAgeSeconds) {
        throw new https_1.HttpsError('failed-precondition', 'Please sign in again before continuing.');
    }
    return uid;
}
const hash = (value) => (0, node_crypto_1.createHash)('sha256').update(value).digest('hex');
exports.hash = hash;
const randomToken = (bytes = 32) => (0, node_crypto_1.randomBytes)(bytes).toString('base64url');
exports.randomToken = randomToken;
async function getTransaction(transactionId) {
    const ref = config_1.db.collection('transactions').doc(transactionId);
    const snap = await ref.get();
    if (!snap.exists)
        throw new https_1.HttpsError('not-found', 'Transaction not found.');
    return { ref, data: snap.data() };
}
function assertParticipant(record, uid) {
    if (!record.participantIds.includes(uid))
        throw new https_1.HttpsError('permission-denied', 'You are not a participant in this transaction.');
}
function assertSeller(record, uid) {
    if (record.sellerId !== uid)
        throw new https_1.HttpsError('permission-denied', 'Only the seller can do that.');
}
async function appendEvent(transactionId, actorId, type, summary, metadata = {}) {
    await config_1.db.collection('transactions').doc(transactionId).collection('events').add({
        actorId,
        type,
        summary: summary.slice(0, 500),
        metadata,
        createdAt: firestore_1.FieldValue.serverTimestamp(),
    });
}
async function assertAccountActive(uid) {
    const snap = await config_1.db.collection('users').doc(uid).get();
    const data = snap.data() ?? {};
    if (data.moderationState === 'SUSPENDED')
        throw new https_1.HttpsError('permission-denied', 'This account is suspended.');
    if (data.deletionScheduledAt)
        throw new https_1.HttpsError('failed-precondition', 'Cancel account deletion before creating or changing transactions.');
    return data;
}
const expiresIn = (seconds) => firestore_1.Timestamp.fromMillis(Date.now() + seconds * 1000);
exports.expiresIn = expiresIn;
function publicUser(user) {
    return {
        uid: user.uid,
        displayName: (user.displayName ?? 'PackProof member').slice(0, 120),
        photoURL: user.photoURL ?? null,
        email: user.email ?? null,
    };
}
async function notifyOtherParticipants(transactionId, actorId, title, body) {
    try {
        const { data } = await getTransaction(transactionId);
        const recipients = data.participantIds.filter((uid) => uid !== actorId);
        const profiles = await Promise.all(recipients.map((uid) => config_1.db.collection('users').doc(uid).get()));
        const messages = profiles.map((snap) => snap.data()?.expoPushToken).filter(Boolean).map((to) => ({ to, title, body, sound: 'default', channelId: 'transactions', data: { transactionId } }));
        if (!messages.length)
            return;
        await fetch('https://exp.host/--/api/v2/push/send', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(messages) });
    }
    catch { /* Notifications are best-effort and never block evidence workflows. */ }
}
//# sourceMappingURL=helpers.js.map