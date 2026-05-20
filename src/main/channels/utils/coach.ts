import { randomUUID } from 'node:crypto';

import { z } from 'zod';

import { getCachedClaudeAuthStatus } from './claude-auth-status';
import { deDash } from './de-dash';
import { readApiKey } from './env-file-store';
import { loadPrompt } from './prompts';
import { runOneShotPrompt } from './one-shot-prompt';
import { parseJsonArray, parseJsonObject } from './parse-model-json';
import { getProject } from './project-get';
import { resolveBundledPromptPath } from './resource-paths';
import { readStore } from './ui-prefs-store';
import {
	CoachIssueCategory,
	CoachRegister,
	type CoachIssue,
	type CoachRewriteAction,
	type CoachRewriteResult,
	type CoachScanResult,
	type CoachStructureNote,
	type CoachStructureResult,
	type CoachTone,
} from '../../../types';

// Haiku for the same reasons as drafts:check and language-aid — these
// fire on demand and must come back quickly; the prompts ask for strict
// JSON and don't need reasoning.
const MODEL = 'claude-haiku-4-5-20251001';
// Structure review is opt-in (not the fast auto loop) and benefits from a
// stronger model's judgment about organization and flow.
const STRUCTURE_MODEL = 'claude-sonnet-4-6';

const MAX_BODY_BYTES = 16 * 1024;
const MAX_SELECTION_BYTES = 4_000;
const MAX_CONTEXT_BYTES = 4_000;

function clip( value: string | undefined, max: number ): string {
	if ( ! value ) {
		return '';
	}
	return value.length > max ? value.slice( 0, max ) : value;
}

// Gate both scan and rewrite on the configured auth path, returning a
// user-facing message when the credential is missing.
function authError( verb: string ): string | null {
	const authMode = readStore().authMode ?? 'api-key';
	if ( authMode === 'api-key' && ! readApiKey() ) {
		return `Set your Anthropic API key in Settings to ${ verb }.`;
	}
	if (
		authMode === 'claude-code' &&
		! getCachedClaudeAuthStatus().signedIn
	) {
		return `Sign in to Claude in Settings to ${ verb }.`;
	}
	return null;
}

const WireIssue = z.object( {
	category: CoachIssueCategory,
	original: z.string().min( 1 ),
	replacement: z.string(),
	label: z.string(),
	explanation: z.string(),
	tip: z.union( [ z.string(), z.null() ] ).optional(),
} );
const WireIssueArray = z.array( WireIssue );

// The scan returns an object: a document-level register plus the findings.
// `register` is optional/loose so an odd value degrades to null rather than
// failing the whole parse.
const WireScan = z.object( {
	register: z.union( [ CoachRegister, z.null() ] ).optional(),
	issues: WireIssueArray,
} );

// Anchor each finding to the body via indexOf (same approach as
// normalizeIssues for checks): drop anything we can't locate verbatim,
// dedupe on the original→replacement pair, stamp ids + offsets.
export function normalizeCoachIssues(
	body: string,
	raw: z.infer< typeof WireIssueArray >
): CoachIssue[] {
	const seen = new Set< string >();
	const out: CoachIssue[] = [];
	for ( const entry of raw ) {
		const key = `${ entry.category }:${ entry.original }→${ entry.replacement }`;
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
			category: entry.category,
			from: idx,
			to: idx + entry.original.length,
			// `original` stays verbatim (used for offset anchoring); the
			// generated prose is de-dashed.
			original: entry.original,
			replacement: deDash( entry.replacement ),
			label: entry.label,
			explanation: deDash( entry.explanation ),
			tip: entry.tip ? deDash( entry.tip ) : null,
		} );
	}
	return out;
}

export type ScanInput = { projectId: string; body: string };

export async function runCoachScan(
	input: ScanInput
): Promise< CoachScanResult > {
	const project = getProject( input.projectId );
	if ( ! project ) {
		return { issues: [], register: null, error: 'project-not-found' };
	}
	if ( input.body.trim().length === 0 ) {
		return { issues: [], register: null, error: null };
	}
	if ( input.body.length > MAX_BODY_BYTES ) {
		return { issues: [], register: null, error: 'draft-too-large' };
	}
	const gate = authError( 'use Coach' );
	if ( gate ) {
		return { issues: [], register: null, error: gate };
	}

	const prompt = loadPrompt( resolveBundledPromptPath( 'coach-scan.txt' ), {
		body: input.body,
	} );
	let raw: string;
	try {
		raw = await runOneShotPrompt( prompt, {
			cwd: project.path,
			model: MODEL,
		} );
	} catch ( err ) {
		return {
			issues: [],
			register: null,
			error: err instanceof Error ? err.message : 'request-failed',
		};
	}
	if ( ! raw ) {
		return { issues: [], register: null, error: 'empty model response' };
	}
	// Prefer the object shape; tolerate a bare array (older shape) by
	// wrapping it as issues-only.
	let parsed: unknown;
	try {
		parsed = parseJsonObject( raw );
	} catch {
		try {
			parsed = { issues: parseJsonArray( raw ) };
		} catch {
			return { issues: [], register: null, error: 'parse-failed' };
		}
	}
	const validated = WireScan.safeParse( parsed );
	if ( ! validated.success ) {
		return { issues: [], register: null, error: 'invalid-schema' };
	}
	return {
		issues: normalizeCoachIssues( input.body, validated.data.issues ),
		register: validated.data.register ?? null,
		error: null,
	};
}

