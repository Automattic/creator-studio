import { describe, test, expect } from 'vitest';

import {
	isInsideDir,
	isInsideStoreDir,
	isReadOnlyBashCommand,
	isSafeBashWrite,
	shouldAutoAllowStructuredFileTool,
} from '../../src/main/channels/utils/permissions';

const PROJECT = '/tmp/cs-test-project';

describe( 'permissions: isInsideDir', () => {
	test( 'accepts absolute paths inside', () => {
		expect( isInsideDir( PROJECT, `${ PROJECT }/a.txt` ) ).toBe( true );
		expect( isInsideDir( PROJECT, `${ PROJECT }/a/b/c` ) ).toBe( true );
		expect( isInsideDir( PROJECT, PROJECT ) ).toBe( true );
	} );

	test( 'rejects absolute paths outside', () => {
		expect( isInsideDir( PROJECT, '/etc/passwd' ) ).toBe( false );
		expect( isInsideDir( PROJECT, '/tmp/other/file' ) ).toBe( false );
	} );

	test( 'resolves relative paths against the directory', () => {
		expect( isInsideDir( PROJECT, 'a/b' ) ).toBe( true );
		expect( isInsideDir( PROJECT, './x' ) ).toBe( true );
		expect( isInsideDir( PROJECT, '../other' ) ).toBe( false );
		expect( isInsideDir( PROJECT, '../' ) ).toBe( false );
	} );
} );

describe( 'permissions: isInsideStoreDir', () => {
	test( 'detects the private store subfolder', () => {
		expect(
			isInsideStoreDir(
				PROJECT,
				`${ PROJECT }/.creator-studio/chats.json`
			)
		).toBe( true );
		expect(
			isInsideStoreDir( PROJECT, '.creator-studio/chats.json' )
		).toBe( true );
		expect( isInsideStoreDir( PROJECT, `${ PROJECT }/chats.json` ) ).toBe(
			false
		);
	} );
} );

describe( 'permissions: shouldAutoAllowStructuredFileTool', () => {
	test( 'allows Read/Write/Edit with in-project paths', () => {
		expect(
			shouldAutoAllowStructuredFileTool(
				'Read',
				{ file_path: `${ PROJECT }/a.txt` },
				PROJECT
			)
		).toBe( true );
		expect(
			shouldAutoAllowStructuredFileTool(
				'Write',
				{ file_path: `${ PROJECT }/a.txt` },
				PROJECT
			)
		).toBe( true );
		expect(
			shouldAutoAllowStructuredFileTool(
				'Edit',
				{ file_path: `${ PROJECT }/a.txt` },
				PROJECT
			)
		).toBe( true );
	} );

	test( 'rejects paths outside project', () => {
		expect(
			shouldAutoAllowStructuredFileTool(
				'Read',
				{ file_path: '/etc/passwd' },
				PROJECT
			)
		).toBe( false );
	} );

	test( 'rejects paths inside .creator-studio/', () => {
		expect(
			shouldAutoAllowStructuredFileTool(
				'Read',
				{ file_path: `${ PROJECT }/.creator-studio/chats.json` },
				PROJECT
			)
		).toBe( false );
	} );

	test( 'handles NotebookEdit with notebook_path', () => {
		expect(
			shouldAutoAllowStructuredFileTool(
				'NotebookEdit',
				{ notebook_path: `${ PROJECT }/nb.ipynb` },
				PROJECT
			)
		).toBe( true );
	} );

	test( 'Glob/Grep with no path default to project root (auto-allow)', () => {
		expect( shouldAutoAllowStructuredFileTool( 'Glob', {}, PROJECT ) ).toBe(
			true
		);
		expect( shouldAutoAllowStructuredFileTool( 'Grep', {}, PROJECT ) ).toBe(
			true
		);
	} );

	test( 'unknown tool names return false', () => {
		expect(
			shouldAutoAllowStructuredFileTool(
				'Bash',
				{ command: 'ls' },
				PROJECT
			)
		).toBe( false );
	} );
} );

describe( 'permissions: isReadOnlyBashCommand', () => {
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

describe( 'permissions: isSafeBashWrite', () => {
	const allowed = [
		'mkdir foo',
		'mkdir -p foo/bar',
		`mkdir -p ${ PROJECT }/x`,
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
			expect( isSafeBashWrite( cmd, PROJECT ) ).toBe( true );
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
			expect( isSafeBashWrite( cmd, PROJECT ) ).toBe( false );
		} );
	}
} );
