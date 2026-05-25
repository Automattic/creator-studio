// Word-level diff for previewing a rewrite before applying it. Tokenizes on
// whitespace (keeping the spaces as tokens so the text reconstructs exactly),
// runs a standard LCS, and returns runs of unchanged / removed / added text.
// Used by the Coach rewrite card to show "before → after" inline.

export type DiffPart = { type: 'same' | 'del' | 'add'; text: string };

function tokenize( s: string ): string[] {
	return s.split( /(\s+)/ ).filter( ( t ) => t !== '' );
}

export function wordDiff( before: string, after: string ): DiffPart[] {
	const a = tokenize( before );
	const b = tokenize( after );
	const n = a.length;
	const m = b.length;

	// dp[i][j] = LCS length of a[i:] and b[j:].
	const dp: number[][] = Array.from( { length: n + 1 }, () =>
		new Array( m + 1 ).fill( 0 )
	);
	for ( let i = n - 1; i >= 0; i-- ) {
		for ( let j = m - 1; j >= 0; j-- ) {
			dp[ i ][ j ] =
				a[ i ] === b[ j ]
					? dp[ i + 1 ][ j + 1 ] + 1
					: Math.max( dp[ i + 1 ][ j ], dp[ i ][ j + 1 ] );
		}
	}

	const raw: DiffPart[] = [];
	let i = 0;
	let j = 0;
	while ( i < n && j < m ) {
		if ( a[ i ] === b[ j ] ) {
			raw.push( { type: 'same', text: a[ i ] } );
			i++;
			j++;
		} else if ( dp[ i + 1 ][ j ] >= dp[ i ][ j + 1 ] ) {
			raw.push( { type: 'del', text: a[ i ] } );
			i++;
		} else {
			raw.push( { type: 'add', text: b[ j ] } );
			j++;
		}
	}
	while ( i < n ) {
		raw.push( { type: 'del', text: a[ i++ ] } );
	}
	while ( j < m ) {
		raw.push( { type: 'add', text: b[ j++ ] } );
	}

	// Merge adjacent runs of the same type so rendering is compact.
	const out: DiffPart[] = [];
	for ( const part of raw ) {
		const last = out[ out.length - 1 ];
		if ( last && last.type === part.type ) {
			last.text += part.text;
		} else {
			out.push( { ...part } );
		}
	}
	return out;
}
