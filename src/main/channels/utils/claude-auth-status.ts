import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import type { ClaudeAuthStatus } from '../../../types';
import { resolveClaudeCodeBinary } from './resource-paths';

const execFileAsync = promisify( execFile );

// Tests inject this with STUDIO_WRITE_FAKE_AUTH_STATUS=<json>: instead of
// spawning the binary, we parse the value and return it. Lets e2e drive the
// signed-in / signed-out / expired cases without a real OAuth session.
function readFakeStatus(): ClaudeAuthStatus | null {
	const raw = process.env.STUDIO_WRITE_FAKE_AUTH_STATUS;
	if ( ! raw ) {
		return null;
	}
	try {
		const parsed = JSON.parse( raw ) as Record< string, unknown >;
		return {
			signedIn: parsed.signedIn === true,
			email: typeof parsed.email === 'string' ? parsed.email : undefined,
			subscriptionType:
				typeof parsed.subscriptionType === 'string'
					? parsed.subscriptionType
					: undefined,
			authMethod:
				typeof parsed.authMethod === 'string'
					? parsed.authMethod
					: undefined,
			orgName:
				typeof parsed.orgName === 'string' ? parsed.orgName : undefined,
		};
	} catch {
		return { signedIn: false };
	}
}

const SIGNED_OUT: ClaudeAuthStatus = { signedIn: false };

let cached: ClaudeAuthStatus | null = null;
let inFlight: Promise< ClaudeAuthStatus > | null = null;

function buildChildEnv(): NodeJS.ProcessEnv {
	// Strip ANTHROPIC_API_KEY — auth status reflects whichever auth source
	// is currently active, and a passed-through env key would mask the
	// OAuth state we actually want to read.
	const out: NodeJS.ProcessEnv = {};
	for ( const [ k, v ] of Object.entries( process.env ) ) {
		if ( k === 'ANTHROPIC_API_KEY' ) {
			continue;
		}
		out[ k ] = v;
	}
	return out;
}

function parseAuthStatusStdout( stdout: string ): ClaudeAuthStatus {
	try {
		const parsed = JSON.parse( stdout ) as Record< string, unknown >;
		const signedIn = parsed.loggedIn === true;
		if ( ! signedIn ) {
			return SIGNED_OUT;
		}
		return {
			signedIn: true,
			email: typeof parsed.email === 'string' ? parsed.email : undefined,
			subscriptionType:
				typeof parsed.subscriptionType === 'string'
					? parsed.subscriptionType
					: undefined,
			authMethod:
				typeof parsed.authMethod === 'string'
					? parsed.authMethod
					: undefined,
			orgName:
				typeof parsed.orgName === 'string' ? parsed.orgName : undefined,
		};
	} catch {
		return SIGNED_OUT;
	}
}

async function probe(): Promise< ClaudeAuthStatus > {
	const fake = readFakeStatus();
	if ( fake ) {
		return fake;
	}
	try {
		const { stdout } = await execFileAsync(
			resolveClaudeCodeBinary(),
			[ 'auth', 'status', '--json' ],
			{ env: buildChildEnv(), timeout: 5000 }
		);
		return parseAuthStatusStdout( stdout );
	} catch {
		return SIGNED_OUT;
	}
}

export async function refreshClaudeAuthStatus(): Promise< ClaudeAuthStatus > {
	if ( ! inFlight ) {
		inFlight = probe().finally( () => {
			inFlight = null;
		} );
	}
	const next = await inFlight;
	cached = next;
	return next;
}

export async function getClaudeAuthStatus(): Promise< ClaudeAuthStatus > {
	if ( cached ) {
		return cached;
	}
	return refreshClaudeAuthStatus();
}

// Synchronous accessor for the agent-service pre-flight check: it doesn't
// want to pay a spawn round-trip on every send. The cache is warmed on
// app startup and refreshed by the SettingsModal, so a cold read here
// happens only on the very first send before either has run — in which
// case we conservatively report signed-out and the user is routed to
// Settings.
export function getCachedClaudeAuthStatus(): ClaudeAuthStatus {
	return cached ?? SIGNED_OUT;
}
