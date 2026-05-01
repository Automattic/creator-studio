// Persists the editor cursor offset and scroll position per draft so users
// return to where they left off. Renderer-only; uses localStorage for speed.
// localStorage gets cleared with the Chromium profile, which on this app
// resets only when the user runs `rm -rf .userData` — acceptable.

const KEY_PREFIX = 'draftCursor:';

export type DraftCursorMemo = {
	cursor: number;
	scrollTop: number;
};

function key( projectId: string, relPath: string ): string {
	return `${ KEY_PREFIX }${ projectId }:${ relPath }`;
}

export function readMemo(
	projectId: string,
	relPath: string
): DraftCursorMemo | null {
	try {
		const raw = window.localStorage.getItem( key( projectId, relPath ) );
		if ( ! raw ) {
			return null;
		}
		const parsed = JSON.parse( raw ) as Partial< DraftCursorMemo >;
		if (
			typeof parsed.cursor !== 'number' ||
			typeof parsed.scrollTop !== 'number'
		) {
			return null;
		}
		return { cursor: parsed.cursor, scrollTop: parsed.scrollTop };
	} catch {
		return null;
	}
}

export function writeMemo(
	projectId: string,
	relPath: string,
	memo: DraftCursorMemo
): void {
	try {
		window.localStorage.setItem(
			key( projectId, relPath ),
			JSON.stringify( memo )
		);
	} catch {
		// Storage quota / disabled — silently drop. The fallback (cursor at
		// end of doc) still gives the user a sensible landing spot.
	}
}
