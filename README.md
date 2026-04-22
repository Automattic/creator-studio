# creators-studio

Desktop chat app (Electron + React + TypeScript). Step 1: minimal macOS shell — titlebar, empty transcript, composer textarea + Send button. Submit is a no-op.

## Dev setup

```
npm install
npm start          # launches Electron with Vite HMR
npm test           # packages the app, runs Playwright E2E
```

`npm test` runs `tests/e2e/shell.spec.ts`, which launches the real packaged Electron app and asserts the UI layout, drag regions, interactivity, and no-op submit.

Release builds use Forge's hardened fuses by default. `npm test` relaxes `EnableNodeCliInspectArguments` via `TEST_BUILD=1` so Playwright can attach its debugger. Do not set `TEST_BUILD` when packaging for distribution.
