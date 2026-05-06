import fs from 'node:fs';
import path from 'node:path';

import { getProject } from './project-get';
import type {
	ProjectUiPrefs,
	ResourcesShowFilter,
	ResourcesSort,
} from '../../../types';

const STORE_DIR = '.studio-write';
const FILE = 'ui-prefs.json';

const SORT_VALUES: readonly ResourcesSort[] = [
	'recent',
	'oldest',
	'name-asc',
	'name-desc',
];

const DEFAULT_SHOW: ResourcesShowFilter = {
	folders: true,
	text: true,
	images: true,
	pdf: true,
	video: true,
	other: true,
};

const DEFAULTS: ProjectUiPrefs = {
	resourcesCollapsed: {},
	resourcesSort: 'recent',
	resourcesShow: { ...DEFAULT_SHOW },
};

function storePath( projectPath: string ): string {
	return path.join( projectPath, STORE_DIR, FILE );
}

function normalizeShow( raw: unknown ): ResourcesShowFilter {
	if ( ! raw || typeof raw !== 'object' ) {
		return { ...DEFAULT_SHOW };
	}
	const obj = raw as Partial< Record< keyof ResourcesShowFilter, unknown > >;
	const next: ResourcesShowFilter = { ...DEFAULT_SHOW };
	for ( const key of Object.keys( DEFAULT_SHOW ) as Array<
		keyof ResourcesShowFilter
	> ) {
		if ( typeof obj[ key ] === 'boolean' ) {
			next[ key ] = obj[ key ] as boolean;
		}
	}
	return next;
}

function normalize( raw: unknown ): ProjectUiPrefs {
	if ( ! raw || typeof raw !== 'object' ) {
		return {
			resourcesCollapsed: {},
			resourcesSort: DEFAULTS.resourcesSort,
			resourcesShow: { ...DEFAULT_SHOW },
		};
	}
	const obj = raw as {
		resourcesCollapsed?: unknown;
		resourcesSort?: unknown;
		resourcesShow?: unknown;
	};
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
	const sort: ResourcesSort = SORT_VALUES.includes(
		obj.resourcesSort as ResourcesSort
	)
		? ( obj.resourcesSort as ResourcesSort )
		: DEFAULTS.resourcesSort;
	return {
		resourcesCollapsed: collapsed,
		resourcesSort: sort,
		resourcesShow: normalizeShow( obj.resourcesShow ),
	};
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

export type ProjectUiPrefsPatch = {
	resourcesCollapsed?: Record< string, boolean >;
	resourcesSort?: ResourcesSort;
	resourcesShow?: Partial< ResourcesShowFilter >;
};

export function writeProjectUiPrefs(
	projectId: string,
	patch: ProjectUiPrefsPatch
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
		resourcesSort: patch.resourcesSort ?? current.resourcesSort,
		resourcesShow: {
			...current.resourcesShow,
			...( patch.resourcesShow ?? {} ),
		},
	};
	const file = storePath( project.path );
	fs.mkdirSync( path.dirname( file ), { recursive: true } );
	fs.writeFileSync( file, JSON.stringify( next, null, 2 ), 'utf-8' );
	return next;
}
