# HC-1 disaster recovery

Documented, not drilled on this SHA.

1. Freeze deploys.
2. Restore the last accepted Functions revision and rules SHA from [`../releases/release-manifest.hc1.json`](../releases/release-manifest.hc1.json).
3. Replay pending evidence finalization. Incomplete objects must not be marked FINALIZED.
4. Rotate compromised keys by adding a new keyId. Keep historical verification policy.

Live Firestore, Storage, region, and credential drills remain owner-operated.
