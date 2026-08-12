# Google Play Data Safety worksheet

Use this as a drafting worksheet only. Play Console answers must reflect the exact production SDKs, provider settings, retention policy, regions and operational practices at submission time.

## Likely data disclosures

| Play category | Collected? | Shared? | Purpose | Required? | Deletable? |
|---|---:|---:|---|---:|---:|
| Name / display name | Yes | Transaction participant and service providers | Account, app functionality, fraud prevention | Yes | Yes |
| Email address | Sometimes, provider dependent | Identity/service providers | Account, support, deletion confirmation | No for some provider-only users | Yes |
| User IDs | Yes | Firebase, identity providers, RevenueCat | Account, security, entitlement | Yes | Yes |
| Photos and videos | Yes | Transaction participant, Firebase processors | Evidence functionality | Feature dependent | Yes, subject to disclosed retention/legal hold |
| Files and documents | Yes | Transaction participant, Firebase | Supporting evidence and exports | No | Yes |
| Precise location | Optional | Transaction participant and Firebase when enabled | User-requested evidence context, fraud prevention | No; off by default | Yes with evidence/deletion policy |
| Other user-generated content | Yes | Transaction participant; moderation staff/processors | Terms, item data, return reasons and reports | Yes for transactions | Yes/redacted as disclosed |
| Purchase history | Yes | Google Play and RevenueCat | Subscription processing and fraud prevention | No | Financial/legal retention may apply |
| App interactions | Yes | Firebase/operational providers | Workflow, security and support | Yes | Yes/redacted audit events |
| Device or other IDs | Yes | Firebase App Check, Expo notifications | Security, fraud prevention, notifications | Partly | Tokens revoked/deleted |
| Diagnostics / device metadata | Yes | Firebase processors | Integrity, reliability, fraud prevention | For camera evidence | Yes with evidence/deletion policy |

Camera-originated evidence metadata can include app/build identifiers, device model and OS, connection type, accelerometer/gyroscope aggregate statistics, camera-read shipping barcode, App Check/Play Integrity receipt data and a privacy-preserving HMAC derived from the ingress subnet. Raw motion samples and raw ingress IP addresses are not retained in the evidence manifest.

PackProof should answer that data is encrypted in transit and that users can request deletion. Do not claim independently audited security unless that audit is commissioned and maintained.

## Data not intentionally collected

- Contacts.
- Health, fitness, race, ethnicity, religious, political or sexual-orientation data.
- SMS/call logs.
- Full payment-card or bank-account details.
- Browsing/search history outside PackProof.
- Microphone audio except audio embedded in a user-initiated evidence video.

The privacy policy tells users not to place unrelated sensitive data in evidence. User misuse can still introduce it, so moderation, deletion and legal-hold procedures must cover accidental collection.

## Console preparation

1. Generate the production AAB and inspect Play SDK Index and permission warnings.
2. Declare camera, microphone and fine/coarse location accurately; explain that location is optional and capture-specific.
3. Confirm whether Expo, Firebase, RevenueCat, Meta or TikTok settings enable analytics or advertising. This template disables Meta advertiser-ID collection and automatic event logging.
4. List every production processor and internal retention period.
5. Confirm shared-record deletion/redaction, offline queue behavior, legal hold and billing retention with counsel.
6. Put the public privacy and deletion URLs in Play Console.
7. Re-answer this worksheet whenever an SDK, permission, telemetry field or processor changes.
