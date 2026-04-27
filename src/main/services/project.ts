import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { app, dialog, type BrowserWindow } from 'electron';

import type { Project } from '../../types';

type StoredProject = Project & { name?: string; goal?: string };
type ProjectsFile = {
	projects: StoredProject[];
};

function storePath(): string {
	return path.join( app.getPath( 'userData' ), 'projects.json' );
}

function migrate( raw: StoredProject ): Project {
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

function readStore(): { projects: Project[] } {
	const file = storePath();
	if ( ! fs.existsSync( file ) ) {
		return { projects: [] };
	}
	try {
		const parsed = JSON.parse(
			fs.readFileSync( file, 'utf-8' )
		) as ProjectsFile;
		if ( ! Array.isArray( parsed.projects ) ) {
			return { projects: [] };
		}
		return { projects: parsed.projects.map( migrate ) };
	} catch {
		return { projects: [] };
	}
}

function writeStore( data: { projects: Project[] } ): void {
	const file = storePath();
	fs.mkdirSync( path.dirname( file ), { recursive: true } );
	fs.writeFileSync( file, JSON.stringify( data, null, 2 ), 'utf-8' );
}

export function listProjects(): Project[] {
	return readStore().projects;
}

export function getProject( id: string ): Project | null {
	return readStore().projects.find( ( p ) => p.id === id ) ?? null;
}

export async function pickProjectPath(
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
export function createProject( input: {
	path: string;
	name: string;
	goal?: string;
} ): Project {
	const store = readStore();
	const project: Project = {
		id: randomUUID(),
		path: input.path,
		label: path.basename( input.path ),
		name: input.name,
		goal: input.goal,
	};
	store.projects.push( project );
	writeStore( store );
	return project;
}

export function removeProject( id: string ): void {
	const store = readStore();
	store.projects = store.projects.filter( ( p ) => p.id !== id );
	writeStore( store );
}
