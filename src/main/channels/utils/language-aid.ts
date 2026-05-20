import { z } from 'zod';

import { getCachedClaudeAuthStatus } from './claude-auth-status';
import { deDash } from './de-dash';
import { readApiKey } from './env-file-store';
import { loadPrompt } from './prompts';
import { runOneShotPrompt } from './one-shot-prompt';
import { parseJsonObject } from './parse-model-json';
import { getProject } from './project-get';
import { resolveBundledPromptPath } from './resource-paths';
import { readStore } from './ui-prefs-store';
import type { LanguageAidResult } from '../../../types';

// Pinned to Haiku for the same reasons as drafts:check — these calls fire
// per hover, must come back in well under two seconds, and don't need
// reasoning. The bundled prompt asks for a strict JSON object.
const MODEL = 'claude-haiku-4-5-20251001';

// Defensive caps so a paste-bomb sentence/paragraph can't push a single
// hover into a giant prompt.
const MAX_WORD_BYTES = 200;
const MAX_SENTENCE_BYTES = 2_000;
const MAX_PARAGRAPH_BYTES = 4_000;

export type RunInput = {
	projectId: string;
	word: string;
	sentence: string;
	paragraph?: string;
};

const WireResult = z.object( {
	partOfSpeech: z.union( [ z.string(), z.null() ] ).optional(),
	definition: z.union( [ z.string(), z.null() ] ).optional(),
	explanation: z.string(),
	synonyms: z.array( z.string() ).optional(),
	rewrites: z.array( z.string() ).optional(),
	issue: z.union( [ z.string(), z.null() ] ).optional(),
	suggestion: z.union( [ z.string(), z.null() ] ).optional(),
} );

// Kept under the historical name; the object-extraction logic is shared
// with the checks runner and Coach via parse-model-json.
export const parseLanguageAidOutput = parseJsonObject;

function clip( value: string | undefined, max: number ): string {
	if ( ! value ) {
		return '';
	}
	return value.length > max ? value.slice( 0, max ) : value;
}

function buildResult( patch: Partial< LanguageAidResult > ): LanguageAidResult {
	return {
		partOfSpeech: patch.partOfSpeech ?? null,
		definition: patch.definition ?? null,
		explanation: patch.explanation ?? '',
		synonyms: patch.synonyms ?? [],
		rewrites: patch.rewrites ?? [],
		issue: patch.issue ?? null,
		suggestion: patch.suggestion ?? null,
		error: patch.error ?? null,
	};
}

export async function runLanguageAid(
	input: RunInput
): Promise< LanguageAidResult > {
	const project = getProject( input.projectId );
	if ( ! project ) {
		return buildResult( { error: 'project-not-found' } );
	}
	const word = clip( input.word, MAX_WORD_BYTES ).trim();
	if ( ! word ) {
		return buildResult( { error: 'empty-word' } );
	}

	const authMode = readStore().authMode ?? 'api-key';
	if ( authMode === 'api-key' && ! readApiKey() ) {
		return buildResult( {
			error: 'Set your Anthropic API key in Settings to use the language aid.',
		} );
	}
	if (
		authMode === 'claude-code' &&
		! getCachedClaudeAuthStatus().signedIn
	) {
		return buildResult( {
			error: 'Sign in to Claude in Settings to use the language aid.',
		} );
	}

	const promptPath = resolveBundledPromptPath( 'language-aid.txt' );
	const prompt = loadPrompt( promptPath, {
		word,
		sentence: clip( input.sentence, MAX_SENTENCE_BYTES ),
		paragraph: clip( input.paragraph, MAX_PARAGRAPH_BYTES ),
	} );

	let raw: string;
	try {
		raw = await runOneShotPrompt( prompt, {
			cwd: project.path,
			model: MODEL,
		} );
	} catch ( err ) {
		return buildResult( {
			error: err instanceof Error ? err.message : 'request-failed',
		} );
	}
	if ( ! raw ) {
		return buildResult( { error: 'empty model response' } );
	}

	let parsed: unknown;
	try {
		parsed = parseLanguageAidOutput( raw );
	} catch {
		return buildResult( { error: 'parse-failed' } );
	}
	const validated = WireResult.safeParse( parsed );
	if ( ! validated.success ) {
		return buildResult( { error: 'invalid-schema' } );
	}
	return buildResult( {
		partOfSpeech: validated.data.partOfSpeech ?? null,
		// De-dash the generated prose so the coach's own output doesn't carry
		// the AI tell it flags elsewhere.
		definition: validated.data.definition
			? deDash( validated.data.definition )
			: null,
		explanation: deDash( validated.data.explanation ),
		synonyms: validated.data.synonyms ?? [],
		rewrites: ( validated.data.rewrites ?? [] ).map( deDash ),
		issue: validated.data.issue ?? null,
		suggestion: validated.data.suggestion ?? null,
	} );
}
