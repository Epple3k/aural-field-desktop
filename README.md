# Aural Field Desktop

This is the desktop-app version of Aural Field.

It opens directly as one small movable window and is configured to stay **always on top**. There is no Chrome extension, launcher tab, FLOAT button, or Picture-in-Picture handoff.

The app uses Tauri 2, which wraps the existing HTML/CSS/JavaScript instrument in the operating system's WebView.

## What is already configured

- one Aural Field window
- `alwaysOnTop: true`
- resizable window with a safe minimum size
- starts centered at 380 × 520
- visible across workspaces
- Windows NSIS `.exe` installer target
- local settings persistence with `localStorage`
- working Web Audio play/pause engine
- same compact floating visual language
- GitHub Actions workflow that can build the Windows installer for you

## Easiest path: build the EXE with GitHub

1. Open the repo's **Actions** tab.
2. Choose **Build Aural Field for Windows**.
3. Click **Run workflow**.
4. When the run finishes, open it and download the `Aural-Field-Windows` artifact.
5. Unzip that artifact. It contains the Windows setup `.exe`.

This avoids installing Rust / Visual Studio build tools locally.

## Build locally on Windows

Tauri requires Microsoft's C++ build tools and WebView2 on Windows, plus Rust. WebView2 is normally already present on current Windows.

Install:
1. Visual Studio Build Tools with **Desktop development with C++**
2. Rust:
   `winget install --id Rustlang.Rustup`
3. Node.js LTS

Then double-click:

`BUILD_WINDOWS.bat`

The installer will end up under:

`src-tauri\target\release\bundle\nsis\`

## Development mode

From PowerShell in the project folder:

```powershell
npm install
npm run dev
```

## Important file

`src-tauri/tauri.conf.json`

The line:

```json
"alwaysOnTop": true
```

is the thing Chrome would not let the extension control. In the desktop app, it is a native window setting.
