"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.confirmWebDeletion = exports.webDeletionRequest = void 0;
const firestore_1 = require("firebase-admin/firestore");
const https_1 = require("firebase-functions/v2/https");
const config_1 = require("./config");
const helpers_1 = require("./helpers");
const http_security_1 = require("./http-security");
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const httpOptions = { cors: false, invoker: 'public' };
function publicOrigin() {
    return config_1.publicAppUrl.value().replace(/\/$/, '');
}
function redirect(response, path, status = 303) {
    response.redirect(status, `${publicOrigin()}${path}`);
}
async function tokenSnapshot(token) {
    if (!token || token.length < 20 || token.length > 160)
        return null;
    const ref = config_1.db.collection('webDeletionTokens').doc((0, helpers_1.hash)(token));
    const snap = await ref.get();
    const data = snap.data();
    if (!snap.exists || !data || data.expiresAt.toMillis() < Date.now())
        return null;
    return { ref, data };
}
exports.webDeletionRequest = (0, https_1.onRequest)(httpOptions, async (request, response) => {
    (0, http_security_1.applySecurityHeaders)(response);
    if (request.method !== 'POST') {
        response.status(405).send('Method not allowed');
        return;
    }
    const email = String(request.body?.email ?? '').trim().toLowerCase();
    if (!emailPattern.test(email) || email.length > 254) {
        response.status(400).json({ message: 'Enter a valid email address.' });
        return;
    }
    const ipKey = (0, helpers_1.hash)((0, http_security_1.requestIp)(request));
    const rateRef = config_1.db.collection('deletionRateLimits').doc(ipKey);
    const today = new Date().toISOString().slice(0, 10);
    const allowed = await config_1.db.runTransaction(async (tx) => {
        const rate = await tx.get(rateRef);
        const count = rate.data()?.day === today ? Number(rate.data()?.count ?? 0) : 0;
        if (count >= 5)
            return false;
        tx.set(rateRef, { day: today, count: count + 1, updatedAt: firestore_1.FieldValue.serverTimestamp() }, { merge: true });
        return true;
    });
    if (!allowed) {
        response.status(429).json({ message: 'Too many requests. Try again tomorrow.' });
        return;
    }
    try {
        const user = await config_1.adminAuth.getUserByEmail(email);
        const token = (0, helpers_1.randomToken)(32);
        await config_1.db.collection('webDeletionTokens').doc((0, helpers_1.hash)(token)).set({ uid: user.uid, email, expiresAt: (0, helpers_1.expiresIn)(1800), createdAt: firestore_1.FieldValue.serverTimestamp() });
        const confirmationUrl = `${publicOrigin()}/api/confirm-deletion?token=${encodeURIComponent(token)}`;
        await config_1.db.collection('mail').add({
            to: email,
            message: {
                subject: 'Confirm your PackProof account deletion request',
                text: `Open this link within 30 minutes to review and confirm deletion of your PackProof account: ${confirmationUrl}`,
                html: `<p>We received a request to delete your PackProof account.</p><p><a href="${confirmationUrl}">Review account deletion</a></p><p>This link expires in 30 minutes and does not delete your account until you confirm. If you did not make this request, ignore this email.</p>`,
            },
        });
    }
    catch { /* Do not reveal whether an account exists. */ }
    response.status(200).json({ message: 'If a matching email account exists, a confirmation link has been sent.' });
});
exports.confirmWebDeletion = (0, https_1.onRequest)(httpOptions, async (request, response) => {
    (0, http_security_1.applySecurityHeaders)(response);
    const token = String(request.method === 'POST'
        ? (request.body?.token ?? request.query.token ?? '')
        : (request.query.token ?? ''));
    if (request.method === 'GET') {
        const valid = await tokenSnapshot(token);
        if (!valid) {
            redirect(response, '/deletion-invalid.html', 302);
            return;
        }
        redirect(response, `/deletion-confirm.html?token=${encodeURIComponent(token)}`, 302);
        return;
    }
    if (request.method !== 'POST') {
        response.status(405).send('Method not allowed');
        return;
    }
    const scheduled = await config_1.db.runTransaction(async (tx) => {
        if (!token || token.length < 20 || token.length > 160)
            return false;
        const ref = config_1.db.collection('webDeletionTokens').doc((0, helpers_1.hash)(token));
        const snap = await tx.get(ref);
        const data = snap.data();
        if (!snap.exists || !data || data.expiresAt.toMillis() < Date.now())
            return false;
        const scheduledAt = firestore_1.Timestamp.fromMillis(Date.now() + 7 * 86400_000);
        tx.set(config_1.db.collection('users').doc(data.uid), {
            deletionRequestedAt: firestore_1.FieldValue.serverTimestamp(),
            deletionScheduledAt: scheduledAt,
        }, { merge: true });
        tx.delete(ref);
        return true;
    });
    redirect(response, scheduled ? '/deletion-confirmed.html' : '/deletion-invalid.html');
});
//# sourceMappingURL=web-deletion.js.map