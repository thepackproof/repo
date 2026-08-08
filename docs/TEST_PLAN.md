# PackProof release test plan

Run on the preview Firebase project first and again from the signed Play internal-test build against production configuration.

## Test identities

- Seller A: Google sign-in.
- Buyer B: Facebook sign-in.
- Outsider C: TikTok sign-in.
- A separate Google Play license-tester account for purchases.

Never test deletion using the only owner/admin identity.

## Acceptance matrix

| Area | Test | Expected result |
|---|---|---|
| Identity | First sign-in with each provider | One PackProof user/profile is created; no password is requested by PackProof |
| Linking | Link Google, Facebook and TikTok to Seller A | All show Linked; subsequent provider sign-in returns the same PackProof UID |
| Collision | Attempt to link Seller A’s TikTok to Buyer B | Rejected without changing either account |
| Invite | Seller creates invite; Buyer redeems once | Buyer joins and transaction enters terms review |
| Replay | Outsider reuses redeemed/expired invite | Rejected without exposing transaction data |
| Terms | One participant confirms | Still in terms review; exact record remains readable |
| Terms | Both confirm | Terms lock and cannot be client-edited |
| Evidence | Seller records packing video | No pause/edit UI; queue encrypts first; verified record later shows file, manifest and bundle SHA-256 plus attestation status |
| Evidence | Retry/overwrite same authorized path | Overwrite is denied; no duplicate metadata event |
| Shipping | Add tracking before packing video | Rejected by backend |
| Shipping | Add valid tracking after packing | Transaction becomes shipped and Buyer receives notification |
| Receipt | Buyer records unboxing | Transaction enters buyer review |
| Completion | Both confirm completion | Transaction becomes completed |
| Local handoff | Both independently confirm after terms lock | No shipping step is requested; transaction enters buyer review only after both confirmations |
| Packet | Generate/open PDF | PDF contains item, terms, hashes and audit timeline; only participants can open it |
| Isolation | Outsider queries transaction/file URL | Permission denied; no metadata leak |
| Moderation | Report participant and block | Concern freezes normal flow; future invite between blocked identities is rejected |
| Billing | Buy each Pro plan | Google sheet displays real price; RevenueCat entitlement and backend plan become PRO |
| Billing | Restore on clean install | Pro unlocks for same Play/PackProof account |
| Billing | Expire/cancel test subscription | Backend returns to FREE only after entitlement expiration |
| Export | Request/open account export | Private JSON export is readable only by owner |
| Deletion | Schedule in app after reauth | Account signs out; deletion can be cancelled within seven days |
| Web deletion | Request, confirm email link | Generic request response; valid token schedules the matching account |
| TikTok web deletion | Continue with linked TikTok outside app | Valid OAuth state schedules only the linked account and reveals no account existence |
| Purge | Run scheduled purge on a disposable due account | Auth/profile/evidence removed; shared events are redacted as documented |
| Offline queue | Capture in airplane mode | Capture encrypts and survives navigation/process restart; record is marked offline-unattested and syncs after reconnect |
| Interrupted upload | Disable network during transfer | Encrypted item remains queued; reconnect reissues the same immutable attested upload path/grant and resumes without duplicate evidence |
| JIT attestation | Let app sit idle, then tap Record | App refreshes App Check, receives nonce, signs it and server classifies accepted evidence correctly |
| Sensor telemetry | Handheld and tripod captures | Both are accepted; manifest reports conservative assessment and never auto-labels fraud |
| Location | Capture once off and once opted in | First manifest has null location; second contains permission-marked coordinates/accuracy |
| Barcode | Scan matching and mismatching label barcodes | Manifest records scanner observation; Connect context is compared at capture, while standard/return tracking entered later creates a separate post-submission MATCHED or MISMATCH audit result and mismatch is flagged |
| Return Passport | Request, authorize, repack, ship, unbox, complete | Original hashes snapshot; return evidence is isolated and both confirmations complete the passport |
| Connect | Create order twice with same idempotency payload | First returns 201; replay returns same session with 200; changed payload returns 409 |
| Connect handoff | Open universal URL and sign in | Token redeems once, order context is locked and packing route opens pre-populated |
| Connect callback | Verify a packing video | One signed callback is delivered; raw-body HMAC verifies; failed endpoint retries without duplicate dossier event |
| Offline/error | Disable network during non-capture form action | Clear recoverable error; no false success or corrupt record |
| Accessibility | Large text, TalkBack and contrast pass | Critical labels/buttons remain understandable and operable |

## Abuse tests

- Submit empty, overlong and wrong-type values to every callable function.
- Call functions with no auth and with a valid auth token but no App Check token.
- Request hundreds of pending uploads, capture sessions, Connect orders and deletion emails; confirm quotas/alerts and throttling behavior.
- Upload an executable renamed as an image and document the current behavior; arbitrary document support must not launch without content scanning.
- Send invalid, duplicated and out-of-order RevenueCat events; only the first valid event affects state.
- Put HTML/script strings in title, terms, callback fields and report details; verify all app/PDF/web output treats them as text.
- Point Connect callbacks at localhost, RFC1918, link-local, documentation and mixed public/private DNS answers; all must be rejected.
- Replay a callback outside the allowed timestamp window or with a reserialized JSON body; SDK verification must fail.
- Corrupt a queued PPQ1 header or AES-GCM ciphertext; decryption must fail without uploading or deleting the queue record.

## Evidence packet verification

For at least one completed transaction:

1. Download every evidence file and the generated PDF.
2. Compute SHA-256 locally: `shasum -a 256 FILE` (macOS) or `certutil -hashfile FILE SHA256` (Windows).
3. Confirm each value exactly matches the app/PDF.
4. Modify one byte in a copy and verify its fingerprint changes.
5. Keep the originals unchanged; this test demonstrates byte integrity, not truth or legal admissibility.


## Forensic manifest verification

For at least one JIT-attested packing video:

1. Download the evidence file and its private manifest as a participant.
2. Recompute the file SHA-256 and canonical manifest SHA-256 using an internal verification utility that implements the same canonical JSON rules.
3. Confirm `evidenceBundleSha256` equals SHA-256 of `<file hash>\n<manifest hash>`.
4. In a controlled backend test environment, recompute the HMAC with the active secret version and compare in constant time. Never expose the secret to the mobile app or marketplace.
5. Confirm capture start is inside the original server attestation window, the nonce receipt is consumed once, and the ECDSA signature verifies against the stored SPKI public key.
