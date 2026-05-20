// Local, dependency-free readability estimate for the Coach summary strip.
// Uses the Flesch–Kincaid grade-level formula over rough word/sentence/
// syllable counts. It's an estimate, not a linguistics engine — good enough
// to say "this reads around grade 8". Computed in the renderer so it updates
// live as the user types, with no AI call.

export type Readability = {
	grade: number; // Flesch–Kincaid grade level, clamped to >= 1.
	words: number;
	sentences: number;
};

// Vowel-group heuristic with a few common adjustments. Not perfect, but
// stable and cheap. Short words count as one syllable.
export function countSyllables( word: string ): number {
	const w = word.toLowerCase().replace( /[^a-z]/g, '' );
	if ( ! w ) {
		return 0;
	}
	if ( w.length <= 3 ) {
		return 1;
	}
	const trimmed = w
		.replace( /(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '' )
		.replace( /^y/, '' );
	const groups = trimmed.match( /[aeiouy]{1,2}/g );
	return groups ? groups.length : 1;
}

export function readability( text: string ): Readability | null {
	// Strip the most common markdown punctuation so it doesn't inflate counts.
	const clean = text.replace( /[#>*_`~[\]()!]/g, ' ' );
	const words = clean.match( /[A-Za-z0-9']+/g ) ?? [];
	const wordCount = words.length;
	if ( wordCount < 3 ) {
		return null;
	}
	// Sentence terminators; fall back to one sentence for a single line.
	const sentences = Math.max(
		1,
		( clean.match( /[.!?]+(?:\s|$)/g ) ?? [] ).length
	);
	let syllables = 0;
	for ( const word of words ) {
		syllables += countSyllables( word );
	}
	const grade =
		0.39 * ( wordCount / sentences ) +
		11.8 * ( syllables / wordCount ) -
		15.59;
	return {
		grade: Math.max( 1, Math.round( grade ) ),
		words: wordCount,
		sentences,
	};
}
