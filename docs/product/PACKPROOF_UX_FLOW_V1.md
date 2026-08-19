# PackProof UX Flow v1

Presentation-layer specification. **Do not change** evidence, authorization, state-transition, hashing, Passport, or API semantics to implement this.

## Design standard

At any moment a user should answer three questions in about two seconds:

1. What is happening?
2. What am I supposed to do?
3. What happens next?

Users never navigate the backend state machine (`TERMS_REVIEW`, `TERMS_LOCKED`, `PACKED`, …) directly. Screens consume `resolveNextRequiredAction()` in `src/lib/ux-flow.ts` — the single UX source of truth.

## Mental model

Create transaction → agree on what is being sent → record it being packed → ship it → optionally record receipt/return → Passport.

## Next Required Action

**Input:** transaction state, participant role, evidence/protocol state, pending participant actions, return state, shipment state, optional evidence-processing phase.

**Output:** headline, description, instruction, `actionRequiredBy`, primary/secondary action, progress stage, waiting reason, notification copy, inbox bucket.

Each screen presents **one action** or explicitly says **no action required from you**. Waiting is a first-class state (who, what they must do, what happens after, optional remind/share). Never show an unexplained disabled button.

## Inbox buckets

Needs your attention → Waiting on someone else → In progress → Completed.

## Role-aware copy

The same backend state is a different sentence for seller vs buyer. Notification title/body must match the in-app headline the deep link opens onto.

## Forbidden on primary surfaces

Technical IDs, backend enums as badges, multiple equally prominent CTAs, capture chrome unrelated to the current instruction, generic vanishing toasts, unexplained Pro chrome.
