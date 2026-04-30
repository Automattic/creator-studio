import fs from 'node:fs';
import path from 'node:path';

import { getProject } from './project-get';
import type { ProjectUiPrefs } from '../../../types';

const STORE_DIR = '.studio-write';
const FILE = 'ui-prefs.json';

const DEFAULTS: ProjectUiPrefs = {
	resourcesCollapsed: {},
};

function storePath( projectPath: string ): string {
	return path.join( projectPath, STORE_DIR, FILE );
}

function normalize( raw: unknown ): ProjectUiPrefs {
	if ( ! raw || typeof raw !== 'object' ) {
		return { ...DEFAULTS };
	}
	const obj = raw as { resourcesCollapsed?: unknown };
	const collapsed: Record< string, boolean > = {};
	if (
		obj.resourcesCollapsed &&
		typeof obj.resourcesCollapsed === 'object'
	) {
		for ( const [ k, v ] of Object.entries(
			obj.resourcesCollapsed as Record< string, unknown >
		) ) {
			if ( typeof v === 'boolean' ) {
				collapsed[ k ] = v;
			}
		}
	}
	return { resourcesCollapsed: collapsed };
}

export function readProjectUiPrefs( projectId: string ): ProjectUiPrefs {
	const project = getProject( projectId );
	if ( ! project ) {
		return { ...DEFAULTS };
	}
	const file = storePath( project.path );
	if ( ! fs.existsSync( file ) ) {
		return { ...DEFAULTS };
	}
	try {
		return normalize( JSON.parse( fs.readFileSync( file, 'utf-8' ) ) );
	} catch {
		return { ...DEFAULTS };
	}
}

export function writeProjectUiPrefs(
	projectId: string,
	patch: Partial< ProjectUiPrefs >
): ProjectUiPrefs {
	const project = getProject( projectId );
	if ( ! project ) {
		return { ...DEFAULTS };
	}
	const current = readProjectUiPrefs( projectId );
	const next: ProjectUiPrefs = {
		resourcesCollapsed: {
			...current.resourcesCollapsed,
			...( patch.resourcesCollapsed ?? {} ),
		},
	};
	const file = storePath( project.path );
	fs.mkdirSync( path.dirname( file ), { recursive: true } );
	fs.writeFileSync( file, JSON.stringify( next, null, 2 ), 'utf-8' );
	return next;
}
