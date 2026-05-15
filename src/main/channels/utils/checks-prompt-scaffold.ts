// Standardized scaffolding the runner wraps around every user-authored
// check body. The user's check file describes WHAT to look for; the
// scaffold supplies the JSON contract and the slot for the draft text.
// Two placeholders keep the user's body free of `{{body}}`, which would
// otherwise clash with the draft slot if a user wrote a check about
// templating syntax.
export const CHECKS_PROMPT_SCAFFOLD = `You are a writing check. Read the draft below and flag passages that match the criteria the editor configured for this check. Respond with a JSON array only — no prose, no code fences. Each entry must be an object with exactly these fields:

-   "original": the exact substring from the draft to replace (must appear verbatim, character-for-character).
-   "replacement": the substring to insert in its place. May be the empty string for a pure deletion.
-   "message": a one-sentence explanation.

Do not flag the same passage twice. If nothing matches, return [].

Check criteria:

{{body}}

Draft:

{{draft}}
`;

export function buildCheckPrompt( body: string, draft: string ): string {
	return CHECKS_PROMPT_SCAFFOLD.replace( '{{body}}', body ).replace(
		'{{draft}}',
		draft
	);
}
