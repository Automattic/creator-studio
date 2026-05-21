/**
 * In-process MCP server exposing the task system's capability tools to the
 * agent. Built with the SDK's `createSdkMcpServer` — it runs in the same
 * process, needs no install or subprocess, and is invisible to the user (no
 * "MCP" concept is ever surfaced).
 *
 * Used by both the headless task runner and the in-chat agent.
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
import { xActivityTool } from './x';
import { fetchYoutubeTool } from './youtube';

export type { TaskMcpContext };

export const TASK_MCP_SERVER_NAME = 'studio';

const TOOL_BASE_NAMES = [
	'fetch_feed',
	'fetch_page',
	'fetch_youtube',
	'reddit_search',
	'reddit_subreddit',
	'github_activity',
	'x_activity',
	'list_tasks',
	'run_task',
] as const;

// Fully-qualified MCP tool names (mcp__<server>__<tool>) — used by the chat
// and task `canUseTool` to auto-allow our own tools without a prompt.
export const TASK_MCP_TOOL_NAMES: string[] = TOOL_BASE_NAMES.map(
	( n ) => `mcp__${ TASK_MCP_SERVER_NAME }__${ n }`
);

export function isTaskMcpTool( toolName: string ): boolean {
	return toolName.startsWith( `mcp__${ TASK_MCP_SERVER_NAME }__` );
}

export function createTaskMcpServer( ctx: TaskMcpContext ) {
	return createSdkMcpServer( {
		name: TASK_MCP_SERVER_NAME,
		version: '1.0.0',
		tools: [
			fetchFeedTool,
			fetchPageTool,
			fetchYoutubeTool,
			redditSearchTool,
			redditSubredditTool,
			githubActivityTool,
			xActivityTool,
			makeListTasksTool( ctx ),
			makeRunTaskTool( ctx ),
		],
	} );
}
