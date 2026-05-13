import { query, type SDKMessage } from '@anthropic-ai/claude-agent-sdk';

import { readStore } from './ui-prefs-store';
import { resolveClaudeCodeBinary } from './resource-paths';

// Build the env passed to the SDK subprocess. In Claude-Code mode we
// strip `ANTHROPIC_API_KEY` so the bundled binary uses its keychain
// OAuth credentials — otherwise an env-set key would silently win even
// though the user picked OAuth in Settings.
export function buildChildEnv(): NodeJS.ProcessEnv {
	const authMode = readStore().authMode ?? 'api-key';
	if ( authMode !== 'claude-code' ) {
		return { ...process.env };
	}
	const out: NodeJS.ProcessEnv = {};
	for ( const [ k, v ] of Object.entries( process.env ) ) {
		if ( k === 'ANTHROPIC_API_KEY' ) {
			continue;
		}
		out[ k ] = v;
	}
	return out;
}

// Single-turn, tool-less SDK call. Replaces direct POST /v1/messages
// calls so the bundled binary's auth fallback (env key → keychain
// OAuth) covers both auth modes from one code path. The caller owns
// parsing the returned string (title trimming, JSON parsing, …).
//
// Latency budget: these workloads (auto-titles, draft checks) used to
// be a single POST /v1/messages to Haiku and need to feel just as
// snappy. Five knobs keep the SDK path fast — benchmarked one at a
// time, each shaves real wall-clock off a Haiku call:
//
//   1. `systemPrompt: <short string>` — bypass the 'claude_code' preset,
//      which is multi-KB of "you are Claude Code" text the model would
//      otherwise have to ingest before it sees the user prompt.
//   2. `thinking: { type: 'disabled' }` — turn off extended thinking;
//      classification/extraction tasks don't benefit from it.
//   3. `model` pinned to Haiku by the caller — Sonnet/Opus would
//      multiply token cost and latency for the same JSON output.
//   4. `settingSources: []` — skip user/project/local CLAUDE.md
//      ingestion.
//   5. `includeHookEvents: false` — opt out of the binary's hook-
//      event delivery scaffolding. ~700ms in local benchmarks.
//
// And two settings we intentionally don't pass:
//   - No `settings:` path — the bundled claude-defaults.json carries
//     permissions lists that don't apply to a tool-less call, and the
//     binary skips ~400ms of init when nothing's loaded.
//   - `mcpServers: {}` — explicit zero-MCP belt-and-suspenders.
//
// `cwd` matters because the SDK rejects calls without one and uses it
// to resolve project-scoped settings — picking the active project's
// path keeps the helper aligned with how the main agent run is
// configured.
export async function runOneShotPrompt(
	prompt: string,
	opts: {
		cwd: string;
		model?: string;
		signal?: AbortSignal;
		// Optional override; defaults to a short generic instruction. Use
		// when you want a specialised system prompt without paying for
		// the heavy 'claude_code' preset.
		systemPrompt?: string;
	}
): Promise< string > {
	const binaryPath = resolveClaudeCodeBinary();
	const abortController = new AbortController();
	const onAbort = (): void => abortController.abort();
	if ( opts.signal ) {
		if ( opts.signal.aborted ) {
			abortController.abort();
		} else {
			opts.signal.addEventListener( 'abort', onAbort, { once: true } );
		}
	}
	const systemPrompt =
		opts.systemPrompt ??
		'Reply with the requested content only. No preamble, no explanation, no caveats.';
	try {
		const q = query( {
			prompt,
			options: {
				cwd: opts.cwd,
				env: buildChildEnv(),
				pathToClaudeCodeExecutable: binaryPath,
				// Intentionally no `settings:` — the bundled permissions
				// don't apply to tool-less calls, and skipping saves ~400ms
				// per spawn.
				// Skip user / project / local CLAUDE.md ingestion — these
				// one-shot calls have no tools to gate, no policies to
				// respect, and don't need a multi-KB memory file folded
				// into every prompt.
				settingSources: [],
				// Explicit zero — defaults are usually fine but the
				// guarantee is cheap.
				mcpServers: {},
				// The hook-event delivery scaffolding adds ~700ms of
				// startup. We have no hooks to drive.
				includeHookEvents: false,
				systemPrompt,
				thinking: { type: 'disabled' },
				maxTurns: 1,
				allowedTools: [],
				permissionMode: 'default',
				abortController,
				// Pin the model so the title/check workloads (cheap haiku
				// tasks) don't silently jump to a pricier default in
				// API-key mode where the user pays per token.
				...( opts.model ? { model: opts.model } : {} ),
			},
		} );
		const parts: string[] = [];
		for await ( const msg of q as AsyncIterable< SDKMessage > ) {
			if ( msg.type !== 'assistant' ) {
				continue;
			}
			const content = msg.message.content;
			if ( ! Array.isArray( content ) ) {
				continue;
			}
			for ( const block of content ) {
				if (
					typeof block === 'object' &&
					block !== null &&
					( block as { type?: string } ).type === 'text' &&
					typeof ( block as { text?: unknown } ).text === 'string'
				) {
					parts.push( ( block as { text: string } ).text );
				}
			}
		}
		return parts.join( '' ).trim();
	} finally {
		if ( opts.signal ) {
			opts.signal.removeEventListener( 'abort', onAbort );
		}
	}
}
