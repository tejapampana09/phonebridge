# PhoneBridge 📱💻

> Microsoft Phone Link Clone — Local WiFi + Bluetooth, No Internet, No Cloud

## What It Does

Connects your Android phone to your Windows PC over your local network. No Firebase, no internet, no subscriptions.

```
Android Phone  ◄──── WiFi (WebSocket) ────►  Windows PC (EXE)
               ◄──── Bluetooth (RFCOMM) ──►  (fallback)
```

## Features

| Feature | Status |
|---------|--------|
| QR code pairing | ✅ |
| Notifications on PC | ✅ |
| Call history | ✅ |
| Incoming call popup | ✅ |
| SMS inbox on PC | ✅ |
| Reply SMS from PC | ✅ |
| Battery / network status | ✅ |
| Photos metadata | ✅ |
| Windows toast notifications | ✅ |
| System tray | ✅ |
| Bluetooth fallback | ✅ |
| Local SQLite storage | ✅ |
| Auto-reconnect | ✅ |

## Project Structure

```
phonebridge/
├── electron-app/    ← Windows EXE (Electron + React + TypeScript)
└── android-app/     ← Android APK (Kotlin + Jetpack Compose)
```

## Quick Start

### Windows PC (EXE)

```powershell
cd phonebridge\electron-app
npm install
npm run dev          # Development mode
npm run dist         # Build EXE installer
```

EXE output: `electron-app\dist\PhoneBridge-Setup.exe`

### Android Phone (APK)

```powershell
cd phonebridge\android-app
$env:JAVA_HOME = "C:\Program Files\Android\Android Studio\jbr"
$env:PATH = "$env:JAVA_HOME\bin;$env:PATH"
.\gradlew.bat assembleDebug
```

APK output: `android-app\app\build\outputs\apk\debug\app-debug.apk`

## Pairing Instructions

1. Launch **PhoneBridge** on Windows PC
2. A QR code screen appears with your local IP
3. Install APK on Android phone
4. Open PhoneBridge on phone → tap **Scan QR**
5. Point at the QR code on PC screen
6. ✅ Connected! Data starts syncing automatically

## Android Setup (Required After Install)

1. Grant all permissions when prompted
2. Enable Notification Access:  
   `Settings → Apps → Special app access → Notification access → PhoneBridge → Allow`
3. The app will connect automatically

## Connection Methods

| Method | When Used | Speed |
|--------|-----------|-------|
| WiFi (WebSocket) | Primary — same network | ~1ms |
| Bluetooth (RFCOMM) | Fallback — different networks | ~10ms |

## Message Protocol

```json
Phone → PC: NOTIFICATION, CALL_INCOMING, CALL_UPDATE, CALL_HISTORY,
            SMS_RECEIVED, SMS_HISTORY, PHOTO_METADATA, DEVICE_STATUS, PONG

PC → Phone: SEND_SMS, DISMISS_NOTIFICATION, PING, REQUEST_SYNC, CONNECT_ACK
```

## Tech Stack

- **Windows**: Electron 28 + React 18 + TypeScript + Vite + TailwindCSS
- **Android**: Kotlin + Jetpack Compose + OkHttp + CameraX + ML Kit
- **Communication**: WebSocket (WiFi) + RFCOMM Bluetooth
- **Storage**: SQLite (local, no cloud)
- **No internet required**

## Permissions (Android)

| Permission | Purpose |
|-----------|---------|
| READ_CONTACTS | Look up caller/SMS sender names |
| READ_CALL_LOG | Sync call history |
| READ_PHONE_STATE | Detect incoming calls |
| RECEIVE_SMS, READ_SMS | Sync SMS inbox |
| SEND_SMS | Reply to SMS from PC |
| READ_MEDIA_IMAGES | Sync photo metadata |
| CAMERA | QR code scanning |
| FOREGROUND_SERVICE | Keep connection alive |
| RECEIVE_BOOT_COMPLETED | Auto-connect on reboot |
| BIND_NOTIFICATION_LISTENER_SERVICE | Mirror notifications to PC |
| BLUETOOTH_CONNECT / BLUETOOTH_SCAN | Bluetooth fallback |
