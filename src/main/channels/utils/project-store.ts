import fs from 'node:fs';
import path from 'node:path';

import { app } from 'electron';

import type { Project } from '../../../types';

type StoredProject = Project & { name?: string; goal?: string };
type ProjectsFile = { projects: StoredProject[] };

export function storePath(): string {
	return path.join( app.getPath( 'userData' ), 'projects.json' );
}

// Pre-modal records were { id, path, label } only. Backfill `name` from
// `label` so old setups keep working without a separate migration step.
function migrate( raw: StoredProject ): Project {
	return {
		id: raw.id,
		path: raw.path,
		label: raw.label,
		name: raw.name && raw.name.length > 0 ? raw.name : raw.label,
		goal: raw.goal,
	};
}

export function readStore(): { projects: Project[] } {
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

export function writeStore( data: { projects: Project[] } ): void {
	const file = storePath();
	fs.mkdirSync( path.dirname( file ), { recursive: true } );
	fs.writeFileSync( file, JSON.stringify( data, null, 2 ), 'utf-8' );
}
