import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { app, dialog, type BrowserWindow } from 'electron';

export type Folder = {
	id: string;
	path: string;
	label: string;
};

type FoldersFile = {
	folders: Folder[];
};

function storePath(): string {
	return path.join( app.getPath( 'userData' ), 'folders.json' );
}

function readStore(): FoldersFile {
	const file = storePath();
	if ( ! fs.existsSync( file ) ) {
		return { folders: [] };
	}
	try {
		const raw = fs.readFileSync( file, 'utf-8' );
		const parsed = JSON.parse( raw ) as FoldersFile;
		if ( ! Array.isArray( parsed.folders ) ) {
			return { folders: [] };
		}
		return parsed;
	} catch {
		return { folders: [] };
	}
}

function writeStore( data: FoldersFile ): void {
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

export async function addFolder(
	parent: BrowserWindow | null
): Promise< Folder | null > {
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
	const chosen = result.filePaths[ 0 ];
	const store = readStore();
	const existing = store.folders.find( ( f ) => f.path === chosen );
	if ( existing ) {
		return existing;
	}
	const folder: Folder = {
		id: randomUUID(),
		path: chosen,
		label: path.basename( chosen ),
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
