import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { app, dialog, type BrowserWindow } from 'electron';

import type { Folder } from '../../types';

type StoredFolder = Folder & { name?: string; goal?: string };
type FoldersFile = {
	folders: StoredFolder[];
};

function storePath(): string {
	return path.join( app.getPath( 'userData' ), 'folders.json' );
}

function migrate( raw: StoredFolder ): Folder {
	// Pre-modal records were { id, path, label } only. Backfill `name` from
	// `label` so old setups keep working without a separate migration step.
	return {
		id: raw.id,
		path: raw.path,
		label: raw.label,
		name: raw.name && raw.name.length > 0 ? raw.name : raw.label,
		goal: raw.goal,
	};
}

function readStore(): { folders: Folder[] } {
	const file = storePath();
	if ( ! fs.existsSync( file ) ) {
		return { folders: [] };
	}
	try {
		const parsed = JSON.parse(
			fs.readFileSync( file, 'utf-8' )
		) as FoldersFile;
		if ( ! Array.isArray( parsed.folders ) ) {
			return { folders: [] };
		}
		return { folders: parsed.folders.map( migrate ) };
	} catch {
		return { folders: [] };
	}
}

function writeStore( data: { folders: Folder[] } ): void {
	const file = storePath();
	fs.mkdirSync( path.dirname( file ), { recursive: true } );
	fs.writeFileSync( file, JSON.stringify( data, null, 2 ), 'utf-8' );
}

export function listFolders(): Folder[] {
	return readStore().folders;
}

export function getFolder( id: string ): Folder | null {
	return readStore().folders.find( ( f ) => f.id === id ) ?? null;
}

export async function pickFolderPath(
	parent: BrowserWindow | null
): Promise< string | null > {
	const result = parent
		? await dialog.showOpenDialog( parent, {
				properties: [ 'openDirectory', 'createDirectory' ],
		  } )
		: await dialog.showOpenDialog( {
				properties: [ 'openDirectory', 'createDirectory' ],
		  } );
	if ( result.canceled || result.filePaths.length === 0 ) {
		return null;
	}
	return result.filePaths[ 0 ];
}

// Always writes a new record. Two projects on the same path are allowed
// (different name + goal). The renderer is responsible for the duplicate UX.
export function createFolder( input: {
	path: string;
	name: string;
	goal?: string;
} ): Folder {
	const store = readStore();
	const folder: Folder = {
		id: randomUUID(),
		path: input.path,
		label: path.basename( input.path ),
		name: input.name,
		goal: input.goal,
	};
	store.folders.push( folder );
	writeStore( store );
	return folder;
}

export function removeFolder( id: string ): void {
	const store = readStore();
	store.folders = store.folders.filter( ( f ) => f.id !== id );
	writeStore( store );
}
