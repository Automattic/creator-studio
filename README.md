# creators-studio

Desktop chat app (Electron + React + TypeScript). macOS shell with a titlebar, transcript, and composer. Submitting a message calls the Claude Agent SDK and streams the response back into the transcript.

## Dev setup

Create a `.env` file in the project root with your Anthropic API key:

```
ANTHROPIC_API_KEY=sk-ant-...
```

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
