import { describe, expect, it, vi } from 'vitest';

// task-tools/index pulls in wordpress-store transitively (via wordpress.ts).
// Stub Electron so the import chain doesn't blow up under vitest.
vi.mock( 'electron', () => ( {
	app: { getPath: () => '/tmp/sw-mcp-factory-tests' },
	safeStorage: {
		isEncryptionAvailable: () => false,
		encryptString: ( s: string ) => Buffer.from( `enc:${ s }`, 'utf-8' ),
		decryptString: ( buf: Buffer ) =>
			buf.toString( 'utf-8' ).replace( /^enc:/, '' ),
	},
} ) );

import {
	buildTaskMcpToolList,
	isTaskMcpTool,
	PUBLISH_TO_WORDPRESS_TOOL_NAME,
	TASK_MCP_SERVER_NAME,
	TASK_MCP_TOOL_NAMES,
} from '../../src/main/channels/utils/task-tools';

import type { TaskMcpContext } from '../../src/main/channels/utils/task-tools';

const ctx: TaskMcpContext = {
	projectId: 'proj-1',
	listTasks: () => [],
	runTask: () => null,
};

describe( 'buildTaskMcpToolList composition', () => {
	it( 'omits the WordPress tools by default (task-runner path)', () => {
		const names = buildTaskMcpToolList( ctx ).map( ( t ) => t.name );
		expect( names ).toContain( 'fetch_feed' );
		expect( names ).toContain( 'list_tasks' );
		expect( names ).not.toContain( 'list_wordpress_sites' );
		expect( names ).not.toContain( 'publish_to_wordpress' );
	} );

	it( 'includes the WordPress tools when includeWordpress is true (chat path)', () => {
		const names = buildTaskMcpToolList( ctx, {
			includeWordpress: true,
		} ).map( ( t ) => t.name );
		expect( names ).toContain( 'list_wordpress_sites' );
		expect( names ).toContain( 'publish_to_wordpress' );
	} );
} );

describe( 'isTaskMcpTool auto-allow gate', () => {
	it( 'allows read-only studio tools', () => {
		expect(
			isTaskMcpTool( `mcp__${ TASK_MCP_SERVER_NAME }__fetch_page` )
		).toBe( true );
		expect(
			isTaskMcpTool(
				`mcp__${ TASK_MCP_SERVER_NAME }__list_wordpress_sites`
			)
		).toBe( true );
		expect(
			isTaskMcpTool( `mcp__${ TASK_MCP_SERVER_NAME }__list_tasks` )
		).toBe( true );
	} );

	it( 'does NOT auto-allow publish_to_wordpress', () => {
		expect( isTaskMcpTool( PUBLISH_TO_WORDPRESS_TOOL_NAME ) ).toBe( false );
		expect( TASK_MCP_TOOL_NAMES ).not.toContain(
			PUBLISH_TO_WORDPRESS_TOOL_NAME
		);
	} );

	it( 'returns false for unrelated tool names', () => {
		expect( isTaskMcpTool( 'Bash' ) ).toBe( false );
		expect( isTaskMcpTool( 'Read' ) ).toBe( false );
		expect( isTaskMcpTool( 'mcp__other__do_thing' ) ).toBe( false );
	} );
} );
