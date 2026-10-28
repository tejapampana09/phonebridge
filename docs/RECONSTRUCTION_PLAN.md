# PhoneBridge v2 Reconstruction Plan

## Goal

Reconstruct PhoneBridge as a stable Android-to-Windows companion. Keep the existing Electron + React + TypeScript desktop shell and Kotlin Android companion where they are useful. Screen mirroring is out of scope and must remain disabled. No cloud dependency is required for local phone-to-PC features.

## Repository baseline

- Repository: https://github.com/tejapampana09/phonebridge
- Baseline branch: `main`
- Reconstruction branch: `reconstruction/v2`
- Baseline commit: `5d3db76d33865d3a0e4075d065acf2c160cb8819`
- Main components: `electron-app/`, `android-app/`, `phonebridge-native/`, and legacy `phonebridge-helper/helper.py`.

## Audit findings to resolve

1. **Calling/audio path is not a proven cellular HFP implementation.** `HfpManager` discovers the HFP service UUID and opens an RFCOMM socket, then reports success. This does not itself register Windows as the Bluetooth hands-free transport or prove that Windows routes cellular call audio. `CallAudioManager` separately copies audio between Windows endpoints with NAudio, which can create feedback/endpoint-selection problems and should not be treated as the source of cellular call audio.
2. **Multiple native-helper paths exist.** Electron's `HelperManager` expects `phonebridge-helper.exe` under `phonebridge-native`, while a separate `phonebridge-helper/helper.py` exists. Development and packaged paths need one explicit, testable strategy.
3. **IPC is duplicated.** Electron attempts localhost TCP on port 5050 and falls back to child-process stdin/stdout. The native helper exposes both interfaces, creating mismatched response shapes and correlation risks. Choose one protocol, validate request IDs, enforce timeouts, and fail closed.
4. **Transport/security policy is inconsistent.** WebSocket uses an ECDH/AES-GCM handshake, while Bluetooth RFCOMM messaging is a separate path without the same end-to-end handshake. The handshake must be authenticated and stateful; no plaintext fallback for ordinary messages.
5. **Protocol compatibility is implicit.** Message types and payload shapes are duplicated across Kotlin and TypeScript, and older handlers can disagree on names or acknowledgements. Add a documented versioned protocol and shared contract fixtures/tests.
6. **Call controls and call state are split.** Android telephony broadcasts and call-control methods provide state/actions, while Windows Bluetooth transport/audio is separate. Model call state explicitly and treat unsupported OEM/Android capabilities as capability failures, not false success.
7. **Screen mirroring code remains present.** The feature is frozen by project rules. Keep it out of the UI, command routing, permissions where safely removable, and normal startup paths. Do not expand or rewrite mirroring sources.
8. **Quality gates are missing/unclear.** Add repeatable build/type-check/test instructions and CI for the Electron and Android projects. Native Windows audio still requires manual hardware validation.

## Target architecture

- **Windows UI:** Electron + React remains the desktop shell.
- **Desktop application services:** typed IPC, connection lifecycle, settings, local persistence, notifications, call UI, contacts/SMS/files/clipboard.
- **Android companion:** Kotlin app owns permission-gated Android data access and telephony event reporting.
- **Data channel:** versioned WebSocket protocol for local-network sync, authenticated pairing and encryption; transport status and retries are explicit.
- **Cellular call audio:** Windows Bluetooth HFP/PhoneLineTransportDevice path, with Windows managing the HFP audio endpoint where supported. Do not implement cellular audio as arbitrary RFCOMM bytes or assume NAudio loopback can create the phone-call route.
- **Native helper:** one documented process/IPC boundary only if required; structured logs and health/status command.
- **Mirroring:** disabled and explicitly marked out of scope.

## Reconstruction phases

### Phase 0 — Safety and baseline
- Work only on `reconstruction/v2`; do not overwrite `main`.
- Capture current build status and preserve existing user data.
- Add tests/fixtures before protocol changes.
- Never log message bodies, phone numbers, keys, or other private content.

### Phase 1 — Core reliability
- Consolidate message contracts and acknowledgement semantics.
- Fix connection lifecycle, framing, timeouts, reconnect and request correlation.
- Remove plaintext fallbacks; if secure handshake fails, close the connection.
- Fix notification reply, contacts sync, clipboard sync and device status.
- Keep mirroring disabled.

### Phase 2 — Calling and HFP proof
- First implement a minimal Windows HFP transport probe using the supported Windows calling API and packaged-app requirements.
- Validate on the actual Windows build and Android handset: registration, connection, incoming/outgoing calls, two-way audio, device selection and sleep/resume.
- Only after that passes, connect the transport state to PhoneBridge call UI and call controls.
- If the Windows API cannot register on the target OS/build, surface a clear unsupported/error state rather than claiming audio is connected.

### Phase 3 — Files and persistence
- Correct transfer framing, path validation, chunk ordering, cancellation, integrity checks and acknowledgements.
- Add pagination/incremental sync and bounded caches.
- Preserve existing SQLite data with migrations; never clear data on a transient disconnect.

### Phase 4 — Release quality
- Build/test CI for Electron and Android; add native helper build checks where supported.
- Test packaged Windows builds, clean install/uninstall, startup, reconnect and graceful shutdown.
- Document known hardware/OS limitations and diagnostics collection.

## Acceptance criteria

- App opens reliably in development and packaged Windows builds.
- Pairing and encrypted sync work; ordinary messages are never sent plaintext.
- Notification replies, contacts, clipboard and file transfer have explicit success/failure acknowledgements.
- Incoming call UI and supported answer/decline/dial actions reflect real Android call state.
- Actual cellular call audio is accepted as complete only after a real call is tested in both directions through laptop microphone and speakers.
- Disconnect, sleep/resume and unsupported HFP registration are handled without hanging the UI.
- Screen mirroring cannot start through UI or protocol commands.
- Main branch remains unchanged until reconstruction is tested and reviewed.

## Licensing note

Third-party repositories may be used as architectural references. Do not copy source code into PhoneBridge until the specific license and redistribution obligations have been reviewed.
