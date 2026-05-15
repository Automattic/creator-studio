import React from 'react';

import { hueFromString } from './hueFromString';

// Curated palette of 12 perceptually-distinct hues. Hashing directly into
// `hue % 360` can put two checks within 10° of each other — close enough
// that the dot color reads as identical at sidebar scale. Indexing into a
// hand-spaced palette guarantees a minimum separation while keeping the
// mapping deterministic per check filename.
//
// Saturation/lightness are paired per slot so a few hues that look muddy
// at the default 72/52 (yellow especially) get a richer treatment without
// breaking the visual family.
const CHECK_PALETTE: ReadonlyArray< { h: number; s: number; l: number } > = [
	{ h: 0, s: 76, l: 56 }, // red
	{ h: 28, s: 86, l: 54 }, // orange
	{ h: 50, s: 88, l: 48 }, // amber
	{ h: 95, s: 60, l: 44 }, // olive green
	{ h: 140, s: 60, l: 42 }, // forest green
	{ h: 168, s: 70, l: 42 }, // teal
	{ h: 195, s: 78, l: 46 }, // sky blue
	{ h: 222, s: 72, l: 54 }, // blue
	{ h: 258, s: 64, l: 58 }, // indigo
	{ h: 285, s: 64, l: 56 }, // purple
	{ h: 320, s: 72, l: 54 }, // magenta
	{ h: 348, s: 76, l: 56 }, // pink
];

// Stable HSL accent for a check, drawn from CHECK_PALETTE. Same input
// always produces the same color; different checks land in distinct
// palette slots (collisions only when the hash + palette size happen to
// coincide, which the curated spacing minimises).
export function checkColor( relPath: string ): string {
	const slot = hueFromString( relPath ) % CHECK_PALETTE.length;
	const { h, s, l } = CHECK_PALETTE[ slot ];
	return `hsl(${ h } ${ s }% ${ l }%)`;
}

export function checkColorSoft( relPath: string ): string {
	const slot = hueFromString( relPath ) % CHECK_PALETTE.length;
	const { h, s, l } = CHECK_PALETTE[ slot ];
	return `hsl(${ h } ${ s }% ${ l }% / 0.14)`;
}

// CSS variable bag the components attach via `style={...}` so the editor
// underline, the popover rail, and the panel dots all read the same
// accent. Use this any time a check's color needs to flow through CSS.
export function checkColorStyle( relPath: string ): React.CSSProperties {
	return {
		[ '--check-color' as string ]: checkColor( relPath ),
		[ '--check-color-soft' as string ]: checkColorSoft( relPath ),
	};
}

// Inline `style` string for places that can't accept a React style object
// (e.g. CodeMirror's `Decoration.mark({ attributes: { style: ... } })`).
export function checkColorStyleString( relPath: string ): string {
	return `--check-color: ${ checkColor(
		relPath
	) }; --check-color-soft: ${ checkColorSoft( relPath ) };`;
}
