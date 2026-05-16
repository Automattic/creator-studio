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

// Prepended to the user's check body when the check is the voice check
// (`voice: true` in its frontmatter). Two jobs: define what "voice" means
// so the model evaluates against the right axis, and tell it to bail when
// the body has no real voice yet (the bundled default is a placeholder).
export const VOICE_CHECK_PROMPT_PREFIX = `This is the **voice check**. "Voice" means the user's writing style — tone, sentence rhythm, vocabulary, structural preferences, idioms, formality. The criteria below describe that voice and usually include short verbatim examples.

Be conservative: only flag passages where the draft clearly violates the voice — wrong register, opposite tone, alien vocabulary, structural patterns the voice rejects. Do not flag minor stylistic variation, taste-level disagreements, or anything the voice description does not explicitly cover.

If the voice description below is empty, a placeholder ("No voice defined yet…"), or too vague to evaluate against, return an empty JSON array — there is nothing to check against.

--- Voice criteria ---

`;

export function buildCheckPrompt(
	body: string,
	draft: string,
	options: { voice?: boolean } = {}
): string {
	const effectiveBody = options.voice
		? VOICE_CHECK_PROMPT_PREFIX + body
		: body;
	return CHECKS_PROMPT_SCAFFOLD.replace( '{{body}}', effectiveBody ).replace(
		'{{draft}}',
		draft
	);
}
