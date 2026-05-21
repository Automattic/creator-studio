/**
 * In-process MCP server exposing the task system's capability tools to the
 * agent. Built with the SDK's `createSdkMcpServer` — it runs in the same
 * process, needs no install or subprocess, and is invisible to the user (no
 * "MCP" concept is ever surfaced).
 *
 * Used by both the headless task runner and the in-chat agent. The chat path
 * enables `includeWordpress`, which adds list_wordpress_sites + publish_to_wordpress.
 * Tasks intentionally do not get the publish tool — an unattended run shouldn't
 * push live posts behind a pause-and-notify; that's just a delayed manual click
 * with the failure mode of a forgotten draft sitting in needs-permission.
 */
import { createSdkMcpServer } from '@anthropic-ai/claude-agent-sdk';

import { fetchFeedTool } from './feed';
import { fetchPageTool } from './page';
import { githubActivityTool } from './github';
import { redditSearchTool, redditSubredditTool } from './reddit';
import {
	makeListTasksTool,
	makeRunTaskTool,
	type TaskMcpContext,
} from './task-control';
import {
	listWordpressSitesTool,
	makePublishToWordpressTool,
} from './wordpress';
import { xActivityTool } from './x';
import { fetchYoutubeTool } from './youtube';

export type { TaskMcpContext };

export const TASK_MCP_SERVER_NAME = 'studio';

// Tools that are safe to auto-allow without a permission prompt: read-only
// network fetches and the user's own task list. `publish_to_wordpress` is
// deliberately not in this list — it side-effects to a live site, so it goes
// through the normal canUseTool flow and surfaces a tailored prompt.
const AUTO_ALLOWED_TOOL_BASE_NAMES = [
	'fetch_feed',
	'fetch_page',
	'fetch_youtube',
	'reddit_search',
	'reddit_subreddit',
	'github_activity',
	'x_activity',
	'list_tasks',
	'run_task',
	'list_wordpress_sites',
] as const;

// Fully-qualified MCP tool names (mcp__<server>__<tool>) — used by the chat
// and task `canUseTool` to auto-allow our own safe tools without a prompt.
export const TASK_MCP_TOOL_NAMES: string[] = AUTO_ALLOWED_TOOL_BASE_NAMES.map(
	( n ) => `mcp__${ TASK_MCP_SERVER_NAME }__${ n }`
);

// Fully-qualified name of the WP publish tool. Exported so the chat-side
// canUseTool can detect it and enrich the permission-request event with a
// connection label / draft title for a tailored prompt.
export const PUBLISH_TO_WORDPRESS_TOOL_NAME = `mcp__${ TASK_MCP_SERVER_NAME }__publish_to_wordpress`;

export function isTaskMcpTool( toolName: string ): boolean {
	return TASK_MCP_TOOL_NAMES.includes( toolName );
}

export type CreateTaskMcpServerOptions = {
	// Include the WordPress tools (list_wordpress_sites + publish_to_wordpress).
	// On for the chat agent, off for the headless task runner.
	includeWordpress?: boolean;
};

// Exported for direct test access — asserting the SDK-wrapped server's tool
// list requires poking the SDK's internals, which is brittle across versions.
// The runtime path (createTaskMcpServer) and the test path both go through
// this builder, so what's tested is what ships.
export function buildTaskMcpToolList(
	ctx: TaskMcpContext,
	opts: CreateTaskMcpServerOptions = {}
) {
	const tools = [
		fetchFeedTool,
		fetchPageTool,
		fetchYoutubeTool,
		redditSearchTool,
		redditSubredditTool,
		githubActivityTool,
		xActivityTool,
		makeListTasksTool( ctx ),
		makeRunTaskTool( ctx ),
	];
	if ( opts.includeWordpress ) {
		tools.push(
			listWordpressSitesTool,
			makePublishToWordpressTool( { projectId: ctx.projectId } )
		);
	}
	return tools;
}

export function createTaskMcpServer(
	ctx: TaskMcpContext,
	opts: CreateTaskMcpServerOptions = {}
) {
	return createSdkMcpServer( {
		name: TASK_MCP_SERVER_NAME,
		version: '1.0.0',
		tools: buildTaskMcpToolList( ctx, opts ),
	} );
}
