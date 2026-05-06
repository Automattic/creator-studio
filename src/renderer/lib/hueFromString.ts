// Deterministic hue (0–359) for any input string. Used by the project-initial
// avatar in the Same project sidebar so the same project always renders with
// the same color across mounts. Tiny FNV-1a hash — keeps the helper
// dependency-free.
/* eslint-disable no-bitwise */
export function hueFromString( s: string ): number {
	let h = 0x811c9dc5;
	for ( let i = 0; i < s.length; i++ ) {
		h ^= s.charCodeAt( i );
		h = Math.imul( h, 0x01000193 );
	}
	return ( h >>> 0 ) % 360;
}
/* eslint-enable no-bitwise */
