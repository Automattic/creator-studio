import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import matter from 'gray-matter';
import { z } from 'zod';

import { buildCheckPrompt } from './checks-prompt-scaffold';
import { getCachedClaudeAuthStatus } from './claude-auth-status';
import { readApiKey } from './env-file-store';
import { runOneShotPrompt } from './one-shot-prompt';
import { getProject } from './project-get';
import { readStore } from './ui-prefs-store';
import { DraftCheckIssue, DraftCheckResult } from '../../../types';

type RunInput = {
	projectId: string;
	body: string;
};

type EnabledCheck = {
	relPath: string;
	title: string;
	promptBody: string;
	voice: boolean;
};

// Haiku is fast and cheap and handles structured-text tasks well — the
// checks need to come back within a few seconds for the UI to feel
// responsive. If quality drops, bump to Sonnet here.
const MODEL = 'claude-haiku-4-5-20251001';
const CHECKS_FOLDER = 'checks';
// Soft cap: prompt bodies above this size are rejected without an API call
// to keep the runner from blowing the token budget on a paste-bomb.
const MAX_PROMPT_BODY_BYTES = 16 * 1024;

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
	checkRelPath: string,
	checkTitle: string,
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
			checkRelPath,
			checkTitle,
			from: idx,
			to: idx + entry.original.length,
			original: entry.original,
			replacement: entry.replacement,
			message: entry.message,
		} );
	}
	return out;
}

function listEnabledChecks( projectPath: string ): {
	enabled: EnabledCheck[];
	parseFailures: { relPath: string; title: string }[];
} {
	const dir = path.resolve( projectPath, CHECKS_FOLDER );
	let entries: fs.Dirent[];
	try {
		entries = fs.readdirSync( dir, { withFileTypes: true } );
	} catch {
		return { enabled: [], parseFailures: [] };
	}
	const enabled: EnabledCheck[] = [];
	const parseFailures: { relPath: string; title: string }[] = [];
	for ( const entry of entries ) {
		if ( ! entry.isFile() ) {
			continue;
		}
		if ( entry.name.startsWith( '.' ) ) {
			continue;
		}
		if ( ! entry.name.toLowerCase().endsWith( '.md' ) ) {
			continue;
		}
		const target = path.join( dir, entry.name );
		let raw: string;
		try {
			raw = fs.readFileSync( target, 'utf-8' );
		} catch {
			continue;
		}
		let data: Record< string, unknown > = {};
		let promptBody = raw;
		let parsed = false;
		try {
			const m = matter( raw );
			data = m.data as Record< string, unknown >;
			promptBody = m.content;
			parsed = true;
		} catch {
			parseFailures.push( {
				relPath: entry.name,
				title: entry.name.replace( /\.md$/i, '' ),
			} );
			continue;
		}
		if ( ! parsed || data.enabled !== true ) {
			continue;
		}
		const t = data.title;
		const title =
			typeof t === 'string' && t.trim().length > 0
				? t
				: entry.name.replace( /\.md$/i, '' );
		enabled.push( {
			relPath: entry.name,
			title,
			promptBody,
			voice: data.voice === true,
		} );
	}
	return { enabled, parseFailures };
}

async function runOneCheck(
	check: EnabledCheck,
	body: string,
	cwd: string
): Promise< DraftCheckResult > {
	if ( check.promptBody.length > MAX_PROMPT_BODY_BYTES ) {
		return {
			checkRelPath: check.relPath,
			checkTitle: check.title,
			issues: [],
			error: 'prompt-too-large',
		};
	}
	try {
		const prompt = buildCheckPrompt( check.promptBody, body, {
			voice: check.voice,
		} );
		const raw = await runOneShotPrompt( prompt, { cwd, model: MODEL } );
		if ( ! raw ) {
			return {
				checkRelPath: check.relPath,
				checkTitle: check.title,
				issues: [],
				error: 'empty model response',
			};
		}
		let parsed: unknown;
		try {
			parsed = parseModelOutput( raw );
		} catch {
			return {
				checkRelPath: check.relPath,
				checkTitle: check.title,
				issues: [],
				error: 'parse-failed',
			};
		}
		const validated = WireIssueArray.safeParse( parsed );
		if ( ! validated.success ) {
			return {
				checkRelPath: check.relPath,
				checkTitle: check.title,
				issues: [],
				error: 'invalid-schema',
			};
		}
		return {
			checkRelPath: check.relPath,
			checkTitle: check.title,
			issues: normalizeIssues(
				check.relPath,
				check.title,
				body,
				validated.data
			),
			error: null,
		};
	} catch ( err ) {
		return {
			checkRelPath: check.relPath,
			checkTitle: check.title,
			issues: [],
			error: err instanceof Error ? err.message : 'unknown error',
		};
	}
}

export async function runDraftChecks(
	input: RunInput
): Promise< DraftCheckResult[] > {
	const { body, projectId } = input;
	const project = getProject( projectId );
	if ( ! project ) {
		return [];
	}
	const { enabled, parseFailures } = listEnabledChecks( project.path );
	const failureResults: DraftCheckResult[] = parseFailures.map( ( p ) => ( {
		checkRelPath: p.relPath,
		checkTitle: p.title,
		issues: [],
		error: 'invalid-frontmatter',
	} ) );
	if ( enabled.length === 0 ) {
		return failureResults;
	}
	if ( body.trim().length === 0 ) {
		return [
			...failureResults,
			...enabled.map( ( c ) => ( {
				checkRelPath: c.relPath,
				checkTitle: c.title,
				issues: [],
				error: null,
			} ) ),
		];
	}
	const authMode = readStore().authMode ?? 'api-key';
	const authError = ( () => {
		if ( authMode === 'api-key' && ! readApiKey() ) {
			return 'Set your Anthropic API key in Settings to run checks.';
		}
		if (
			authMode === 'claude-code' &&
			! getCachedClaudeAuthStatus().signedIn
		) {
			return 'Sign in to Claude in Settings to run checks.';
		}
		return null;
	} )();
	if ( authError ) {
		return [
			...failureResults,
			...enabled.map( ( c ) => ( {
				checkRelPath: c.relPath,
				checkTitle: c.title,
				issues: [],
				error: authError,
			} ) ),
		];
	}
	const settled = await Promise.allSettled(
		enabled.map( ( c ) => runOneCheck( c, body, project.path ) )
	);
	const results = settled.map( ( r, i ): DraftCheckResult => {
		if ( r.status === 'fulfilled' ) {
			return r.value;
		}
		return {
			checkRelPath: enabled[ i ].relPath,
			checkTitle: enabled[ i ].title,
			issues: [],
			error:
				r.reason instanceof Error ? r.reason.message : 'unknown error',
		};
	} );
	return [ ...failureResults, ...results ];
}
