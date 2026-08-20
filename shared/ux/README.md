# Shared PackProof UX rules

Pure TypeScript. No React, React Native, DOM, Expo, or Firebase.

`resolveNextRequiredAction()` is the Next Action Engine used by Android and the web portal. Presentation layers map the result to native camera routes or to a “Continue on phone” handoff. They must not reinterpret backend states such as `READY_TO_PACK` independently.

This folder is not an npm workspace package. Mobile re-exports from `src/lib/ux-flow.ts`. The portal imports `@packproof/ux` via Vite alias.
