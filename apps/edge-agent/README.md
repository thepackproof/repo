# PackProof Edge™

PackProof Edge is the warehouse acquisition daemon for PackProof Enterprise. It turns existing cameras, scanners, scales, and WMS events into bounded observations and encrypted artifacts. It does **not** finalize evidence.

The executable Edge library currently compiles with the Functions TypeScript package (`functions/src/edge/v1`) so one Node 22 toolchain owns the `SOURCE_CHECKED` gate. This directory is the OS-service entry:

- Windows Service on packing-station PCs
- systemd service on Linux appliances

Start this process independently of a browser and independently of the Expo mobile app.

```powershell
node apps/edge-agent/src/main.mjs status
npm run test:enterprise
```

Simulated HID/serial/UVC/RTSP adapters are valid source tests. They are not live-hardware proof.

See [`docs/architecture/ENTERPRISE_ARCHITECTURE_CONTRACT_V1.md`](../../docs/architecture/ENTERPRISE_ARCHITECTURE_CONTRACT_V1.md).
