import { randomUUID } from 'node:crypto';

import { z } from 'zod';

import { getCachedClaudeAuthStatus } from './claude-auth-status';
import { readApiKey } from './env-file-store';
import { runOneShotPrompt } from './one-shot-prompt';
import { loadPrompt } from './prompts';
import { getProject } from './project-get';
import { resolveBundledPromptPath } from './resource-paths';
import { readStore } from './ui-prefs-store';
import {
	DraftCheckIssue,
	DraftCheckKind,
	DraftCheckResult,
} from '../../../types';

type RunInput = {
	projectId: string;
	body: string;
	checks: DraftCheckKind[];
};

// Haiku is fast and cheap and handles structured-text tasks well — the
// checks need to come back within a few seconds for the UI to feel
// responsive. If quality drops, bump to Sonnet here.
const MODEL = 'claude-haiku-4-5-20251001';

// Per-kind prompt filename under resources/prompts/checks/. Keep this list
// in lock-step with DraftCheckKind — anything not in the map will throw at
// load time, which is what we want.
const PROMPT_FILES: Record< DraftCheckKind, string > = {
	'grammar-spelling': 'checks/grammar-spelling.md',
	brevity: 'checks/brevity.md',
	'passive-voice': 'checks/passive-voice.md',
};

const WireIssue = z.object( {
	original: z.string().min( 1 ),
	replacement: z.string(),
	message: z.string(),
} );
type WireIssue = z.infer< typeof WireIssue >;

const WireIssueArray = z.array( WireIssue );

// The prompts ask for a bare JSON array, but models sometimes wrap output
// in a ```json fence or prepend a short preamble. Pull the first JSON
// array out of the response by index — looser than a parser, strict
// enough that anything actually malformed throws.
export function parseModelOutput( raw: string ): unknown {
	const trimmed = raw.trim();
	if ( trimmed.startsWith( '[' ) ) {
		return JSON.parse( trimmed );
	}
	const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec( trimmed );
	if ( fenced ) {
		return JSON.parse( fenced[ 1 ].trim() );
	}
	const start = trimmed.indexOf( '[' );
	const end = trimmed.lastIndexOf( ']' );
	if ( start !== -1 && end !== -1 && end > start ) {
		return JSON.parse( trimmed.slice( start, end + 1 ) );
	}
	throw new Error( 'no JSON array in model output' );
}

// Locate exact snippets, drop unmatched, dedupe within a single check,
// and stamp ids + offsets. Exported for unit testing.
export function normalizeIssues(
	kind: DraftCheckKind,
	body: string,
	raw: WireIssue[]
): DraftCheckIssue[] {
	const seen = new Set< string >();
	const out: DraftCheckIssue[] = [];
	for ( const entry of raw ) {
		const key = `${ entry.original }→${ entry.replacement }`;
		if ( seen.has( key ) ) {
			continue;
		}
		const idx = body.indexOf( entry.original );
		if ( idx === -1 ) {
			continue;
		}
		seen.add( key );
		out.push( {
			id: randomUUID(),
			kind,
			from: idx,
			to: idx + entry.original.length,
			original: entry.original,
			replacement: entry.replacement,
			message: entry.message,
		} );
	}
	return out;
}

async function runOneCheck(
	kind: DraftCheckKind,
	body: string,
	cwd: string
): Promise< DraftCheckResult > {
	try {
		const promptPath = resolveBundledPromptPath( PROMPT_FILES[ kind ] );
		const prompt = loadPrompt( promptPath, { body } );
		const raw = await runOneShotPrompt( prompt, { cwd, model: MODEL } );
		if ( ! raw ) {
			return { kind, issues: [], error: 'empty model response' };
		}
		let parsed: unknown;
		try {
			parsed = parseModelOutput( raw );
		} catch ( err ) {
			return {
				kind,
				issues: [],
				error: 'parse-failed',
			};
		}
		const validated = WireIssueArray.safeParse( parsed );
		if ( ! validated.success ) {
			return { kind, issues: [], error: 'invalid-schema' };
		}
		return {
			kind,
			issues: normalizeIssues( kind, body, validated.data ),
			error: null,
		};
	} catch ( err ) {
		return {
			kind,
			issues: [],
			error: err instanceof Error ? err.message : 'unknown error',
		};
	}
}

export async function runDraftChecks(
	input: RunInput
): Promise< DraftCheckResult[] > {
	const { body, checks, projectId } = input;
	if ( body.trim().length === 0 ) {
		return checks.map( ( kind ) => ( { kind, issues: [], error: null } ) );
	}
	const authMode = readStore().authMode ?? 'api-key';
	if ( authMode === 'api-key' && ! readApiKey() ) {
		return checks.map( ( kind ) => ( {
			kind,
			issues: [],
			error: 'Set your Anthropic API key in Settings to run checks.',
		} ) );
	}
	if (
		authMode === 'claude-code' &&
		! getCachedClaudeAuthStatus().signedIn
	) {
		return checks.map( ( kind ) => ( {
			kind,
			issues: [],
			error: 'Sign in to Claude in Settings to run checks.',
		} ) );
	}
	const project = getProject( projectId );
	if ( ! project ) {
		return checks.map( ( kind ) => ( {
			kind,
			issues: [],
			error: 'Project is not linked.',
		} ) );
	}
	const settled = await Promise.allSettled(
		checks.map( ( kind ) => runOneCheck( kind, body, project.path ) )
	);
	return settled.map( ( r, i ): DraftCheckResult => {
		if ( r.status === 'fulfilled' ) {
			return r.value;
		}
		return {
			kind: checks[ i ],
			issues: [],
			error:
				r.reason instanceof Error ? r.reason.message : 'unknown error',
		};
	} );
}
