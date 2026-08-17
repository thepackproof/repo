# PackProof Enterprise console

The Enterprise console is a separate web control plane for PackProof Enterprise. It is not a set of Expo/mobile screens.

Operators may view:

- sites and packing stations
- Edge agent identity
- device and queue health
- WMS station mappings
- evidence exceptions
- audit records

Operators may not alter finalized evidence. Administrative overrides in `ASSIST` are audited. `ENFORCE` remains blocking.

```powershell
node apps/enterprise-console/src/main.mjs status
npm run test:enterprise
```

This entry is `SOURCE_CHECKED`. It is not a hosted production console, live WMS deployment, or customer `OBSERVE` pilot.

See [`docs/architecture/ENTERPRISE_ARCHITECTURE_CONTRACT_V1.md`](../../docs/architecture/ENTERPRISE_ARCHITECTURE_CONTRACT_V1.md).