const WireStructureNote = z.object( {
	label: z.string(),
	note: z.string(),
	quote: z.string().optional(),
} );
const WireStructureArray = z.array( WireStructureNote );

// Locate each note's quote in the body (offset for jump-to), dedupe, and
// stamp ids. Notes with an empty/unfindable quote keep `from: -1` and
// render as whole-document observations.
export function normalizeStructureNotes(
	body: string,
	raw: z.infer< typeof WireStructureArray >
): CoachStructureNote[] {
	const seen = new Set< string >();
	const out: CoachStructureNote[] = [];
	for ( const entry of raw ) {
		const key = `${ entry.label }:${ entry.note }`;
		if ( seen.has( key ) ) {
			continue;
		}
		seen.add( key );
		const quote = entry.quote ?? '';
		const from = quote ? body.indexOf( quote ) : -1;
		out.push( {
			id: randomUUID(),
			label: deDash( entry.label ),
			note: deDash( entry.note ),
			quote,
			from,
		} );
	}
	return out;
}

export async function runCoachStructure(
	input: ScanInput
): Promise< CoachStructureResult > {
	const project = getProject( input.projectId );
	if ( ! project ) {
		return { notes: [], error: 'project-not-found' };
	}
	if ( input.body.trim().length === 0 ) {
		return { notes: [], error: null };
	}
	if ( input.body.length > MAX_BODY_BYTES ) {
		return { notes: [], error: 'draft-too-large' };
	}
	const gate = authError( 'use Coach' );
	if ( gate ) {
		return { notes: [], error: gate };
	}

	const prompt = loadPrompt(
		resolveBundledPromptPath( 'coach-structure.txt' ),
		{ body: input.body }
	);
	let raw: string;
	try {
		raw = await runOneShotPrompt( prompt, {
			cwd: project.path,
			model: STRUCTURE_MODEL,
		} );
	} catch ( err ) {
		return {
			notes: [],
			error: err instanceof Error ? err.message : 'request-failed',
		};
	}
	if ( ! raw ) {
		return { notes: [], error: 'empty model response' };
	}
	let parsed: unknown;
	try {
		parsed = parseJsonArray( raw );
	} catch {
		return { notes: [], error: 'parse-failed' };
	}
	const validated = WireStructureArray.safeParse( parsed );
	if ( ! validated.success ) {
		return { notes: [], error: 'invalid-schema' };
	}
	return {
		notes: normalizeStructureNotes( input.body, validated.data ),
		error: null,
	};
}

export type RewriteInput = {
	projectId: string;
	selection: string;
	context: string;
	action: CoachRewriteAction;
	tone: CoachTone;
};

const WireCandidates = z.array( z.string() );

export async function runCoachRewrite(
	input: RewriteInput
): Promise< CoachRewriteResult > {
	const project = getProject( input.projectId );
	if ( ! project ) {
		return { candidates: [], error: 'project-not-found' };
	}
	const selection = clip( input.selection, MAX_SELECTION_BYTES ).trim();
	if ( ! selection ) {
		return { candidates: [], error: 'empty-selection' };
	}
	const gate = authError( 'use Coach' );
	if ( gate ) {
		return { candidates: [], error: gate };
	}

	const prompt = loadPrompt(
		resolveBundledPromptPath( 'coach-rewrite.txt' ),
		{
			action: input.action,
			tone: input.tone,
			context: clip( input.context, MAX_CONTEXT_BYTES ),
			selection,
		}
	);
	let raw: string;
	try {
		raw = await runOneShotPrompt( prompt, {
			cwd: project.path,
			model: MODEL,
		} );
	} catch ( err ) {
		return {
			candidates: [],
			error: err instanceof Error ? err.message : 'request-failed',
		};
	}
	if ( ! raw ) {
		return { candidates: [], error: 'empty model response' };
	}
	let parsed: unknown;
	try {
		parsed = parseJsonArray( raw );
	} catch {
		return { candidates: [], error: 'parse-failed' };
	}
	const validated = WireCandidates.safeParse( parsed );
	if ( ! validated.success ) {
		return { candidates: [], error: 'invalid-schema' };
	}
	// Single best rewrite; the panel and hover popover each show one. Strip
	// dashes so the tool's own prose doesn't read as AI.
	const candidates = validated.data
		.map( ( c ) => deDash( c.trim() ) )
		.filter( ( c ) => c.length > 0 )
		.slice( 0, 1 );
	return { candidates, error: null };
}
