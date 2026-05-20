// Summary stats for jsdiff parts. "edits" counts distinct change regions: any
// run of consecutive `added`/`removed` parts collapses into one edit, so a
// replacement (`removed: old` followed by `added: new`) is one edit, not two.
// Added/removed counters are word totals — whitespace-delimited tokens after
// trimming, so trailing/leading whitespace doesn't inflate the numbers.

export type DiffPart = {
	value: string;
	added?: boolean;
	removed?: boolean;
};

export type DiffStats = {
	edits: number;
	added: number;
	removed: number;
};

function countWords( value: string ): number {
	const trimmed = value.trim();
	if ( trimmed.length === 0 ) {
		return 0;
	}
	return trimmed.split( /\s+/ ).length;
}

export function computeDiffStats( parts: readonly DiffPart[] ): DiffStats {
	let edits = 0;
	let added = 0;
	let removed = 0;
	let inEdit = false;
	for ( const part of parts ) {
		if ( part.added || part.removed ) {
			if ( ! inEdit ) {
				edits++;
				inEdit = true;
			}
			if ( part.added ) {
				added += countWords( part.value );
			} else {
				removed += countWords( part.value );
			}
		} else {
			inEdit = false;
		}
	}
	return { edits, added, removed };
}
