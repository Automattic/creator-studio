# creator-studio

Desktop chat app (Electron + React + TypeScript). macOS shell with a titlebar, transcript, and composer. Submitting a message calls the Claude Agent SDK and streams the response back into the transcript.

## Dev setup

Create a `.env` file in the project root with your Anthropic API key and at
least one trusted project folder Claude is allowed to work inside:

```
ANTHROPIC_API_KEY=sk-ant-...
CREATORS_STUDIO_PROJECTS=/abs/path/to/project[,/abs/path/to/another]
```

`CREATORS_STUDIO_PROJECTS` is a comma-separated list of absolute paths. The
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
