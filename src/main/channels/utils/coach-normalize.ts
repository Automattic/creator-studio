import { randomUUID } from 'node:crypto';

import { z } from 'zod';

import { deDash } from './de-dash';
import {
	CoachIssueCategory,
	CoachRegister,
	CoachScoreKey,
	type CoachIssue,
	type CoachRewriteAction,
	type CoachScoreDimension,
} from '../../../types';

// Pure (IO-free) parsing/normalization for the Coach passes, split out from
// `coach.ts` so it can be unit-tested without pulling in the Agent SDK that
// `runOneShotPrompt` imports.

export const WireCoachIssue = z.object( {
	category: CoachIssueCategory,
	original: z.string().min( 1 ),
	replacement: z.string(),
	label: z.string(),
	explanation: z.string(),
	tip: z.union( [ z.string(), z.null() ] ).optional(),
} );

export const WireScoreDimension = z.object( {
	key: CoachScoreKey,
	score: z.number(),
	note: z.string().optional(),
} );

// The review pass returns an object: the document-level register, the rubric
// dimensions, and the findings. Each part is optional/loose so a missing or
// odd value degrades to a sensible default rather than failing the whole
// parse.
export const WireReview = z.object( {
	register: z.union( [ CoachRegister, z.null() ] ).optional(),
	score: z.array( WireScoreDimension ).optional(),
	// Holistic AI-likeness, loose so an out-of-range or missing value degrades
	// to null rather than failing the parse.
	ai: z.number().optional(),
	issues: z.array( WireCoachIssue ).optional(),
} );

// Anchor each finding to the body via indexOf (same approach as the checks
// pipeline): drop anything we can't locate verbatim, dedupe on the
// original→replacement pair, stamp ids + offsets. `original` stays verbatim
// (used for anchoring); generated prose is de-dashed.
export function normalizeCoachIssues(
	body: string,
	raw: ReadonlyArray< z.infer< typeof WireCoachIssue > >
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
			original: entry.original,
			replacement: deDash( entry.replacement ),
			label: entry.label,
			explanation: deDash( entry.explanation ),
			tip: entry.tip ? deDash( entry.tip ) : null,
		} );
	}
	return out;
}

export function clampScore( n: number ): number {
	return Math.max( 1, Math.min( 5, Math.round( n ) ) );
}

// How many rewrite candidates an action returns. Subjective actions offer a
// choice (2); "fix" is a correctness action with one authoritative answer.
export function rewriteVariantPolicy( action: CoachRewriteAction ): number {
	return action === 'fix' ? 1 : 2;
}

export function normalizeScoreDimensions(
	raw: ReadonlyArray< z.infer< typeof WireScoreDimension > >
): CoachScoreDimension[] {
	return raw.map( ( d ) => ( {
		key: d.key,
		score: clampScore( d.score ),
		note: deDash( ( d.note ?? '' ).trim() ),
	} ) );
}

export type CoachReviewData = {
	register: CoachRegister | null;
	dimensions: CoachScoreDimension[];
	aiLikeness: number | null;
	issues: CoachIssue[];
};

export function normalizeCoachReview(
	body: string,
	data: z.infer< typeof WireReview >
): CoachReviewData {
	return {
		register: data.register ?? null,
		dimensions: normalizeScoreDimensions( data.score ?? [] ),
		aiLikeness: typeof data.ai === 'number' ? clampScore( data.ai ) : null,
		issues: normalizeCoachIssues( body, data.issues ?? [] ),
	};
}
