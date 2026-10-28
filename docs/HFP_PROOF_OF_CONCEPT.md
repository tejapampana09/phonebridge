# Bluetooth Cellular Call Audio Proof of Concept

This spike is deliberately separate from the PhoneBridge UI. It must prove the platform audio path before existing call screens are connected to it.

## Why the current helper is not a proof

The current `HfpManager.ConnectHfpAsync` checks for Bluetooth RFCOMM service UUID `0000111f-0000-1000-8000-00805f9b34fb` and opens a `StreamSocket`. A successful RFCOMM connection is not proof that Windows registered a hands-free transport or routed cellular call audio.

The current `CallAudioManager` copies audio between Windows audio endpoints using NAudio. Endpoint copying alone cannot make the phone's cellular call audio appear on a PC endpoint. Do not report "call audio connected" merely because these methods return successfully.

## Required platform path

Investigate Windows `Windows.ApplicationModel.Calls.PhoneLineTransportDevice` and its `RequestAccessAsync`, `RegisterApp`, `IsRegistered`, and `ConnectAsync` flow. This API may require an MSIX package identity and the restricted `phoneLineTransportManagement` capability. A normal unpackaged console helper is not an adequate test of the supported app-registration path.

Official API reference: https://learn.microsoft.com/en-us/uwp/api/windows.applicationmodel.calls.phonelinetransportdevice

## Preflight details to record

On the test PC, record:
- Windows edition, version and OS build (`winver`).
- .NET SDK version (`dotnet --info`).
- Bluetooth adapter model and driver version (Device Manager).
- Phone manufacturer/model, Android version and security update.
- Whether the phone is paired in Windows Bluetooth settings and whether the Windows hands-free audio profile is available.
- Whether Windows Phone Link can complete a cellular call using the PC microphone and speakers on the same hardware.

Do not collect phone numbers, call contents, cryptographic keys or other private data in diagnostics.

## Go/no-go procedure

1. Pair the Android phone with Windows in Settings. Ensure it is not simultaneously connected to another call headset.
2. Build and install a minimal MSIX diagnostic app with package identity and the documented capability, using only the permissions and package configuration needed for this API.
3. Enumerate the phone's `PhoneLineTransportDevice` using the documented selector.
4. Request access. Log the returned status.
5. Call `RegisterApp()`; immediately check `IsRegistered()`. A non-throwing call is not success unless the registered state is true.
6. Call `ConnectAsync()` and log the returned result and exceptions.
7. Verify Windows exposes/activates the hands-free communication audio path.
8. Make a real cellular call. Confirm remote party hears the laptop microphone and local user hears the remote party through laptop speakers. Test both incoming and outgoing calls.
9. Repeat after Bluetooth disconnect/reconnect and Windows sleep/resume.
10. Save only anonymized status codes, HRESULTs, OS build and pass/fail results.

### Pass criteria

- Registration returns true through the supported packaged app path.
- Connection succeeds and the Windows hands-free route is available.
- A real cellular call has bidirectional audio through the selected PC mic and speaker.
- Disconnect and sleep/resume failures are reported accurately and recovery is tested.

### Fail criteria

Any of the following is a no-go for integrating the audio UI:
- `IsRegistered()` remains false after registration.
- `ConnectAsync()` fails or returns false.
- HFP appears paired but no call audio is routed to the PC.
- Only one audio direction works.
- The helper reports success without verifying the actual transport/audio state.

If the API fails on the target Windows build, record the exact OS build, result and HRESULT first. Do not silently fall back to raw RFCOMM or NAudio endpoint copying and label it cellular call audio. Assess another supported OS/build or a driver-level implementation as a separate project.

## Integration contract

Only after the pass criteria are met should PhoneBridge expose:
- `GET_CALL_AUDIO_STATUS`
- `CONNECT_CALL_AUDIO`
- `DISCONNECT_CALL_AUDIO`
- `CALL_AUDIO_STATUS_CHANGED`

Status must distinguish `unsupported`, `not-paired`, `registration-failed`, `connecting`, `connected-no-call`, `in-call-audio-active`, and `reconnecting`. A connected Bluetooth device alone must never mean `in-call-audio-active`.

## Current state

- Existing RFCOMM discovery/connect code: diagnostic only, not proof of HFP call routing.
- Existing NAudio endpoint-copying code: not accepted as the cellular audio transport.
- Hardware test: pending; cannot be claimed passed from repository inspection alone.
