import { query, type SDKMessage } from '@anthropic-ai/claude-agent-sdk';

import { readStore } from './ui-prefs-store';
import {
	resolveBundledSettingsPath,
	resolveClaudeCodeBinary,
} from './resource-paths';

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
// `cwd` matters because the SDK rejects calls without one and uses it
// to resolve project-scoped settings — picking the active project's
// path keeps the helper aligned with how the main agent run is
// configured.
export async function runOneShotPrompt(
	prompt: string,
	opts: { cwd: string; model?: string; signal?: AbortSignal }
): Promise< string > {
	const binaryPath = resolveClaudeCodeBinary();
	const bundledSettingsPath = resolveBundledSettingsPath();
	const abortController = new AbortController();
	const onAbort = (): void => abortController.abort();
	if ( opts.signal ) {
		if ( opts.signal.aborted ) {
			abortController.abort();
		} else {
			opts.signal.addEventListener( 'abort', onAbort, { once: true } );
		}
	}
	try {
		const q = query( {
			prompt,
			options: {
				cwd: opts.cwd,
				env: buildChildEnv(),
				pathToClaudeCodeExecutable: binaryPath,
				settings: bundledSettingsPath,
				systemPrompt: { type: 'preset', preset: 'claude_code' },
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
