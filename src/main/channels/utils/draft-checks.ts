import { randomUUID } from 'node:crypto';

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

// Until the real model wiring lands, return canned issues per check so the
// panel + decorations + popover can be exercised end-to-end. The fixtures
// only hit when the relevant snippet actually appears in the body; otherwise
// the result is empty for that check.
const FIXTURES: Record<
	DraftCheckKind,
	ReadonlyArray< { original: string; replacement: string; message: string } >
> = {
	'grammar-spelling': [
		{
			original: 'waves was',
			replacement: 'waves were',
			message: 'Subject–verb agreement: plural subject takes "were".',
		},
		{
			original: 'collaboraion',
			replacement: 'collaboration',
			message: 'Spelling: "collaboraion" → "collaboration".',
		},
	],
	brevity: [
		{
			original: 'in order to',
			replacement: 'to',
			message: '"In order to" can almost always be shortened to "to".',
		},
	],
	'passive-voice': [
		{
			original: 'was touched',
			replacement: 'touched',
			message: 'Passive voice; prefer the active form.',
		},
	],
};

function locateFirst(
	body: string,
	snippet: string
): { from: number; to: number } | null {
	const idx = body.indexOf( snippet );
	if ( idx === -1 ) {
		return null;
	}
	return { from: idx, to: idx + snippet.length };
}

export async function runDraftChecks(
	input: RunInput
): Promise< DraftCheckResult[] > {
	const { body, checks } = input;
	const trimmed = body.trim();
	if ( trimmed.length === 0 ) {
		return checks.map( ( kind ) => ( { kind, issues: [], error: null } ) );
	}
	return checks.map( ( kind ): DraftCheckResult => {
		const issues: DraftCheckIssue[] = [];
		for ( const fixture of FIXTURES[ kind ] ) {
			const range = locateFirst( body, fixture.original );
			if ( ! range ) {
				continue;
			}
			issues.push( {
				id: randomUUID(),
				kind,
				from: range.from,
				to: range.to,
				original: fixture.original,
				replacement: fixture.replacement,
				message: fixture.message,
			} );
		}
		return { kind, issues, error: null };
	} );
}
