import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import matter from 'gray-matter';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockUserData = { dir: '' };
vi.mock( 'electron', () => ( {
	app: { getPath: () => mockUserData.dir },
	safeStorage: {
		isEncryptionAvailable: () => true,
		encryptString: ( s: string ) => Buffer.from( `enc:${ s }`, 'utf-8' ),
		decryptString: ( buf: Buffer ) =>
			buf.toString( 'utf-8' ).replace( /^enc:/, '' ),
	},
} ) );

const mockProject = { value: null as { id: string; path: string } | null };
vi.mock( '../../src/main/channels/utils/project-get', () => ( {
	getProject: ( id: string ) =>
		mockProject.value && mockProject.value.id === id
			? mockProject.value
			: null,
} ) );

import { buildPublishPermissionDetail } from '../../src/main/channels/utils/wp-publish-permission-detail';
import {
	addConnection,
	encryptSecret,
} from '../../src/main/channels/utils/wordpress-store';
import type { WordpressConnection } from '../../src/types';

let projectDir: string;

const connection: WordpressConnection = {
	id: 'conn-1',
	label: 'My Blog',
	siteUrl: 'https://example.com',
	kind: 'app-password',
	username: 'admin',
	secretCipher: encryptSecret( 'app-password' ),
	createdAt: 1700000000000,
};

beforeEach( () => {
	mockUserData.dir = fs.mkdtempSync(
		path.join( os.tmpdir(), 'wp-detail-userdata-' )
	);
	projectDir = fs.mkdtempSync( path.join( os.tmpdir(), 'wp-detail-proj-' ) );
	fs.mkdirSync( path.join( projectDir, 'drafts' ), { recursive: true } );
	mockProject.value = { id: 'proj-1', path: projectDir };
} );

afterEach( () => {
	mockProject.value = null;
	try {
		fs.rmSync( projectDir, { recursive: true, force: true } );
		fs.rmSync( mockUserData.dir, { recursive: true, force: true } );
	} catch {
		// best effort
	}
} );

describe( 'buildPublishPermissionDetail', () => {
	it( 'returns wp-publish detail with the title from frontmatter', () => {
		addConnection( connection );
		fs.writeFileSync(
			path.join( projectDir, 'drafts', 'foo.md' ),
			matter.stringify( 'body', { title: 'My Post Title' } ),
			'utf-8'
		);

		const detail = buildPublishPermissionDetail( 'proj-1', {
			relPath: 'foo.md',
			connectionId: 'conn-1',
			folder: 'drafts',
		} );

		expect( detail ).toEqual( {
			kind: 'wp-publish',
			connectionLabel: 'My Blog',
			connectionSiteUrl: 'https://example.com',
			draftRelPath: 'foo.md',
			draftFolder: 'drafts',
			draftTitle: 'My Post Title',
		} );
	} );

	it( 'leaves draftTitle null when the file has no title in frontmatter', () => {
		addConnection( connection );
		fs.writeFileSync(
			path.join( projectDir, 'drafts', 'untitled.md' ),
			'body without frontmatter',
			'utf-8'
		);

		const detail = buildPublishPermissionDetail( 'proj-1', {
			relPath: 'untitled.md',
			connectionId: 'conn-1',
			folder: 'drafts',
		} );

		expect( detail?.draftTitle ).toBeNull();
	} );

	it( 'defaults folder to drafts when missing or invalid', () => {
		addConnection( connection );
		fs.writeFileSync(
			path.join( projectDir, 'drafts', 'a.md' ),
			matter.stringify( 'body', {} ),
			'utf-8'
		);

		const detail = buildPublishPermissionDetail( 'proj-1', {
			relPath: 'a.md',
			connectionId: 'conn-1',
		} );

		expect( detail?.draftFolder ).toBe( 'drafts' );
	} );

	it( 'returns undefined when the connection id is unknown', () => {
		const detail = buildPublishPermissionDetail( 'proj-1', {
			relPath: 'a.md',
			connectionId: 'missing',
			folder: 'drafts',
		} );
		expect( detail ).toBeUndefined();
	} );

	it( 'returns undefined when the input is malformed', () => {
		expect(
			buildPublishPermissionDetail( 'proj-1', null )
		).toBeUndefined();
		expect( buildPublishPermissionDetail( 'proj-1', {} ) ).toBeUndefined();
		expect(
			buildPublishPermissionDetail( 'proj-1', { relPath: 'a.md' } )
		).toBeUndefined();
	} );
} );
