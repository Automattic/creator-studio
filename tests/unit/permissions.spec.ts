import { test, expect } from '@playwright/test';

import {
	isInsideFolder,
	isInsideStoreDir,
	isReadOnlyBashCommand,
	isSafeBashWrite,
	shouldAutoAllowStructuredFileTool,
} from '../../src/main/permissions';

const FOLDER = '/tmp/cs-test-folder';

test.describe( 'permissions: isInsideFolder', () => {
	test( 'accepts absolute paths inside', () => {
		expect( isInsideFolder( FOLDER, `${ FOLDER }/a.txt` ) ).toBe( true );
		expect( isInsideFolder( FOLDER, `${ FOLDER }/a/b/c` ) ).toBe( true );
		expect( isInsideFolder( FOLDER, FOLDER ) ).toBe( true );
	} );

	test( 'rejects absolute paths outside', () => {
		expect( isInsideFolder( FOLDER, '/etc/passwd' ) ).toBe( false );
		expect( isInsideFolder( FOLDER, '/tmp/other/file' ) ).toBe( false );
	} );

	test( 'resolves relative paths against the folder', () => {
		expect( isInsideFolder( FOLDER, 'a/b' ) ).toBe( true );
		expect( isInsideFolder( FOLDER, './x' ) ).toBe( true );
		expect( isInsideFolder( FOLDER, '../other' ) ).toBe( false );
		expect( isInsideFolder( FOLDER, '../' ) ).toBe( false );
	} );
} );

test.describe( 'permissions: isInsideStoreDir', () => {
	test( 'detects the private store subfolder', () => {
		expect(
			isInsideStoreDir( FOLDER, `${ FOLDER }/.creator-studio/chats.json` )
		).toBe( true );
		expect( isInsideStoreDir( FOLDER, '.creator-studio/chats.json' ) ).toBe(
			true
		);
		expect( isInsideStoreDir( FOLDER, `${ FOLDER }/chats.json` ) ).toBe(
			false
		);
	} );
} );

test.describe( 'permissions: shouldAutoAllowStructuredFileTool', () => {
	test( 'allows Read/Write/Edit with in-folder paths', () => {
		expect(
			shouldAutoAllowStructuredFileTool(
				'Read',
				{ file_path: `${ FOLDER }/a.txt` },
				FOLDER
			)
		).toBe( true );
		expect(
			shouldAutoAllowStructuredFileTool(
				'Write',
				{ file_path: `${ FOLDER }/a.txt` },
				FOLDER
			)
		).toBe( true );
		expect(
			shouldAutoAllowStructuredFileTool(
				'Edit',
				{ file_path: `${ FOLDER }/a.txt` },
				FOLDER
			)
		).toBe( true );
	} );

	test( 'rejects paths outside folder', () => {
		expect(
			shouldAutoAllowStructuredFileTool(
				'Read',
				{ file_path: '/etc/passwd' },
				FOLDER
			)
		).toBe( false );
	} );

	test( 'rejects paths inside .creator-studio/', () => {
		expect(
			shouldAutoAllowStructuredFileTool(
				'Read',
				{ file_path: `${ FOLDER }/.creator-studio/chats.json` },
				FOLDER
			)
		).toBe( false );
	} );

	test( 'handles NotebookEdit with notebook_path', () => {
		expect(
			shouldAutoAllowStructuredFileTool(
				'NotebookEdit',
				{ notebook_path: `${ FOLDER }/nb.ipynb` },
				FOLDER
			)
		).toBe( true );
	} );

	test( 'Glob/Grep with no path default to folder (auto-allow)', () => {
		expect( shouldAutoAllowStructuredFileTool( 'Glob', {}, FOLDER ) ).toBe(
			true
		);
		expect( shouldAutoAllowStructuredFileTool( 'Grep', {}, FOLDER ) ).toBe(
			true
		);
	} );

	test( 'unknown tool names return false', () => {
		expect(
			shouldAutoAllowStructuredFileTool(
				'Bash',
				{ command: 'ls' },
				FOLDER
			)
		).toBe( false );
	} );
} );

test.describe( 'permissions: isReadOnlyBashCommand', () => {
	const allowed = [
		'pwd',
		'ls',
		'ls -la /tmp',
		'cat README.md',
		'head -n 5 file',
		'tail -n 5 file',
		'wc -l file',
		'file foo',
		'which node',
		'grep -r foo .',
		'rg "foo bar" src',
		'find . -name "*.ts"',
		'fd ts',
		'tree -L 2',
		'git status',
		'git log --oneline -n 10',
		'git diff HEAD~1',
		'git show HEAD',
		'git rev-parse HEAD',
		'git blame file',
		'cat a | grep foo | wc -l',
		'ls && pwd',
		'echo hi',
	];
	for ( const cmd of allowed ) {
		test( `allow: ${ cmd }`, () => {
			expect( isReadOnlyBashCommand( cmd ) ).toBe( true );
		} );
	}

	const denied = [
		'',
		'mkdir test',
		'rm -rf x',
		'cat x > y',
		'cat x >> y',
		'cat $(rm x)',
		'cat `rm x`',
		'echo hi > file',
		'touch foo',
		'git commit -m test',
		'git push',
		'git pull',
		'npm install',
		'ls | tee out',
	];
	for ( const cmd of denied ) {
		test( `deny: ${ JSON.stringify( cmd ) }`, () => {
			expect( isReadOnlyBashCommand( cmd ) ).toBe( false );
		} );
	}
} );

test.describe( 'permissions: isSafeBashWrite', () => {
	const allowed = [
		'mkdir foo',
		'mkdir -p foo/bar',
		`mkdir -p ${ FOLDER }/x`,
		'mkdir foo bar baz',
		'touch foo.txt',
		'touch -am foo.txt',
		'rmdir foo',
		'rm foo.txt',
		'rm -v foo',
		'rm -- -weird',
		'echo hi > foo.txt',
		'echo hi >> foo.txt',
	];
	for ( const cmd of allowed ) {
		test( `allow: ${ cmd }`, () => {
			expect( isSafeBashWrite( cmd, FOLDER ) ).toBe( true );
		} );
	}

	const denied = [
		'',
		'rm -rf foo',
		'rm -r foo',
		'rm foo bar',
		'mkdir /tmp/outside',
		'touch /etc/x',
		'echo hi > /etc/passwd',
		'mkdir foo && rm bar',
		'mkdir $(whoami)',
		'mv foo bar',
		'cp x y',
		'mkdir',
	];
	for ( const cmd of denied ) {
		test( `deny: ${ JSON.stringify( cmd ) }`, () => {
			expect( isSafeBashWrite( cmd, FOLDER ) ).toBe( false );
		} );
	}
} );
