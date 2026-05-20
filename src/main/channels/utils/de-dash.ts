// Em/en dashes are a strong "AI wrote this" tell, and Coach flags them in
// users' drafts — so the tool's own generated prose must not contain them.
// Models don't reliably honor a "no dashes" instruction, so we strip them
// deterministically: a dash (with any surrounding spaces) becomes a comma.
// Applied to generated prose only (rewrites, explanations, tips) — never to
// `original`, which must stay verbatim for offset anchoring.
export function deDash( value: string ): string {
	return value
		.replace( /\s*[—–]\s*/g, ', ' )
		.replace( /,\s*,/g, ',' )
		.trim();
}
