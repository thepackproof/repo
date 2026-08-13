# Physical correspondence — validation-gated architecture

PackProof 0.8.5.0 includes the acquisition and evidence architecture required to research the whitepaper's proposed stochastic physical correspondence layer. It does **not** claim that the physical matcher has been scientifically validated, and the production API intentionally returns no similarity score or match decision until a frozen matcher and threshold policy pass the specified validation program.

## Capture profile `PP-PHYSICAL-MATTE-V1`

The initial research profile is deliberately narrow: matte/low-gloss paper labels on ordinary paperboard/cardboard. It acquires three full-quality original JPEG frames from each of five required regions:

1. `LABEL_IDENTIFIER` — identifier/print/handwriting region.
2. `INK_EDGE_A` — first ink/toner-to-label transition.
3. `INK_EDGE_B` — second independent ink/toner-to-label transition.
4. `LABEL_BOX_BOUNDARY` — label-to-cardboard boundary bridge.
5. `ADJACENT_CARDBOARD` — local package substrate context.

The result is 15 independently hashed evidence objects. Each frame carries the profile/version, quality policy, intent (`REFERENCE` or `VERIFICATION`), capture group, region, frame index, acquisition attempt and original image dimensions. Android also computes versioned measurement signals from a bounded down-sampled decode: luminance mean/dispersion, 5th/95th-percentile luminance, shadow/highlight clipping fractions and Laplacian variance as a focus/sharpness proxy. These values are retained as `MEASUREMENT_SIGNAL_ONLY_THRESHOLDS_NOT_VALIDATED`; they are research inputs, not proof that a frame is usable. Client gating currently establishes only a minimum image-dimension condition. Validated focus, glare, perspective, lens coverage/obscuration, compression, material eligibility and out-of-distribution thresholds remain future validation work, so the manifest truthfully reports acquisition quality as `NOT_EVALUATED`.

## Enrollment boundary

The app offers seller reference acquisition while the shipped transaction is `TERMS_LOCKED` or `PACKED`, and buyer verification acquisition in `SHIPPED`, `BUYER_REVIEW` or `DISPUTED`. Server authorization binds reference frames to the seller and verification frames to the buyer. Because an encrypted offline capture may legitimately synchronize after a later transaction-state change, the backend does not treat upload time as capture time. The comparison service uses the earliest complete reference group so a later questioned package cannot silently replace the evidentiary foundation.

Online 15-frame sessions use one fresh App Check capture session bound to the capture profile, capture group and maximum evidence count. Every frame still receives its own fixed request fingerprint, pending upload ID and exact Storage path. Offline capture remains explicitly `OFFLINE_UNATTESTED`.

## Current decision behavior

`getPhysicalCorrespondenceStatus` exposes only:

- `NOT_EVALUATED` when a required reference or verification set does not yet exist;
- `FTA` when the relevant acquisition set is incomplete under the profile;
- `INCONCLUSIVE / MATCHER_NOT_YET_VALIDATED` after complete reference and verification sets are present.

`MATCH` and `NON_MATCH` are reserved schema states, not currently produced. `modelVersion`, `thresholdPolicyVersion` and `score` remain null. This prevents acquisition success from being misrepresented as scientific source correspondence.

## Work required before enabling scores

A future matcher release must freeze region eligibility, registration, quality gates, extractor/model artifact hash, patch aggregation, device/substrate calibration strata and two-threshold decision policy before opening an independently controlled blind test. The release report must include FMR, FNMR, FTA, inconclusive rate, attack success, package-level independence, subgroup results and appropriate confidence bounds. Print/scan, display replay, transplant, deliberate damage and adaptive attacks are separate test populations.

Use `npm run validate:physical -- <dataset.json>` for the repository validation-analysis scaffold. It warns when the model/threshold policy is not frozen, when the dataset is not marked blind, and when repeated observations share independent physical units.
