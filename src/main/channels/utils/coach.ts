import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import matter from 'gray-matter';
import { z } from 'zod';

import { getCachedClaudeAuthStatus } from './claude-auth-status';
import {
	WireReview,
	normalizeCoachReview,
	rewriteVariantPolicy,
} from './coach-normalize';
import { deDash } from './de-dash';
import { readApiKey } from './env-file-store';
import { loadPrompt } from './prompts';
import { runOneShotPrompt } from './one-shot-prompt';
import { parseJsonArray, parseJsonObject } from './parse-model-json';
import { getProject } from './project-get';
import { resolveBundledPromptPath } from './resource-paths';
import { readStore } from './ui-prefs-store';
import {
	type CoachRewriteAction,
	type CoachRewriteResult,
	type CoachReviewResult,
	type CoachStructureNote,
	type CoachStructureResult,
	type CoachTone,
	type Project,
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
const MAX_VOICE_BYTES = 4_000;

// Read the project's writing-voice profile (checks/voice.md, body only).
// Returns '' when there's no voice yet or it's still the bundled placeholder,
// matching the readiness check the renderer uses.
export function readVoiceProfile( projectPath: string ): string {
	try {
		const raw = fs.readFileSync(
			path.join( projectPath, 'checks', 'voice.md' ),
			'utf-8'
		);
		const body = matter( raw ).content.trim();
		if ( ! body || body.startsWith( '(No voice defined yet' ) ) {
			return '';
		}
		return body;
	} catch {
		return '';
	}
}

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

// Every Coach pass shares the same skeleton: resolve the project, guard the
// input, gate on auth, render the prompt, run a one-shot model call, then
// parse → validate → normalize the response. `runCoachPass` owns that middle;
// each pass supplies only what differs (prompt, model, guard, vars, parse,
// schema, normalizer) and maps the outcome to its own public result shape.
type CoachPassOutcome< TData > =
	// Body guard saw an empty draft — a success with no findings, not an error.
	| { kind: 'empty' }
	| { kind: 'data'; data: TData }
	| { kind: 'error'; error: string };

// `body` guards a whole-document pass (empty → empty outcome, oversize →
// error). `selection` guards a rewrite (empty → error, no size cap; the
// selection is clipped by the caller before it gets here).
type CoachGuard =
	| { kind: 'body'; body: string }
	| { kind: 'selection'; selection: string };

async function runCoachPass< TSchema extends z.ZodTypeAny, TData >( config: {
	projectId: string;
	model: string;
	promptFile: string;
	guard: CoachGuard;
	vars: ( project: Project ) => Record< string, string >;
	parse: ( raw: string ) => unknown;
	schema: TSchema;
	normalize: ( data: z.infer< TSchema > ) => TData;
} ): Promise< CoachPassOutcome< TData > > {
	const project = getProject( config.projectId );
	if ( ! project ) {
		return { kind: 'error', error: 'project-not-found' };
	}
	if ( config.guard.kind === 'body' ) {
		if ( config.guard.body.trim().length === 0 ) {
			return { kind: 'empty' };
		}
		if ( config.guard.body.length > MAX_BODY_BYTES ) {
			return { kind: 'error', error: 'draft-too-large' };
		}
	} else if ( config.guard.selection.trim().length === 0 ) {
		return { kind: 'error', error: 'empty-selection' };
	}
	const gate = authError( 'use Coach' );
	if ( gate ) {
		return { kind: 'error', error: gate };
	}

	const prompt = loadPrompt(
		resolveBundledPromptPath( config.promptFile ),
		config.vars( project )
	);
	let raw: string;
	try {
		raw = await runOneShotPrompt( prompt, {
			cwd: project.path,
			model: config.model,
		} );
	} catch ( err ) {
		return {
			kind: 'error',
			error: err instanceof Error ? err.message : 'request-failed',
		};
	}
	if ( ! raw ) {
		return { kind: 'error', error: 'empty model response' };
	}
	let parsed: unknown;
	try {
		parsed = config.parse( raw );
	} catch {
		return { kind: 'error', error: 'parse-failed' };
	}
	const validated = config.schema.safeParse( parsed );
	if ( ! validated.success ) {
		return { kind: 'error', error: 'invalid-schema' };
	}
	return { kind: 'data', data: config.normalize( validated.data ) };
}

export type ScanInput = { projectId: string; body: string };

// The review pass returns an object ({ register, score, issues }). Tolerate a
// bare array (issues only) by wrapping it. If neither parses, the throw
// surfaces as 'parse-failed'.
function parseReviewResponse( raw: string ): unknown {
	try {
		return parseJsonObject( raw );
	} catch {
		return { issues: parseJsonArray( raw ) };
	}
}

// One whole-document pass: register + rubric dimensions + findings together
// (previously the separate scan and score passes).
export async function runCoachReview(
	input: ScanInput
): Promise< CoachReviewResult > {
	const outcome = await runCoachPass( {
		projectId: input.projectId,
		model: MODEL,
		promptFile: 'coach-review.txt',
		guard: { kind: 'body', body: input.body },
		vars: ( project ) => ( {
			body: input.body,
			voice: clip( readVoiceProfile( project.path ), MAX_VOICE_BYTES ),
		} ),
		parse: parseReviewResponse,
		schema: WireReview,
		normalize: ( data ) => normalizeCoachReview( input.body, data ),
	} );
	switch ( outcome.kind ) {
		case 'empty':
			return {
				register: null,
				dimensions: [],
				aiLikeness: null,
				issues: [],
				error: null,
			};
		case 'error':
			return {
				register: null,
				dimensions: [],
				aiLikeness: null,
				issues: [],
				error: outcome.error,
			};
		case 'data':
			return {
				register: outcome.data.register,
				dimensions: outcome.data.dimensions,
				aiLikeness: outcome.data.aiLikeness,
				issues: outcome.data.issues,
				error: null,
			};
	}
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
	const outcome = await runCoachPass( {
		projectId: input.projectId,
		model: STRUCTURE_MODEL,
		promptFile: 'coach-structure.txt',
		guard: { kind: 'body', body: input.body },
		vars: () => ( { body: input.body } ),
		parse: parseJsonArray,
		schema: WireStructureArray,
		normalize: ( data ) => normalizeStructureNotes( input.body, data ),
	} );
	switch ( outcome.kind ) {
		case 'empty':
			return { notes: [], error: null };
		case 'error':
			return { notes: [], error: outcome.error };
		case 'data':
			return { notes: outcome.data, error: null };
	}
}

export type RewriteInput = {
	projectId: string;
	selection: string;
	context: string;
	action: CoachRewriteAction;
	tone: CoachTone;
};

const WireCandidate = z.object( {
	text: z.string(),
	why: z.string().optional(),
} );
const WireCandidates = z.array( WireCandidate );

export async function runCoachRewrite(
	input: RewriteInput
): Promise< CoachRewriteResult > {
	const selection = clip( input.selection, MAX_SELECTION_BYTES ).trim();
	// Subjective actions return a choice of two; "fix" stays single.
	const variantCount = rewriteVariantPolicy( input.action );
	const outcome = await runCoachPass( {
		projectId: input.projectId,
		model: MODEL,
		promptFile: 'coach-rewrite.txt',
		guard: { kind: 'selection', selection },
		vars: ( project ) => ( {
			action: input.action,
			tone: input.tone,
			count: String( variantCount ),
			context: clip( input.context, MAX_CONTEXT_BYTES ),
			selection,
			voice:
				input.action === 'myVoice'
					? clip( readVoiceProfile( project.path ), MAX_VOICE_BYTES )
					: '',
		} ),
		parse: parseJsonArray,
		schema: WireCandidates,
		// Each rewrite carries a one-line "why". Strip dashes from both so the
		// tool's own prose doesn't read as AI. Cap to the action's variant count.
		normalize: ( data ) =>
			data
				.map( ( c ) => ( {
					text: deDash( c.text.trim() ),
					why: deDash( ( c.why ?? '' ).trim() ),
				} ) )
				.filter( ( c ) => c.text.length > 0 )
				.slice( 0, variantCount ),
	} );
	switch ( outcome.kind ) {
		// A selection guard never yields 'empty'; handled for exhaustiveness.
		case 'empty':
		case 'error':
			return {
				candidates: [],
				error: outcome.kind === 'error' ? outcome.error : null,
			};
		case 'data':
			return { candidates: outcome.data, error: null };
	}
}
