import fs from 'node:fs';
import path from 'node:path';

import type { WebContents } from 'electron';

// fs.writeFile typically fires two `change` events on macOS (truncate +
// content). 50 ms is short enough to feel instant in the editor, long enough
// to coalesce that pair plus the trailing rename of an atomic-write editor.
const DEBOUNCE_MS = 50;

type Subscription = {
	dir: string;
	basename: string;
	watcher: fs.FSWatcher;
	timer: ReturnType< typeof setTimeout > | null;
	onChange: ( mtime: number | null ) => void;
};

// One subscription per webContents. The draft editor only ever watches the
// currently-open draft, and switching drafts replaces the prior subscription
// — so a single slot is sufficient and avoids leaking on rapid switches.
const subscriptions = new Map< WebContents, Subscription >();

function close( sub: Subscription ): void {
	if ( sub.timer ) {
		clearTimeout( sub.timer );
		sub.timer = null;
	}
	try {
		sub.watcher.close();
	} catch {
		// fs.FSWatcher.close throws if already closed; safe to swallow.
	}
}

export function unsubscribe( webContents: WebContents ): void {
	const existing = subscriptions.get( webContents );
	if ( ! existing ) {
		return;
	}
	close( existing );
	subscriptions.delete( webContents );
}

// Watch a single file by watching its parent directory and filtering by
// basename. Watching the directory (rather than the file inode) survives
// atomic-rename writes — common for editors that write a temp file then
// rename it into place. On change, we stat the file and call onChange with
// the new mtime, or null if the file is gone.
export function subscribe(
	webContents: WebContents,
	absoluteFilePath: string,
	onChange: ( mtime: number | null ) => void
): void {
	unsubscribe( webContents );

	const dir = path.dirname( absoluteFilePath );
	const basename = path.basename( absoluteFilePath );
	const sub: Subscription | null = ( (): Subscription | null => {
		try {
			const watcher = fs.watch( dir, { persistent: false } );
			return {
				dir,
				basename,
				watcher,
				timer: null,
				onChange,
			};
		} catch {
			// Directory missing or inaccessible — silently no-op. The next
			// reload still flows through the normal load effect on remount.
			return null;
		}
	} )();
	if ( ! sub ) {
		return;
	}

	const fire = (): void => {
		sub.timer = null;
		fs.stat( absoluteFilePath, ( err, stat ) => {
			if ( webContents.isDestroyed() ) {
				return;
			}
			if ( err || ! stat.isFile() ) {
				onChange( null );
				return;
			}
			onChange( stat.mtimeMs );
		} );
	};

	sub.watcher.on( 'change', ( _eventType, filename ) => {
		// `filename` may be null on some platforms; if so, fire anyway. If
		// present, only react to the file we care about.
		if ( filename && filename !== basename ) {
			return;
		}
		if ( sub.timer ) {
			clearTimeout( sub.timer );
		}
		sub.timer = setTimeout( fire, DEBOUNCE_MS );
	} );
	sub.watcher.on( 'error', () => {
		// Surface as deletion: caller can decide to stop watching or retry.
		unsubscribe( webContents );
	} );

	subscriptions.set( webContents, sub );

	const cleanup = (): void => unsubscribe( webContents );
	webContents.once( 'destroyed', cleanup );
}
