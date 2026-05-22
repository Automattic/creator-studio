# Studio Write

Desktop chat app (Electron + React + TypeScript). macOS shell with a titlebar, transcript, and composer. Submitting a message calls the Claude Agent SDK and streams the response back into the transcript.

## Dev setup

Create a `.env` file in the project root with your Anthropic API key and at
least one trusted project folder Claude is allowed to work inside:

```
ANTHROPIC_API_KEY=sk-ant-...
STUDIO_WRITE_PROJECTS=/abs/path/to/project[,/abs/path/to/another]
```

`STUDIO_WRITE_PROJECTS` is a comma-separated list of absolute paths. The
first path that exists at send time is used as the agent's `cwd`. Anything
Claude does in this folder uses the bundled permission defaults in
`resources/claude-defaults.json` (WebSearch/WebFetch and read-only Reddit
`curl`s are pre-approved; everything else prompts the user; destructive
shell patterns like `sudo` and `rm -rf` are hard-denied). The bundled file
is loaded via the SDK's `options.settings` flag and overrides any personal
`~/.claude/settings.json`.

```
nvm use            # Node 22 (see .nvmrc)
npm install
npm start          # launches Electron with Vite HMR
npm test           # packages the app, runs Playwright E2E
npm run lint       # WordPress-flavored ESLint (JS/TS)
npm run lint:css   # WordPress-flavored Stylelint (CSS)
npm run format     # Prettier (WordPress config)
```

`npm test` packages the app with Forge and runs both specs in `tests/e2e/`:

-   `shell.spec.ts` — asserts UI layout, drag regions, and composer interactivity.
-   `agent.spec.ts` — sends a prompt to the real Claude API and verifies the streamed response lands in the transcript. Requires `ANTHROPIC_API_KEY`.

Release builds use Forge's hardened fuses by default. `npm test` relaxes `EnableNodeCliInspectArguments` via `TEST_BUILD=1` so Playwright can attach its debugger. Do not set `TEST_BUILD` when packaging for distribution.

## Distribution

`npm run make` packages the app and writes a drag-to-Applications `Studio Write.dmg` (and a `.zip`) to `out/make/`.

### Signed & notarized (for general distribution)

A macOS app downloaded through a browser is quarantined; Gatekeeper rejects it unless it is signed with a **Developer ID Application** certificate and notarized by Apple. To produce such a build, install that certificate in your login keychain and set three environment variables before `npm run make`:

```
export APPLE_ID="you@example.com"
export APPLE_ID_PASSWORD="abcd-efgh-ijkl-mnop"   # app-specific password
export APPLE_TEAM_ID="XXXXXXXXXX"
npm run make
```

`APPLE_ID_PASSWORD` is an app-specific password (appleid.apple.com → Sign-In & Security → App-Specific Passwords), not your account password. When all three are set, Forge signs every nested binary — including the Agent SDK's `claude` — with the hardened-runtime entitlements in `build/entitlements.mac.plist` and submits the result to Apple for notarization. Verify the output:

```
spctl -a -vvv -t exec "out/Studio Write-darwin-arm64/Studio Write.app"
# expect: accepted ... source=Notarized Developer ID
```

### Unsigned (internal testers only)

Without the Apple credentials, `npm run make` produces an ad-hoc-signed build. It is internally valid but not notarized, so Gatekeeper blocks the first launch on the recipient's Mac. The DMG window background spells out the one-time fix — double-click, then **System Settings ▸ Privacy & Security ▸ Open Anyway** — so testers can clear it without instructions. If macOS reports the app as "damaged" (or no "Open Anyway" button appears), the quarantine flag can be cleared directly:

```
xattr -dr com.apple.quarantine "/Applications/Studio Write.app"
```

This is only viable for a handful of trusted testers — not general distribution.

The DMG background is rendered from `build/dmg/background.html`; run `npm run dmg:background` to regenerate `build/dmg-background.png` (and the `@2x` Retina companion) after editing it.
