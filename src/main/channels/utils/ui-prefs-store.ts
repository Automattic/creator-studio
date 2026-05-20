import fs from 'node:fs';
import path from 'node:path';

import { app } from 'electron';

import type { AuthMode, DraftSidebarTab, UiPrefs } from '../../../types';

const DEFAULTS: UiPrefs = {
	closedChatIdsByProject: {},
	draftSidebarOpen: true,
	draftSidebarTab: 'chat',
};

const AUTH_MODES: readonly AuthMode[] = [ 'api-key', 'claude-code' ];

function parseAuthMode( value: unknown ): AuthMode | undefined {
	return AUTH_MODES.includes( value as AuthMode )
		? ( value as AuthMode )
		: undefined;
}

const DRAFT_SIDEBAR_TABS: readonly DraftSidebarTab[] = [
	'chat',
	'checks',
	'outline',
	'share',
	'history',
];

export function storePath(): string {
	return path.join( app.getPath( 'userData' ), 'ui-prefs.json' );
}

function parseClosedChatIdsByProject(
	value: unknown
): Record< string, string[] > {
	if ( ! value || typeof value !== 'object' || Array.isArray( value ) ) {
		return {};
	}
	const out: Record< string, string[] > = {};
	for ( const [ projectId, ids ] of Object.entries(
		value as Record< string, unknown >
	) ) {
		if ( ! Array.isArray( ids ) ) {
			continue;
		}
		const list = ids.filter(
			( id ): id is string => typeof id === 'string'
		);
		if ( list.length > 0 ) {
			out[ projectId ] = list;
		}
	}
	return out;
}

function parseDraftSidebarTab( value: unknown ): DraftSidebarTab {
	return DRAFT_SIDEBAR_TABS.includes( value as DraftSidebarTab )
		? ( value as DraftSidebarTab )
		: DEFAULTS.draftSidebarTab;
}

export function readStore(): UiPrefs {
	const file = storePath();
	if ( ! fs.existsSync( file ) ) {
		return { ...DEFAULTS, closedChatIdsByProject: {} };
	}
	try {
		const parsed = JSON.parse(
			fs.readFileSync( file, 'utf-8' )
		) as Partial< Record< keyof UiPrefs, unknown > >;
		return {
			closedChatIdsByProject: parseClosedChatIdsByProject(
				parsed.closedChatIdsByProject
			),
			draftSidebarOpen:
				typeof parsed.draftSidebarOpen === 'boolean'
					? parsed.draftSidebarOpen
					: DEFAULTS.draftSidebarOpen,
			draftSidebarTab: parseDraftSidebarTab( parsed.draftSidebarTab ),
			draftSidebarWidth:
				typeof parsed.draftSidebarWidth === 'number'
					? parsed.draftSidebarWidth
					: undefined,
			authMode: parseAuthMode( parsed.authMode ),
		};
	} catch {
		return { ...DEFAULTS, closedChatIdsByProject: {} };
	}
}

export function writeStore( patch: Partial< UiPrefs > ): UiPrefs {
	const next: UiPrefs = { ...readStore(), ...patch };
	const file = storePath();
	fs.mkdirSync( path.dirname( file ), { recursive: true } );
	fs.writeFileSync( file, JSON.stringify( next, null, 2 ), 'utf-8' );
	return next;
}
