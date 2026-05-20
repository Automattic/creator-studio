import { z } from 'zod';
import { tool } from '@anthropic-ai/claude-agent-sdk';

import { toolText, toolError } from './result';
import type { TaskDefinition } from '../../../../types';

// Wiring the task-control tools need from the host. Injected by the caller
// (TaskManager / AgentService) so this module never imports the manager —
// keeps task-tools free of a dependency cycle.
export type TaskMcpContext = {
	projectId: string;
	// The current project's saved task definitions.
	listTasks: () => TaskDefinition[];
	// Enqueue a background run of a saved task. Returns the new run id, or
	// null when no task with that id exists in the project.
	runTask: ( taskId: string ) => string | null;
};

export function makeListTasksTool( ctx: TaskMcpContext ) {
	return tool(
		'list_tasks',
		"List the user's saved tasks for the current project, so you can tell " +
			'them what is available or start one with run_task.',
		{},
		async () => {
			const tasks = ctx.listTasks().map( ( t ) => ( {
				id: t.id,
				title: t.title,
				description: t.description,
				schedule: t.schedule,
				enabled: t.enabled,
				lastRunAt: t.lastRunAt,
			} ) );
			if ( tasks.length === 0 ) {
				return toolText( 'This project has no saved tasks yet.' );
			}
			return toolText( JSON.stringify( tasks, null, 2 ) );
		}
	);
}

export function makeRunTaskTool( ctx: TaskMcpContext ) {
	return tool(
		'run_task',
		'Start one of the saved tasks (get its id from list_tasks). The task ' +
			'runs in the background — it does not block this conversation, and ' +
			'its progress appears in the Tasks view.',
		{ taskId: z.string().describe( 'The id of the task to run.' ) },
		async ( args ) => {
			const runId = ctx.runTask( args.taskId );
			if ( ! runId ) {
				return toolError(
					`No task with id "${ args.taskId }" in this project. Use ` +
						'list_tasks to see the available task ids.'
				);
			}
			return toolText(
				'Started the task — it is now running in the background ' +
					`(run id ${ runId }). The user can follow it in the Tasks view.`
			);
		}
	);
}
