// Pure slug helper, importable from main and renderer alike. The
// fs-touching disambiguator (`pickAvailableSlug`) lives next door in
// draft-slug.ts; this file deliberately has no node imports so the
// renderer can compute previews without dragging fs/path into the bundle.

const MAX_SLUG_LENGTH = 60;

// Returns the slug, or null when nothing alphanumeric survives sanitization
// (all emoji/punctuation/whitespace). Callers should leave the existing
// filename alone in that case rather than fall back to a generic name and
// risk colliding with the next-created draft.
export function slugifyTitle( title: string ): string | null {
	const normalized = title.normalize( 'NFKD' ).replace( /[̀-ͯ]/g, '' );
	const lower = normalized.toLowerCase();
	const dashed = lower.replace( /[\s_]+/g, '-' );
	const stripped = dashed.replace( /[^a-z0-9-]/g, '' );
	const collapsed = stripped.replace( /-+/g, '-' );
	const trimmed = collapsed.replace( /^-+|-+$/g, '' );
	if ( trimmed.length === 0 ) {
		return null;
	}
	if ( trimmed.length <= MAX_SLUG_LENGTH ) {
		return trimmed;
	}
	const cut = trimmed.slice( 0, MAX_SLUG_LENGTH );
	const lastHyphen = cut.lastIndexOf( '-' );
	const at = lastHyphen >= MAX_SLUG_LENGTH / 2 ? lastHyphen : MAX_SLUG_LENGTH;
	const finalCut = cut.slice( 0, at ).replace( /-+$/, '' );
	return finalCut.length > 0 ? finalCut : null;
}
