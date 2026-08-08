"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.confirmWebDeletion = exports.webDeletionRequest = void 0;
const firestore_1 = require("firebase-admin/firestore");
const https_1 = require("firebase-functions/v2/https");
const config_1 = require("./config");
const helpers_1 = require("./helpers");
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
exports.webDeletionRequest = (0, https_1.onRequest)(async (request, response) => {
    if (request.method !== 'POST') {
        response.status(405).send('Method not allowed');
        return;
    }
    const email = String(request.body?.email ?? '').trim().toLowerCase();
    if (!emailPattern.test(email) || email.length > 254) {
        response.status(400).json({ message: 'Enter a valid email address.' });
        return;
    }
    const ipKey = (0, helpers_1.hash)(String(request.ip ?? request.get('x-forwarded-for') ?? 'unknown'));
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
        const confirmationUrl = `${config_1.publicAppUrl.value().replace(/\/$/, '')}/api/confirm-deletion?token=${encodeURIComponent(token)}`;
        await config_1.db.collection('mail').add({
            to: email,
            message: {
                subject: 'Confirm your PackProof account deletion request',
                text: `Open this link within 30 minutes to schedule deletion of your PackProof account: ${confirmationUrl}`,
                html: `<p>We received a request to delete your PackProof account.</p><p><a href="${confirmationUrl}">Confirm account deletion</a></p><p>This link expires in 30 minutes. If you did not make this request, ignore this email.</p>`,
            },
        });
    }
    catch { /* Do not reveal whether an account exists. */ }
    response.status(200).json({ message: 'If a matching email account exists, a confirmation link has been sent.' });
});
exports.confirmWebDeletion = (0, https_1.onRequest)(async (request, response) => {
    const token = String(request.query.token ?? '');
    const ref = config_1.db.collection('webDeletionTokens').doc((0, helpers_1.hash)(token));
    const snap = token ? await ref.get() : null;
    const data = snap?.data();
    if (!snap?.exists || (data?.expiresAt).toMillis() < Date.now()) {
        response.redirect(302, `${config_1.publicAppUrl.value().replace(/\/$/, '')}/deletion-invalid.html`);
        return;
    }
    const scheduledAt = firestore_1.Timestamp.fromMillis(Date.now() + 7 * 86400_000);
    await config_1.db.collection('users').doc(data.uid).set({ deletionRequestedAt: firestore_1.FieldValue.serverTimestamp(), deletionScheduledAt: scheduledAt }, { merge: true });
    await ref.delete();
    response.redirect(302, `${config_1.publicAppUrl.value().replace(/\/$/, '')}/deletion-confirmed.html`);
});
//# sourceMappingURL=web-deletion.js.map