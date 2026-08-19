# PackProof consumer UX

Presentation-layer contract. **Do not change** evidence, authorization, state-transition, hashing, Passport, or API semantics to implement this.

## Goal

Make participating in a PackProof require so little thought that using it feels easier than not using it.

Evidence collection stays comprehensive. User participation stays minimal. Complexity is automated, combined, hidden, pre-populated, and sequenced — never stripped from the integrity layer.

## UX contract

- The software determines who needs to act, what they should do, whether they can do it yet, what is complete, and where to go next.
- One screen, one primary CTA.
- PackProof terminology is not prerequisite knowledge.
- Every tap, field, decision, permission, screen, wait, confirmation, and explanation must justify itself against the friction budget.

## Information architecture

Bottom navigation: **Home | PackProofs | Account**

Capture is an operation (`/capture/[id]`), not a tab.

- **Home** answers “What do I need to do?” — Needs your attention, then Waiting. No completed library.
- **PackProofs** is Active | Completed records. No competing workflow dashboard.
- **Account** stays settings. Research tooling is behind `featureFlags.researchMode`.

## Next Action Engine

Single source of truth: `resolveNextRequiredAction()` in `src/lib/ux-flow.ts`.

Screens must not independently interpret backend states such as `READY_TO_PACK`. The consumer sees an instruction (`Photograph the sealed package`) and one button (`Take photo`).

Home capture actions deep-link through `hrefForPrimaryAction()` straight into camera when the next job is packing, label, arrival, or unboxing.

## Active PackProof

Identity, step, instruction, one CTA, completed context, then quiet **View details**.

Details hold transaction, activity, evidence, optional extras, research (flagged), and export.

Completed PackProofs lead with **View Passport**. Information is useful after the operational job is gone.

## Creation

Manual create: Selling/Buying → item + price → share link. Extra fields stay collapsed. After create, go to invite.

Find my order is the create hub. Home plus and empty-state start open the imported-purchase list. Share-to-PackProof and Import a receipt feed the same intake service. Confirm only fields the parser could not establish. Mailbox OAuth remains later.

## Integrity boundary

```
USER EXPERIENCE
        ↓
NEXT ACTION ENGINE
        ↓
DOMAIN WORKFLOW
        ↓
EVIDENCE ACQUISITION
        ↓
INTEGRITY / MANIFEST / AUDIT
        ↓
PACKPROOF PASSPORT
```

UX simplification must never mean evidentiary simplification.
