import fs from 'node:fs';
import path from 'node:path';

import type { WebContents } from 'electron';

// Mirror the single-file watcher's debounce. Coalesces the multi-event
// bursts that fs.writeFile produces on macOS (truncate + content) and the
// trailing rename of atomic-write editors.
const DEBOUNCE_MS = 50;
// When the target folder is missing we watch the parent and poll for the
// folder to appear. Polling cadence is intentionally generous — folders
// here (`checks/`) come into existence at most once per project life.
const PARENT_POLL_MS = 1_000;

type Subscription = {
	dir: string;
	watcher: fs.FSWatcher | null;
	parentTimer: ReturnType< typeof setInterval > | null;
	debounceTimer: ReturnType< typeof setTimeout > | null;
	onChange: () => void;
};

const subscriptions = new Map< WebContents, Subscription >();

function closeSubscription( sub: Subscription ): void {
	if ( sub.debounceTimer ) {
		clearTimeout( sub.debounceTimer );
		sub.debounceTimer = null;
	}
	if ( sub.parentTimer ) {
		clearInterval( sub.parentTimer );
		sub.parentTimer = null;
	}
	if ( sub.watcher ) {
		try {
			sub.watcher.close();
		} catch {
			// FSWatcher.close throws if already closed.
		}
		sub.watcher = null;
	}
}

export function unsubscribeFolder( webContents: WebContents ): void {
	const existing = subscriptions.get( webContents );
	if ( ! existing ) {
		return;
	}
	closeSubscription( existing );
	subscriptions.delete( webContents );
}

function startWatcher( sub: Subscription, webContents: WebContents ): boolean {
	try {
		const watcher = fs.watch( sub.dir, { persistent: false } );
		sub.watcher = watcher;
		const fire = (): void => {
			sub.debounceTimer = null;
			if ( ! webContents.isDestroyed() ) {
				sub.onChange();
			}
		};
		watcher.on( 'change', () => {
			if ( sub.debounceTimer ) {
				clearTimeout( sub.debounceTimer );
			}
			sub.debounceTimer = setTimeout( fire, DEBOUNCE_MS );
		} );
		watcher.on( 'rename', () => {
			if ( sub.debounceTimer ) {
				clearTimeout( sub.debounceTimer );
			}
			sub.debounceTimer = setTimeout( fire, DEBOUNCE_MS );
		} );
		watcher.on( 'error', () => {
			closeSubscription( sub );
			pollForFolder( sub, webContents );
		} );
		return true;
	} catch {
		return false;
	}
}

function pollForFolder( sub: Subscription, webContents: WebContents ): void {
	if ( sub.parentTimer ) {
		return;
	}
	sub.parentTimer = setInterval( () => {
		if ( webContents.isDestroyed() ) {
			closeSubscription( sub );
			subscriptions.delete( webContents );
			return;
		}
		if ( ! fs.existsSync( sub.dir ) ) {
			return;
		}
		// Folder showed up — switch to direct watching and surface a
		// synthetic change so the renderer pulls the fresh list.
		if ( sub.parentTimer ) {
			clearInterval( sub.parentTimer );
			sub.parentTimer = null;
		}
		if ( startWatcher( sub, webContents ) ) {
			sub.onChange();
		}
	}, PARENT_POLL_MS );
}

// Subscribe to "something inside this folder changed" events. The watcher
// emits an opaque change ping (no per-file event-kind) and the caller is
// expected to re-list. If the folder doesn't exist, we poll its parent and
// switch to direct watching once it appears (covers the case where
// `checks:resetDefaults` or `checks:create` mints the folder lazily).
export function subscribeFolder(
	webContents: WebContents,
	absoluteFolderPath: string,
	onChange: () => void
): void {
	unsubscribeFolder( webContents );

	const sub: Subscription = {
		dir: path.resolve( absoluteFolderPath ),
		watcher: null,
		parentTimer: null,
		debounceTimer: null,
		onChange,
	};
	subscriptions.set( webContents, sub );

	if ( fs.existsSync( sub.dir ) ) {
		if ( ! startWatcher( sub, webContents ) ) {
			pollForFolder( sub, webContents );
		}
	} else {
		pollForFolder( sub, webContents );
	}

	webContents.once( 'destroyed', () => unsubscribeFolder( webContents ) );
}
