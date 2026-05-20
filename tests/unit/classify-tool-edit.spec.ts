import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

const mocks = vi.hoisted( () => ( { userDataDir: '' } ) );

vi.mock( 'electron', () => ( {
	app: {
		getPath: ( name: string ) => {
			if ( name === 'userData' ) {
				return mocks.userDataDir;
			}
			throw new Error( `Unexpected app.getPath(${ name })` );
		},
	},
} ) );

import { classifyToolEdit } from '../../src/main/channels/utils/classify-tool-edit';
import {
	readStore,
	writeStore,
} from '../../src/main/channels/utils/project-store';
import type { Project } from '../../src/types';

let project: Project;
let workDir: string;

beforeEach( () => {
	mocks.userDataDir = fs.mkdtempSync(
		path.join( os.tmpdir(), 'sw-classify-' )
	);
	workDir = fs.mkdtempSync( path.join( os.tmpdir(), 'sw-project-' ) );
	fs.mkdirSync( path.join( workDir, 'drafts' ), { recursive: true } );
	fs.mkdirSync( path.join( workDir, 'done' ), { recursive: true } );
	project = {
		id: randomUUID(),
		path: workDir,
		label: path.basename( workDir ),
		name: path.basename( workDir ),
	};
	const store = readStore();
	store.projects.push( project );
	writeStore( store );
} );

afterEach( () => {
	try {
		fs.rmSync( mocks.userDataDir, { recursive: true, force: true } );
		fs.rmSync( workDir, { recursive: true, force: true } );
	} catch {
		// best effort
	}
} );

describe( 'classifyToolEdit', () => {
	test( 'classifies an Edit on a file inside drafts/', () => {
		const filePath = path.join( workDir, 'drafts', 'hello.md' );
		expect(
			classifyToolEdit( project.id, 'Edit', { file_path: filePath } )
		).toEqual( { folder: 'drafts', relPath: 'hello.md' } );
	} );

	test( 'classifies Write, MultiEdit, and NotebookEdit the same way', () => {
		const filePath = path.join( workDir, 'drafts', 'note.md' );
		const expected = { folder: 'drafts', relPath: 'note.md' };
		expect(
			classifyToolEdit( project.id, 'Write', { file_path: filePath } )
		).toEqual( expected );
		expect(
			classifyToolEdit( project.id, 'MultiEdit', {
				file_path: filePath,
			} )
		).toEqual( expected );
		expect(
			classifyToolEdit( project.id, 'NotebookEdit', {
				file_path: filePath,
			} )
		).toEqual( expected );
	} );

	test( 'classifies files inside done/ as done', () => {
		const filePath = path.join( workDir, 'done', 'shipped.md' );
		expect(
			classifyToolEdit( project.id, 'Edit', { file_path: filePath } )
		).toEqual( { folder: 'done', relPath: 'shipped.md' } );
	} );

	test( 'handles nested relpaths inside drafts/', () => {
		const filePath = path.join(
			workDir,
			'drafts',
			'sub',
			'dir',
			'deep.md'
		);
		expect(
			classifyToolEdit( project.id, 'Edit', { file_path: filePath } )
		).toEqual( {
			folder: 'drafts',
			relPath: path.join( 'sub', 'dir', 'deep.md' ),
		} );
	} );

	test( 'returns null for tools we do not snapshot', () => {
		const filePath = path.join( workDir, 'drafts', 'hello.md' );
		for ( const tool of [ 'Read', 'Glob', 'Grep', 'Bash' ] ) {
			expect(
				classifyToolEdit( project.id, tool, { file_path: filePath } )
			).toBeNull();
		}
	} );

	test( 'returns null for files outside drafts/ and done/', () => {
		const sources = path.join( workDir, 'sources', 'reference.md' );
		expect(
			classifyToolEdit( project.id, 'Edit', { file_path: sources } )
		).toBeNull();
		const projectRoot = path.join( workDir, 'README.md' );
		expect(
			classifyToolEdit( project.id, 'Edit', { file_path: projectRoot } )
		).toBeNull();
	} );

	test( 'refuses ../ escapes via resolved paths', () => {
		// drafts/../../escape.md resolves *outside* the project root.
		const escape = path.join( workDir, 'drafts', '..', '..', 'escape.md' );
		expect(
			classifyToolEdit( project.id, 'Edit', { file_path: escape } )
		).toBeNull();
	} );

	test( 'returns null for malformed inputs', () => {
		expect( classifyToolEdit( project.id, 'Edit', null ) ).toBeNull();
		expect( classifyToolEdit( project.id, 'Edit', {} ) ).toBeNull();
		expect(
			classifyToolEdit( project.id, 'Edit', { file_path: '' } )
		).toBeNull();
		expect(
			classifyToolEdit( project.id, 'Edit', { file_path: 123 } )
		).toBeNull();
	} );

	test( 'returns null when the project does not exist', () => {
		const filePath = path.join( workDir, 'drafts', 'hello.md' );
		expect(
			classifyToolEdit( 'unknown-project', 'Edit', {
				file_path: filePath,
			} )
		).toBeNull();
	} );
} );
