import type { CoachIssue } from '../../types';

// The ids of every AI-tell finding, for the one-pass "Humanize all" action
// (which bulk-applies them through the existing apply pipeline). Only the
// `ai` lens; never grammar/style/voice findings.
export function aiTellIds( issues: ReadonlyArray< CoachIssue > ): string[] {
	return issues.filter( ( i ) => i.category === 'ai' ).map( ( i ) => i.id );
}
