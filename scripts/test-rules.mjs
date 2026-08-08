import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, Timestamp } from 'firebase/firestore';
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
    await setDoc(doc(db, 'transactions', 'tx-security-001'), { sellerId: 'alice', buyerId: 'bob', participantIds: ['alice', 'bob'], status: 'TERMS_LOCKED' });
    await setDoc(doc(db, 'transactions', 'tx-security-001', 'evidence', 'upload001'), { uploaderId: 'alice', storagePath: 'evidence/tx-security-001/alice/upload001' });
    await setDoc(doc(db, 'pendingUploads', 'upload001'), { uploaderId: 'alice', transactionId: 'tx-security-001', storagePath: 'evidence/tx-security-001/alice/upload001', contentType: 'image/jpeg', expiresAt: Timestamp.fromMillis(Date.now() + 60_000) });
    await setDoc(doc(db, 'pendingUploads', 'upload002'), { uploaderId: 'alice', transactionId: 'tx-security-001', storagePath: 'evidence/tx-security-001/alice/upload002', contentType: 'application/pdf', expiresAt: Timestamp.fromMillis(Date.now() + 60_000) });
    await setDoc(doc(db, 'pendingUploads', 'upload003'), { uploaderId: 'alice', transactionId: 'tx-security-001', storagePath: 'evidence/tx-security-001/alice/upload003', contentType: 'image/jpeg', expiresAt: Timestamp.fromMillis(Date.now() - 60_000) });
    await setDoc(doc(db, 'publicProfiles', 'alice'), { uid: 'alice', displayName: 'Alice' });
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
  await assertSucceeds(getDoc(doc(alice.firestore(), 'publicProfiles', 'alice')));
  await assertFails(getDoc(doc(guest.firestore(), 'publicProfiles', 'alice')));

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
