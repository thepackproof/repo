import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { collection, doc, getDoc, getDocs, orderBy, query, setDoc, Timestamp, where } from 'firebase/firestore';
import { ref, uploadBytes, getBytes } from 'firebase/storage';

const projectId = 'packproof-rules-test';
const testEnv = await initializeTestEnvironment({
  projectId,
  firestore: { rules: readFileSync('firestore.rules', 'utf8'), host: '127.0.0.1', port: 8080 },
  storage: { rules: readFileSync('storage.rules', 'utf8'), host: '127.0.0.1', port: 9199 },
});

try {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, 'transactions', 'tx-security-001'), { sellerId: 'alice', buyerId: 'bob', participantIds: ['alice', 'bob'], status: 'TERMS_LOCKED', updatedAt: Timestamp.fromMillis(Date.now()) });
    await setDoc(doc(db, 'transactions', 'tx-security-001', 'evidence', 'upload001'), { uploaderId: 'alice', storagePath: 'evidence/tx-security-001/alice/upload001' });
    await setDoc(doc(db, 'pendingUploads', 'upload001'), { uploaderId: 'alice', transactionId: 'tx-security-001', storagePath: 'evidence/tx-security-001/alice/upload001', contentType: 'image/jpeg', expiresAt: Timestamp.fromMillis(Date.now() + 60_000) });
    await setDoc(doc(db, 'pendingUploads', 'upload002'), { uploaderId: 'alice', transactionId: 'tx-security-001', storagePath: 'evidence/tx-security-001/alice/upload002', contentType: 'application/pdf', expiresAt: Timestamp.fromMillis(Date.now() + 60_000) });
    await setDoc(doc(db, 'pendingUploads', 'upload003'), { uploaderId: 'alice', transactionId: 'tx-security-001', storagePath: 'evidence/tx-security-001/alice/upload003', contentType: 'image/jpeg', expiresAt: Timestamp.fromMillis(Date.now() - 60_000) });
    await setDoc(doc(db, 'publicProfiles', 'alice'), { uid: 'alice', displayName: 'Alice' });
    await setDoc(doc(db, 'commerceContexts', 'ctx-security-001'), { integrationId: 'integration-1', status: 'ORDER_BOUND' });
    await setDoc(doc(db, 'passportDrafts', 'draft-security-001'), { commerceContextId: 'ctx-security-001', status: 'READY_FOR_REVIEW' });
    await setDoc(doc(db, 'publicCommerceHandoffs', 'hnd-security-001'), { commerceContextId: 'ctx-security-001', status: 'PENDING_CLAIM' });
    await setDoc(doc(db, 'participantClaims', 'claim-security-001'), { transactionId: 'txn-security-001', status: 'ISSUED' });
    await setDoc(doc(db, 'evidenceSessions', 'es-security-001'), { transactionId: 'txn-security-001', status: 'READY' });
    await setDoc(doc(db, 'domainOutbox', 'evt-security-001'), { type: 'TRANSACTION_CREATED', deliveryState: 'PENDING' });
    await setDoc(doc(db, 'webhookDeliveries', 'delivery-security-001'), { targetUrl: 'https://example.com', state: 'PENDING', nextAttemptAt: Timestamp.fromMillis(Date.now() - 60_000), attemptCount: 0 });
    await setDoc(doc(db, 'apiIdempotencyRecords', 'idem-security-001'), { state: 'COMPLETE', createdAt: Timestamp.fromMillis(Date.now() - 60000) });
  });

  const alice = testEnv.authenticatedContext('alice');
  const bob = testEnv.authenticatedContext('bob');
  const eve = testEnv.authenticatedContext('eve');
  const guest = testEnv.unauthenticatedContext();

  await assertSucceeds(getDoc(doc(alice.firestore(), 'transactions', 'tx-security-001')));
  await assertSucceeds(getDoc(doc(bob.firestore(), 'transactions', 'tx-security-001')));
  await assertFails(getDoc(doc(eve.firestore(), 'transactions', 'tx-security-001')));
  await assertFails(setDoc(doc(alice.firestore(), 'transactions', 'tx-security-001'), { title: 'tampered' }, { merge: true }));
  await assertSucceeds(getDoc(doc(alice.firestore(), 'transactions', 'tx-security-001', 'evidence', 'upload001')));
  await assertFails(getDoc(doc(eve.firestore(), 'transactions', 'tx-security-001', 'evidence', 'upload001')));

  const aliceTransactionQuery = query(
    collection(alice.firestore(), 'transactions'),
    where('participantIds', 'array-contains', 'alice'),
    orderBy('updatedAt', 'desc'),
  );
  await assertSucceeds(getDocs(aliceTransactionQuery));

  const eveTransactionQuery = query(
    collection(eve.firestore(), 'transactions'),
    where('participantIds', 'array-contains', 'alice'),
    orderBy('updatedAt', 'desc'),
  );
  await assertFails(getDocs(eveTransactionQuery));
  await assertFails(getDoc(doc(eve.firestore(), 'transactions', 'tx-security-001', 'evidence', 'upload001')));
  await assertSucceeds(getDoc(doc(alice.firestore(), 'publicProfiles', 'alice')));
  await assertFails(getDoc(doc(guest.firestore(), 'publicProfiles', 'alice')));
  await assertFails(getDoc(doc(alice.firestore(), 'commerceContexts', 'ctx-security-001')));
  await assertFails(setDoc(doc(alice.firestore(), 'commerceContexts', 'ctx-security-001'), { status: 'REVOKED' }, { merge: true }));
  await assertFails(getDoc(doc(alice.firestore(), 'passportDrafts', 'draft-security-001')));
  await assertFails(getDoc(doc(alice.firestore(), 'webhookDeliveries', 'delivery-security-001')));
  await assertFails(getDoc(doc(alice.firestore(), 'apiIdempotencyRecords', 'idem-security-001')));
  await assertFails(setDoc(doc(alice.firestore(), 'passportDrafts', 'draft-security-001'), { status: 'BOUND' }, { merge: true }));
  await assertFails(getDoc(doc(alice.firestore(), 'publicCommerceHandoffs', 'hnd-security-001')));
  await assertFails(setDoc(doc(alice.firestore(), 'publicCommerceHandoffs', 'hnd-security-001'), { status: 'CLAIMED' }, { merge: true }));
  await assertFails(getDoc(doc(alice.firestore(), 'participantClaims', 'claim-security-001')));
  await assertFails(setDoc(doc(alice.firestore(), 'participantClaims', 'claim-security-001'), { status: 'CLAIMED' }, { merge: true }));
  await assertFails(getDoc(doc(alice.firestore(), 'evidenceSessions', 'es-security-001')));
  await assertFails(setDoc(doc(alice.firestore(), 'evidenceSessions', 'es-security-001'), { status: 'CAPTURING' }, { merge: true }));
  await assertFails(getDoc(doc(alice.firestore(), 'domainOutbox', 'evt-security-001')));
  await assertFails(setDoc(doc(alice.firestore(), 'domainOutbox', 'evt-security-001'), { deliveryState: 'DELIVERED' }, { merge: true }));

  const payload = new Uint8Array([1, 2, 3, 4]);
  const uploadRef = ref(alice.storage(), 'evidence/tx-security-001/alice/upload001');
  await assertSucceeds(uploadBytes(uploadRef, payload, { contentType: 'image/jpeg' }));
  await assertFails(uploadBytes(uploadRef, payload, { contentType: 'image/jpeg' }));
  await assertFails(uploadBytes(ref(bob.storage(), 'evidence/tx-security-001/alice/upload001'), payload, { contentType: 'image/jpeg' }));
  await assertFails(uploadBytes(ref(alice.storage(), 'evidence/tx-security-001/alice/upload002'), payload, { contentType: 'image/jpeg' }));
  await assertFails(uploadBytes(ref(alice.storage(), 'evidence/tx-security-001/alice/upload003'), payload, { contentType: 'image/jpeg' }));
  await assertSucceeds(getBytes(ref(bob.storage(), 'evidence/tx-security-001/alice/upload001')));
  await assertFails(getBytes(ref(eve.storage(), 'evidence/tx-security-001/alice/upload001')));

  process.stdout.write('PackProof Firestore and Storage security-rule tests passed.\n');
} finally {
  await testEnv.cleanup();
}
