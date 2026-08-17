# PackProof Enterprise packages

Target layout after a later extraction checkpoint:

```text
apps/mobile            existing Expo application (not moved in this slice)
apps/enterprise-console
apps/edge-agent        OS-service entry (activated)
apps/enterprise-console  operator console entry (activated; not a hosted production console)

packages/evidence-contracts
packages/enterprise-domain
packages/hardware-adapters
packages/edge-protocol
packages/api-client
```

Current activation keeps the executable Enterprise domain, Edge protocol, adapters, queue, and station runtime in `functions/src/domain/v1` and `functions/src/edge/v1` so the existing Functions TypeScript package remains the single Node 22 compile unit. Extraction must not change protocol semantics.

The Expo application is not a workspace root for Enterprise packages; adding npm workspaces here would risk Metro/Expo hoisting. Do not relocate `src/` until a dedicated mechanical checkpoint.
