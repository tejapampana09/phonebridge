# PhoneBridge Development Rules (Must Follow)

## Current Goal
Build a stable Phone Link alternative first. DO NOT add new major features until core features are stable.
Current priorities:
- Notification Reply
- Contacts Sync
- Call Reliability
- Bluetooth Call Audio
- File Transfer Reliability
- Settings
- Security Fixes
- Performance Optimization

## Features Frozen
The following feature is intentionally postponed:
- **Screen Mirroring** (causes instability and screen flickering, base64 frame transport is not production-ready).
- **Actions Required**:
  - Disable all mirroring UI.
  - Disable mirroring handlers.
  - Keep source files but do not modify them.
  - Mark feature as "Coming Soon".
  - Create future roadmap item for WebRTC mirroring.

## Electron Rules
- Electron remains the main application shell.
- DO NOT rewrite Electron or migrate to another framework.

## Native Windows Helper Strategy
- If Bluetooth call audio requires native access, create a `phonebridge-helper/` service (BluetoothService, AudioService, CallService).
- Electron communicates via IPC/localhost and remains the UI layer.

## Call System Priority
Focus:
- Outgoing Call Reliability
- Bluetooth Audio Routing
- Call State Synchronization
- Audio Device Selection
- Call UI Improvements

Do NOT redesign call architecture unless necessary.

## Security Requirements
- **Remove plaintext encryption fallback immediately.**
- **Rule**: If encryption fails, close connection, retry handshake, and never send plaintext data.

## Performance Requirements
- Implement pagination, incremental sync, database cleanup, and cache expiration.
- Avoid loading all SMS records, contacts, or photos at once.

## Development Priority Order
- **Phase 1**: Notification Reply, Contacts Sync, Clipboard, Device Status.
- **Phase 2**: Bluetooth Audio, Outgoing Calls, Call Reliability.
- **Phase 3**: File Transfer Improvements, Settings.
- **Phase 4**: Security Hardening, Performance Optimization.
- **Phase 5**: Native Helper (only if Bluetooth audio requires it).
- **Phase 6**: WebRTC Mirroring (future).

## Golden Rule
Stability > Features. Do not build AI, Gemini, Voice Assistant, Smart Summaries, or Mirroring until core is stable.
