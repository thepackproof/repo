"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createPrivateDownloadUrl = exports.createEvidencePacket = exports.onEvidenceUploaded = void 0;
exports.generateEvidencePacket = generateEvidencePacket;
const node_crypto_1 = require("node:crypto");
const firestore_1 = require("firebase-admin/firestore");
const https_1 = require("firebase-functions/v2/https");
const storage_1 = require("firebase-functions/v2/storage");
const pdf_lib_1 = require("pdf-lib");
const config_1 = require("./config");
const evidence_format_1 = require("./evidence-format");
const helpers_1 = require("./helpers");
const evidence_finalization_1 = require("./evidence-finalization");
const package_seal_protocol_1 = require("./package-seal-protocol");
const validation_1 = require("./validation");
const MAX_EVIDENCE_BYTES = 600 * 1024 * 1024;
async function sha256File(file) {
    const digest = (0, node_crypto_1.createHash)('sha256');
    await new Promise((resolve, reject) => {
        file.createReadStream().on('data', (chunk) => digest.update(chunk)).on('error', reject).on('end', resolve);
    });
    return digest.digest('hex');
}
async function readPrefix(file, length = 32) {
    const chunks = [];
    await new Promise((resolve, reject) => {
        file.createReadStream({ start: 0, end: length - 1 })
            .on('data', (chunk) => chunks.push(Buffer.from(chunk)))
            .on('error', reject)
            .on('end', resolve);
    });
    return Buffer.concat(chunks);
}
function grantFieldsFromPending(pending) {
    const mode = pending?.attestationSnapshot?.mode;
    return {
        acquisitionClass: (0, evidence_finalization_1.acquisitionClassOf)(pending?.acquisitionClass),
        edgeAgentId: typeof pending?.edgeAgentId === 'string' ? pending.edgeAgentId : null,
        clientManifest: pending?.clientManifest && typeof pending.clientManifest === 'object'
            ? pending.clientManifest
            : null,
        attestationSnapshot: mode === 'ENTERPRISE_EDGE' || mode === 'JIT_APP_CHECK' || mode === 'OFFLINE_UNATTESTED'
            ? {
                mode,
                deviceKeySignatureValid: pending?.attestationSnapshot?.deviceKeySignatureValid === true,
            }
            : null,
    };
}
function timestampIso(value) {
    if (value instanceof firestore_1.Timestamp)
        return value.toDate().toISOString();
    if (value && typeof value === 'object' && 'toDate' in value && typeof value.toDate === 'function') {
        return (value.toDate()).toISOString();
    }
    return typeof value === 'string' ? value : null;
}
function normalizedAppDeviceContext(value) {
    if (!value)
        return null;
    const proof = value.deviceKeyProof;
    return {
        mode: typeof value.mode === 'string' ? value.mode : 'NOT_PROVIDED',
        captureSessionId: typeof value.captureSessionId === 'string' ? value.captureSessionId : null,
        nonce: typeof value.nonce === 'string' ? value.nonce : null,
        appId: typeof value.appId === 'string' ? value.appId : null,
        issuedAt: timestampIso(value.issuedAt),
        captureWindowEndsAt: timestampIso(value.captureWindowEndsAt),
        tokenReplayDetected: typeof value.tokenReplayDetected === 'boolean' ? value.tokenReplayDetected : null,
        reasonCodes: Array.isArray(value.reasonCodes) ? value.reasonCodes.filter((item) => typeof item === 'string') : [],
        deviceKeyProof: proof ? {
            algorithm: typeof proof.algorithm === 'string' ? proof.algorithm : null,
            keyAlias: typeof proof.keyAlias === 'string' ? proof.keyAlias : null,
            publicKeySpkiBase64: typeof proof.publicKeySpkiBase64 === 'string' ? proof.publicKeySpkiBase64 : null,
            challengeSignatureBase64: typeof proof.challengeSignatureBase64 === 'string' ? proof.challengeSignatureBase64 : null,
            hardwareBackedSignal: typeof proof.hardwareBacked === 'boolean' ? proof.hardwareBacked : null,
        } : null,
        deviceKeySignatureValid: typeof value.deviceKeySignatureValid === 'boolean' ? value.deviceKeySignatureValid : null,
        sessionMode: typeof value.sessionMode === 'string' ? value.sessionMode : null,
        maxEvidenceCount: typeof value.maxEvidenceCount === 'number' ? value.maxEvidenceCount : null,
        captureProfileId: typeof value.captureProfileId === 'string' ? value.captureProfileId : null,
        captureGroupId: typeof value.captureGroupId === 'string' ? value.captureGroupId : null,
    };
}
exports.onEvidenceUploaded = (0, storage_1.onObjectFinalized)({ timeoutSeconds: 540, memory: '1GiB', secrets: [config_1.manifestSigningSecret] }, async (event) => {
    const object = event.data;
    const path = object.name;
    if (!path?.startsWith('evidence/'))
        return;
    const match = /^evidence\/([^/]+)\/([^/]+)\/([^/]+)$/i.exec(path);
    const bucket = config_1.storage.bucket(object.bucket);
    const file = bucket.file(path);
    if (!match) {
        await file.delete({ ignoreNotFound: true });
        return;
    }
    const [, transactionId, uploaderId, uploadId] = match;
    const evidenceRef = config_1.db.collection('transactions').doc(transactionId).collection('evidence').doc(uploadId);
    // Cloud Storage finalize events are delivered at least once. If this upload has
    // already been accepted, return before consulting the now-consumed grant so a
    // duplicate delivery can never delete valid evidence.
    if ((await evidenceRef.get()).exists)
        return;
    const pendingRef = config_1.db.collection('pendingUploads').doc(uploadId);
    const pendingSnap = await pendingRef.get();
    const pending = pendingSnap.data();
    const size = Number(object.size ?? 0);
    const contentType = object.contentType ?? '';
    const expiresAt = pending?.expiresAt;
    const invalid = !pendingSnap.exists
        || pending?.transactionId !== transactionId
        || pending?.uploaderId !== uploaderId
        || pending?.storagePath !== path
        || pending?.contentType !== contentType
        || !expiresAt
        || expiresAt.toMillis() < Date.now()
        || size <= 0
        || size > MAX_EVIDENCE_BYTES;
    if (invalid) {
        await file.delete({ ignoreNotFound: true });
        if (pendingSnap.exists)
            await pendingRef.delete();
        return;
    }
    const { data } = await (0, helpers_1.getTransaction)(transactionId);
    const pendingGrant = grantFieldsFromPending(pending);
    if (!(0, evidence_finalization_1.uploaderAuthorizedForGrant)({
        participantIds: data.participantIds,
        uploaderId,
        pending: pendingGrant,
    })) {
        await file.delete({ ignoreNotFound: true });
        await pendingRef.delete();
        return;
    }
    const digest = await sha256File(file);
    const detectedContentType = (0, evidence_format_1.detectSupportedMediaType)(await readPrefix(file));
    const contentTypeMatched = detectedContentType === contentType;
    const clientSha256 = typeof pending?.clientSha256 === 'string' ? pending.clientSha256 : null;
    const clientHashMatched = clientSha256 ? clientSha256 === digest : null;
    const clientSizeBytes = typeof pending?.clientSizeBytes === 'number' ? pending.clientSizeBytes : null;
    const clientSizeMatched = clientSizeBytes !== null ? clientSizeBytes === size : null;
    const evidenceType = String(pending.evidenceType);
    const attestationStatus = (0, evidence_finalization_1.attestationStatusForGrant)(pendingGrant);
    const carrierTrackingMatchStatus = pending?.carrierContext?.matchStatus ?? 'NOT_SCANNED';
    const clientWallDurationMs = pending?.clientManifest
        ? Date.parse(String(pending.clientManifest.captureFinishedAt)) - Date.parse(String(pending.clientManifest.captureStartedAt))
        : null;
    const clientMonotonicElapsedMs = typeof pending?.clientManifest?.time?.monotonicElapsedMs === 'number'
        ? pending.clientManifest.time.monotonicElapsedMs
        : null;
    const clientTimeConsistencyStatus = clientWallDurationMs === null
        ? 'NOT_PROVIDED'
        : clientMonotonicElapsedMs === null
            ? 'NO_MONOTONIC_REFERENCE'
            : Math.abs(clientWallDurationMs - clientMonotonicElapsedMs) <= 5_000
                ? 'CONSISTENT_WITHIN_5_SECONDS'
                : 'INCONSISTENT';
    const assurance = (0, evidence_finalization_1.assuranceForFinalization)({
        clientManifest: pendingGrant.clientManifest,
        attestationStatus,
        clientHashMatched,
        clientSizeMatched,
        contentTypeMatched,
        carrierStatus: carrierTrackingMatchStatus,
        clientTimeConsistencyStatus,
    });
    const appDeviceContext = normalizedAppDeviceContext(pending?.attestationSnapshot);
    // Remove any client-upload download token and force private/no-store object
    // metadata. Participant reads remain available through authenticated Storage
    // rules; the app obtains only short-lived signed links from a callable.
    await file.setMetadata({
        cacheControl: 'private, max-age=0, no-store',
        contentDisposition: 'attachment',
        metadata: { transactionId, uploaderId, uploadId, accessClass: 'TRANSACTION_PARTICIPANTS' },
    });
    const manifest = {
        schemaVersion: evidence_format_1.EVIDENCE_MANIFEST_SCHEMA_VERSION,
        format: {
            canonicalizationProfile: evidence_format_1.CANONICALIZATION_PROFILE,
            canonicalizationStandard: 'RFC8785_JCS',
            bundleBindingProfile: evidence_format_1.BUNDLE_BINDING_PROFILE,
        },
        evidence: {
            uploadId,
            clientEvidenceId: pending?.clientEvidenceId ?? null,
            transactionId,
            uploaderId,
            uploaderRole: (0, evidence_finalization_1.uploaderRoleForGrant)({
                sellerId: data.sellerId,
                buyerId: data.buyerId ?? null,
                uploaderId,
                pending: pendingGrant,
            }),
            evidenceType,
            ...(pendingGrant.acquisitionClass ? { acquisitionClass: pendingGrant.acquisitionClass } : {}),
            returnPassportId: pending?.returnPassportId ?? null,
            connectSessionId: pending?.connectSessionId ?? null,
            originalName: pending.originalName,
            declaredContentType: contentType,
            detectedContentType,
            sizeBytes: size,
            sha256: digest,
            storageGeneration: object.generation ?? null,
        },
        capture: pending?.clientManifest ?? null,
        appDeviceContext,
        carrierContext: pending?.carrierContext ?? null,
        serverReceipt: {
            bucket: object.bucket,
            storagePath: path,
            storageGeneration: object.generation ?? null,
            receivedAt: object.timeCreated ?? new Date().toISOString(),
            ingressNetwork: pending?.ingressNetwork ?? null,
        },
        verification: {
            serverHashAlgorithm: 'SHA-256',
            clientSha256,
            clientHashMatched,
            clientSizeBytes,
            clientSizeMatched,
            declaredContentType: contentType,
            detectedContentType,
            contentTypeMatched,
            attestationStatus,
            runtimeIntegrityScope: pending?.clientManifest?.runtimeIntegrity?.integrityScope ?? null,
            clientWallDurationMs,
            clientMonotonicElapsedMs,
            clientTimeConsistencyStatus,
        },
        assurance,
        governance: {
            accessClass: 'TRANSACTION_PARTICIPANTS',
            retentionPolicyId: 'DEFAULT_UNCONFIGURED',
            legalHoldStatus: 'NOT_EVALUATED',
        },
        authentication: {
            type: 'SERVICE_MAC',
            algorithm: 'HMAC-SHA256',
            keyId: config_1.manifestSigningKeyId.value(),
            verificationScope: 'PACKPROOF_SERVICE_ONLY',
            publicVerificationAvailable: false,
        },
    };
    const manifestJson = (0, evidence_format_1.canonicalizeJson)(manifest);
    const manifestSha256 = (0, evidence_format_1.sha256Hex)(manifestJson);
    const evidenceBundleSha256 = (0, evidence_format_1.createEvidenceBundleSha256)(digest, manifestSha256);
    const manifestMacBase64url = (0, node_crypto_1.createHmac)('sha256', config_1.manifestSigningSecret.value()).update(manifestJson).digest('base64url');
    const manifestPath = `manifests/${transactionId}/${uploadId}.json`;
    await bucket.file(manifestPath).save(Buffer.from(manifestJson), {
        contentType: 'application/json',
        resumable: false,
        metadata: {
            cacheControl: 'private, max-age=0, no-store',
            metadata: {
                transactionId,
                uploadId,
                schemaVersion: String(evidence_format_1.EVIDENCE_MANIFEST_SCHEMA_VERSION),
                manifestSha256,
                evidenceBundleSha256,
                manifestMacAlgorithm: 'HMAC-SHA256',
                manifestMacKeyId: config_1.manifestSigningKeyId.value(),
                manifestMacBase64url,
            },
        },
    });
    const evidenceData = {
        id: uploadId,
        transactionId,
        uploaderId,
        role: (0, evidence_finalization_1.uploaderRoleForGrant)({
            sellerId: data.sellerId,
            buyerId: data.buyerId ?? null,
            uploaderId,
            pending: pendingGrant,
        }),
        type: evidenceType,
        storagePath: path,
        manifestPath,
        contentType,
        originalName: pending.originalName,
        sizeBytes: size,
        sha256: digest,
        requestFingerprint: pending?.requestFingerprint ?? null,
        clientEvidenceId: pending?.clientEvidenceId ?? null,
        clientSha256,
        clientHashMatched,
        clientSizeMatched,
        detectedContentType,
        contentTypeMatched,
        clientTimeConsistencyStatus,
        manifestSchemaVersion: evidence_format_1.EVIDENCE_MANIFEST_SCHEMA_VERSION,
        canonicalizationProfile: evidence_format_1.CANONICALIZATION_PROFILE,
        bundleBindingProfile: evidence_format_1.BUNDLE_BINDING_PROFILE,
        manifestSha256,
        evidenceBundleSha256,
        manifestAuthentication: {
            type: 'SERVICE_MAC',
            algorithm: 'HMAC-SHA256',
            keyId: config_1.manifestSigningKeyId.value(),
            macBase64url: manifestMacBase64url,
            verificationScope: 'PACKPROOF_SERVICE_ONLY',
        },
        attestationStatus,
        deviceKeySignatureValid: pending?.attestationSnapshot?.deviceKeySignatureValid ?? null,
        deviceKeyHardwareBackedSignal: pending?.attestationSnapshot?.deviceKeyProof?.hardwareBacked ?? null,
        carrierTrackingMatchStatus,
        scannedTrackingNumber: pending?.carrierContext?.scannedTrackingNumber ?? null,
        captureSessionId: pending?.captureSessionId ?? null,
        returnPassportId: pending?.returnPassportId ?? null,
        connectSessionId: pending?.connectSessionId ?? null,
        acquisitionClass: pendingGrant.acquisitionClass,
        edgeAgentId: pendingGrant.edgeAgentId,
        fulfillmentSessionId: typeof pending?.fulfillmentSessionId === 'string' ? pending.fulfillmentSessionId : null,
        organizationId: typeof pending?.organizationId === 'string' ? pending.organizationId : null,
        captureGroupId: pending?.clientManifest?.physicalCaptureProfile?.captureGroupId ?? null,
        physicalRegionId: pending?.clientManifest?.physicalCaptureProfile?.observedRegion ?? null,
        captureProfileId: pending?.clientManifest?.physicalCaptureProfile?.profileId ?? null,
        physicalCaptureIntent: pending?.clientManifest?.physicalCaptureProfile?.intendedUse ?? null,
        physicalFrameIndex: pending?.clientManifest?.physicalCaptureProfile?.frameIndex ?? null,
        clientCreatedAt: pending.clientCreatedAt ?? null,
        serverReceivedAt: object.timeCreated ?? null,
        createdAt: firestore_1.FieldValue.serverTimestamp(),
        serverFinalized: true,
        assurance,
        moderationStatus: clientHashMatched === false || clientSizeMatched === false || !contentTypeMatched
            ? 'INTEGRITY_MISMATCH_REVIEW'
            : pending?.carrierContext?.matchStatus === 'MISMATCH'
                ? 'TRACKING_MISMATCH_REVIEW'
                : 'UNREVIEWED',
    };
    const returnPassportId = pending?.returnPassportId;
    const integrityAccepted = clientHashMatched !== false && clientSizeMatched !== false && contentTypeMatched;
    const summary = integrityAccepted
        ? `${evidenceType.replaceAll('_', ' ').toLowerCase()} was server-hashed and sealed into a service-authenticated manifest.`
        : `${evidenceType.replaceAll('_', ' ').toLowerCase()} was preserved but quarantined because an integrity or media-type check failed.`;
    const transactionRef = config_1.db.collection('transactions').doc(transactionId);
    const returnRef = returnPassportId ? transactionRef.collection('returns').doc(returnPassportId) : null;
    const captureSessionRef = pending?.captureSessionId ? config_1.db.collection('captureSessions').doc(String(pending.captureSessionId)) : null;
    const eventRef = transactionRef.collection('events').doc(`evidence_${uploadId}`);
    const created = await config_1.db.runTransaction(async (tx) => {
        // Read every dependent record before writing so the evidence record, one-time
        // grant consumption, state transitions and deterministic timeline entry are
        // committed as one idempotent unit.
        const freshEvidence = await tx.get(evidenceRef);
        if (freshEvidence.exists)
            return false;
        const freshPending = await tx.get(pendingRef);
        const freshTransaction = await tx.get(transactionRef);
        const freshReturn = returnRef ? await tx.get(returnRef) : null;
        if (!freshPending.exists || !freshTransaction.exists)
            throw new Error('Evidence finalization prerequisites disappeared.');
        const freshPendingData = freshPending.data();
        const freshTransactionData = freshTransaction.data();
        if (freshPendingData?.storagePath !== path || freshPendingData?.uploaderId !== uploaderId
            || !(0, evidence_finalization_1.uploaderAuthorizedForGrant)({
                participantIds: freshTransactionData?.participantIds ?? [],
                uploaderId,
                pending: grantFieldsFromPending(freshPendingData),
            })) {
            throw new Error('Evidence finalization prerequisites no longer match the uploaded object.');
        }
        tx.create(evidenceRef, evidenceData);
        tx.delete(pendingRef);
        if (captureSessionRef) {
            tx.set(captureSessionRef, { finalizedAt: firestore_1.FieldValue.serverTimestamp(), evidenceId: uploadId }, { merge: true });
        }
        if (integrityAccepted && (0, package_seal_protocol_1.isOutboundPackingEvidenceType)(evidenceType) && freshTransactionData?.status === 'TERMS_LOCKED') {
            tx.update(transactionRef, { status: 'PACKED', updatedAt: firestore_1.FieldValue.serverTimestamp() });
        }
        else if (integrityAccepted && evidenceType === 'UNBOXING_VIDEO' && freshTransactionData?.status === 'SHIPPED') {
            tx.update(transactionRef, { status: 'BUYER_REVIEW', updatedAt: firestore_1.FieldValue.serverTimestamp() });
        }
        if (integrityAccepted && returnRef && freshReturn?.exists && evidenceType === 'RETURN_PACKING_VIDEO' && freshReturn.data()?.status === 'AUTHORIZED') {
            tx.update(returnRef, { status: 'PACKED', updatedAt: firestore_1.FieldValue.serverTimestamp() });
        }
        else if (integrityAccepted && returnRef && freshReturn?.exists && evidenceType === 'RETURN_UNBOXING_VIDEO' && freshReturn.data()?.status === 'IN_TRANSIT') {
            tx.update(returnRef, { status: 'RECEIVED_REVIEW', receivedAt: firestore_1.FieldValue.serverTimestamp(), updatedAt: firestore_1.FieldValue.serverTimestamp() });
        }
        tx.create(eventRef, {
            actorId: uploaderId,
            type: integrityAccepted ? 'EVIDENCE_FINALIZED' : 'EVIDENCE_INTEGRITY_MISMATCH',
            summary: summary.slice(0, 500),
            metadata: {
                evidenceId: uploadId,
                sha256: digest,
                manifestSha256,
                evidenceBundleSha256,
                attestationStatus,
                clientHashMatched,
                clientSizeMatched,
                contentTypeMatched,
                carrierTrackingMatchStatus: pending?.carrierContext?.matchStatus ?? 'NOT_SCANNED',
                returnPassportId: returnPassportId ?? null,
            },
            createdAt: firestore_1.FieldValue.serverTimestamp(),
        });
        return true;
    });
    if (created) {
        await (0, helpers_1.notifyOtherParticipants)(transactionId, uploaderId, integrityAccepted ? 'New evidence finalized' : 'Evidence requires integrity review', integrityAccepted
            ? `${evidenceType.replaceAll('_', ' ').toLowerCase()} was server-hashed and added to the evidence record.`
            : `${evidenceType.replaceAll('_', ' ').toLowerCase()} did not advance the workflow because an integrity check failed.`);
    }
});
function money(minor, currency) {
    try {
        return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(minor / 100);
    }
    catch {
        return `${currency} ${(minor / 100).toFixed(2)}`;
    }
}
function wrapText(text, maxChars = 84) {
    const words = text.replace(/\s+/g, ' ').trim().split(' ');
    const lines = [];
    let line = '';
    for (const word of words) {
        if (`${line} ${word}`.trim().length > maxChars) {
            if (line)
                lines.push(line);
            line = word;
        }
        else
            line = `${line} ${word}`.trim();
    }
    if (line)
        lines.push(line);
    return lines.length ? lines : [''];
}
async function generateEvidencePacket(transactionId, generatedBy, options) {
    if (options?.reportId) {
        const existing = await config_1.db.collection('transactions').doc(transactionId).collection('packets').doc(options.reportId).get();
        const stored = existing.data();
        if (existing.exists && stored && typeof stored.storagePath === 'string' && typeof stored.sha256 === 'string') {
            return {
                reportId: options.reportId,
                storagePath: stored.storagePath,
                sha256: stored.sha256,
                evidenceCount: Number(stored.evidenceCount ?? 0),
            };
        }
    }
    const { data } = await (0, helpers_1.getTransaction)(transactionId);
    const [evidenceSnap, eventsSnap, returnsSnap] = await Promise.all([
        config_1.db.collection('transactions').doc(transactionId).collection('evidence').orderBy('createdAt', 'asc').get(),
        config_1.db.collection('transactions').doc(transactionId).collection('events').orderBy('createdAt', 'asc').get(),
        config_1.db.collection('transactions').doc(transactionId).collection('returns').orderBy('createdAt', 'asc').get(),
    ]);
    const evidence = evidenceSnap.docs.map((item) => item.data());
    const events = eventsSnap.docs.map((item) => item.data());
    const returns = returnsSnap.docs.map((item) => item.data());
    const pdf = await pdf_lib_1.PDFDocument.create();
    const regular = await pdf.embedFont(pdf_lib_1.StandardFonts.Helvetica);
    const bold = await pdf.embedFont(pdf_lib_1.StandardFonts.HelveticaBold);
    const dark = (0, pdf_lib_1.rgb)(0.03, 0.07, 0.12);
    const teal = (0, pdf_lib_1.rgb)(0.13, 0.83, 0.71);
    let page = pdf.addPage([612, 792]);
    let y = 744;
    const addLine = (text, options = {}) => {
        const size = options.size ?? 9;
        for (const line of wrapText(text, Math.floor(92 * (9 / size)))) {
            if (y < 54) {
                page = pdf.addPage([612, 792]);
                y = 744;
            }
            page.drawText(line, { x: 48, y, size, font: options.bold ? bold : regular, color: options.color ?? dark });
            y -= size + 4;
        }
        y -= options.gap ?? 2;
    };
    addLine('PACKPROOF EVIDENCE DOSSIER', { bold: true, size: 18, color: teal, gap: 8 });
    addLine(`Generated: ${new Date().toISOString()}`);
    addLine(`Transaction ID: ${transactionId}`);
    addLine('This dossier inventories participant-entered terms, server-computed byte hashes, service-authenticated manifest fingerprints, and separately reported assurance dimensions. PackProof does not authenticate item contents, prove uninterrupted physical custody, insure shipments, provide escrow, decide fraud, or guarantee a legal, carrier, marketplace, or payment outcome.', { gap: 12 });
    addLine('TRANSACTION', { bold: true, size: 12, gap: 5 });
    addLine(`Item: ${data.title}`);
    addLine(`Category: ${data.category}`);
    addLine(`Agreed price: ${money(data.priceMinor, data.currency)}`);
    addLine(`Status: ${data.status}`);
    addLine(`Seller account: ${data.sellerId}`);
    addLine(`Buyer account: ${data.buyerId ?? 'Platform-managed / not joined'}`);
    if (data.conditionNotes)
        addLine(`Condition notes: ${data.conditionNotes}`);
    for (const identifier of data.identifiers ?? [])
        addLine(`${identifier.label}: ${identifier.value}`);
    addLine(`Sale type: ${data.terms.saleType}; returns: ${data.terms.returns}; return window: ${data.terms.returnWindowDays} days`);
    if (data.source)
        addLine(`PackProof Connect: ${data.source.platform}; external order: ${data.source.externalOrderId}`);
    y -= 8;
    const observations = (0, package_seal_protocol_1.groupPackageSealObservations)(evidence);
    addLine('HUMAN-REVIEWABLE PACKAGE OBSERVATIONS', { bold: true, size: 12, gap: 5 });
    addLine(package_seal_protocol_1.HUMAN_REVIEW_DISCLAIMER, { gap: 8 });
    addLine('Seller reference', { bold: true });
    if (!observations.sellerReference.length)
        addLine('No seller packing video or high-resolution seal reference was present.');
    for (const item of observations.sellerReference) {
        addLine(`${item.type} — SHA-256 ${item.sha256 ?? 'not recorded'}; server time ${timestampIso(item.serverReceivedAt) ?? timestampIso(item.createdAt) ?? 'unknown'}`);
    }
    addLine('Buyer arrival', { bold: true });
    if (!observations.buyerArrival.length)
        addLine('No buyer arrival observation or unboxing video was present.');
    for (const item of observations.buyerArrival) {
        addLine(`${item.type} — SHA-256 ${item.sha256 ?? 'not recorded'}; server time ${timestampIso(item.serverReceivedAt) ?? timestampIso(item.createdAt) ?? 'unknown'}`);
    }
    if (observations.returnReference.length || observations.returnArrival.length) {
        addLine('Return observations', { bold: true });
        for (const item of [...observations.returnReference, ...observations.returnArrival]) {
            addLine(`${item.type} — SHA-256 ${item.sha256 ?? 'not recorded'}; server time ${timestampIso(item.serverReceivedAt) ?? timestampIso(item.createdAt) ?? 'unknown'}`);
        }
    }
    y -= 8;
    addLine('FINALIZED EVIDENCE', { bold: true, size: 12, gap: 5 });
    if (!evidence.length)
        addLine('No evidence files were present when this dossier was generated.');
    for (const item of evidence) {
        const serverReceived = timestampIso(item.serverReceivedAt) ?? timestampIso(item.createdAt) ?? item.capturedAt ?? 'Unknown time';
        addLine(`${item.type} — ${item.originalName}`, { bold: true });
        addLine(`Client-reported capture/start time: ${item.clientCreatedAt ?? 'NOT_RECORDED'}; source: CLIENT_OBSERVED_UNTRUSTED`);
        addLine(`Server received/finalized record time: ${serverReceived}; uploader role: ${item.role}; size: ${item.sizeBytes} bytes`);
        addLine(`File SHA-256: ${item.sha256}`);
        addLine(`Manifest SHA-256: ${item.manifestSha256 ?? 'Legacy evidence without manifest'}`);
        addLine(`Bundle SHA-256: ${item.evidenceBundleSha256 ?? 'Legacy evidence without bundle hash'}; binding: ${item.bundleBindingProfile ?? 'LEGACY_V1'}`);
        addLine(`Manifest authentication: ${item.manifestAuthentication?.algorithm ?? 'LEGACY_HMAC_OR_NOT_RECORDED'}; key: ${item.manifestAuthentication?.keyId ?? 'not recorded'}; scope: ${item.manifestAuthentication?.verificationScope ?? 'service verification only'}`);
        addLine(`App/device context: ${item.assurance?.appDeviceContext?.status ?? item.attestationStatus ?? 'NOT_RECORDED'}; device-key possession signature: ${String(item.deviceKeySignatureValid ?? 'not supplied')}; client-reported hardware signal: ${String(item.deviceKeyHardwareBackedSignal ?? item.deviceKeyHardwareBacked ?? 'not supplied')}`);
        addLine(`Byte integrity: ${item.assurance?.byteIntegrity?.status ?? (item.clientHashMatched === false ? 'MISMATCH' : 'SERVER_HASH_ONLY')}; client hash matched: ${String(item.clientHashMatched ?? 'not supplied')}; size matched: ${String(item.clientSizeMatched ?? 'not supplied')}; declared media type matched: ${String(item.contentTypeMatched ?? 'not supplied')}`);
        addLine(`Acquisition quality: ${item.assurance?.acquisitionQuality?.status ?? 'NOT_EVALUATED'}; physical correspondence: ${item.assurance?.physicalCorrespondence?.status ?? 'NOT_AVAILABLE'}; business/legal relevance: ${item.assurance?.businessLegalRelevance?.status ?? 'REVIEW_REQUIRED'}`);
        addLine(`Capture-time tracking context: ${item.carrierTrackingMatchStatus ?? 'NOT_SCANNED'}${item.scannedTrackingNumber ? `; barcode ${item.scannedTrackingNumber}` : ''}`);
        if (item.postSubmissionTrackingMatchStatus) {
            addLine(`Later submitted-tracking comparison: ${item.postSubmissionTrackingMatchStatus}${item.postSubmissionExpectedTrackingNumber ? `; submitted ${item.postSubmissionExpectedTrackingNumber}` : ''}; compared ${timestampIso(item.postSubmissionComparedAt) ?? 'after capture'}`, { gap: 6 });
        }
        else {
            addLine('Later submitted-tracking comparison: NOT_PERFORMED', { gap: 6 });
        }
    }
    if (returns.length) {
        addLine('SYMMETRIC RETURN PASSPORTS', { bold: true, size: 12, gap: 5 });
        for (const item of returns) {
            addLine(`${item.id ?? 'Return'} — ${item.status}`, { bold: true });
            addLine(`Requested by: ${item.initiatedBy}; returning participant: ${item.returningParticipantId ?? 'legacy requester'}; recipient: ${item.recipientId}; reason: ${item.reason}`);
            addLine(`Original evidence snapshot: ${(item.originalEvidenceHashes ?? []).length} hashes`);
            if (item.shipping)
                addLine(`Return shipping: ${item.shipping.carrier} ${item.shipping.trackingNumber}; repacking-label comparison: ${item.shipping.labelEvidenceMatchStatus ?? 'NOT_RECORDED'}`, { gap: 5 });
            else
                y -= 5;
        }
    }
    addLine('AUDIT TIMELINE', { bold: true, size: 12, gap: 5 });
    for (const item of events) {
        const created = timestampIso(item.createdAt) ?? 'Pending server time';
        addLine(`${created} — ${item.type}: ${item.summary}`);
    }
    pdf.setTitle(`PackProof ${transactionId}`);
    pdf.setSubject('Transaction evidence inventory, service-authenticated manifests, layered assurance and audit timeline');
    pdf.setCreator('PackProof');
    const bytes = await pdf.save();
    const reportId = options?.reportId ?? config_1.db.collection('transactions').doc(transactionId).collection('packets').doc().id;
    const storagePath = `reports/${transactionId}/${reportId}.pdf`;
    const digest = (0, node_crypto_1.createHash)('sha256').update(bytes).digest('hex');
    await config_1.storage.bucket().file(storagePath).save(Buffer.from(bytes), {
        contentType: 'application/pdf',
        resumable: false,
        metadata: { cacheControl: 'private, max-age=0, no-store', metadata: { transactionId, reportId, sha256: digest } },
    });
    await config_1.db.collection('transactions').doc(transactionId).collection('packets').doc(reportId).set({
        id: reportId,
        generatedBy,
        storagePath,
        sha256: digest,
        evidenceCount: evidence.length,
        sourceEvidenceBundleSha256s: evidence.map((item) => item.evidenceBundleSha256).filter((value) => typeof value === 'string'),
        transformation: {
            id: 'packproof-evidence-dossier-pdf',
            version: '2.1.0',
            source: 'SERVER_DERIVED',
            presentationOnly: true,
            originalsReplaced: false,
        },
        createdAt: firestore_1.FieldValue.serverTimestamp(),
    });
    await (0, helpers_1.appendEvent)(transactionId, generatedBy, 'PACKET_GENERATED', 'A presentation evidence dossier was generated from the retained originals and manifests.', { reportId, sha256: digest });
    return { reportId, storagePath, sha256: digest, evidenceCount: evidence.length };
}
exports.createEvidencePacket = (0, https_1.onCall)({ enforceAppCheck: true, timeoutSeconds: 180, memory: '1GiB' }, async (request) => {
    const uid = (0, helpers_1.requireUid)(request);
    const { transactionId } = validation_1.transactionIdSchema.parse(request.data);
    const { data } = await (0, helpers_1.getTransaction)(transactionId);
    (0, helpers_1.assertParticipant)(data, uid);
    return generateEvidencePacket(transactionId, uid);
});
exports.createPrivateDownloadUrl = (0, https_1.onCall)({ enforceAppCheck: true, invoker: 'public' }, async (request) => {
    const uid = (0, helpers_1.requireUid)(request);
    const storagePath = typeof request.data?.storagePath === 'string' ? request.data.storagePath : '';
    if (!storagePath || storagePath.length > 500 || storagePath.includes('\\') || storagePath.includes('..')) {
        throw new https_1.HttpsError('invalid-argument', 'A valid private object path is required.');
    }
    const transactionMatch = /^(?:evidence|manifests|reports)\/([^/]+)\//.exec(storagePath);
    const exportMatch = /^exports\/([^/]+)\/[^/]+\.json$/.exec(storagePath);
    if (transactionMatch) {
        const { data } = await (0, helpers_1.getTransaction)(transactionMatch[1]);
        (0, helpers_1.assertParticipant)(data, uid);
    }
    else if (exportMatch) {
        if (exportMatch[1] !== uid)
            throw new https_1.HttpsError('permission-denied', 'This export belongs to another account.');
    }
    else {
        throw new https_1.HttpsError('invalid-argument', 'This object class is not available through the private download endpoint.');
    }
    const file = config_1.storage.bucket().file(storagePath);
    const [exists] = await file.exists();
    if (!exists)
        throw new https_1.HttpsError('not-found', 'Private object not found.');
    const expiresAtMs = Date.now() + 5 * 60_000;
    const [url] = await file.getSignedUrl({ action: 'read', expires: expiresAtMs });
    return { url, expiresAt: new Date(expiresAtMs).toISOString() };
});
//# sourceMappingURL=evidence.js.map