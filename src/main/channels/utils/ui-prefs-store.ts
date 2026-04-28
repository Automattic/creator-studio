import fs from 'node:fs';
import path from 'node:path';

import { app } from 'electron';

import type { UiPrefs } from '../../../types';

const DEFAULTS: UiPrefs = {
	resourcesPanelOpen: true,
};

export function storePath(): string {
	return path.join( app.getPath( 'userData' ), 'ui-prefs.json' );
}

export function readStore(): UiPrefs {
	const file = storePath();
	if ( ! fs.existsSync( file ) ) {
		return { ...DEFAULTS };
	}
	try {
		const parsed = JSON.parse(
			fs.readFileSync( file, 'utf-8' )
		) as Partial< Record< keyof UiPrefs, unknown > >;
		return {
			resourcesPanelOpen:
				typeof parsed.resourcesPanelOpen === 'boolean'
					? parsed.resourcesPanelOpen
					: DEFAULTS.resourcesPanelOpen,
		};
	} catch {
		return { ...DEFAULTS };
	}
}

export function writeStore( patch: Partial< UiPrefs > ): UiPrefs {
	const next: UiPrefs = { ...readStore(), ...patch };
	const file = storePath();
	fs.mkdirSync( path.dirname( file ), { recursive: true } );
	fs.writeFileSync( file, JSON.stringify( next, null, 2 ), 'utf-8' );
	return next;
}
