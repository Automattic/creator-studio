import React from 'react';

import type { TaskDefinition, TaskRun } from '../../types';
import { describeSchedule } from '../lib/describeSchedule';
import { relativeDate } from '../lib/relativeDate';

export const TASK_STATUS_LABEL: Record< TaskRun[ 'status' ], string > = {
	queued: 'Queued',
	running: 'Running',
	'needs-permission': 'Needs you',
	done: 'Done',
	error: 'Failed',
	stopped: 'Stopped',
};

export function isTerminalStatus( status: TaskRun[ 'status' ] ): boolean {
	return status === 'done' || status === 'error' || status === 'stopped';
}

function ago( ts: number ): string {
	const r = relativeDate( ts );
	return r === 'now' ? 'just now' : `${ r } ago`;
}

export type TaskRunRowProps = {
	run: TaskRun;
	projectName: string;
	// Schedule description of the parent definition, or a one-off label.
	scheduleHint: string | null;
	onOpen: () => void;
	// Present only for non-terminal runs.
	onStop?: () => void;
};

export function TaskRunRow( {
	run,
	projectName,
	scheduleHint,
	onOpen,
	onStop,
}: TaskRunRowProps ): React.ReactElement {
	const terminal = isTerminalStatus( run.status );
	const ts = terminal ? run.endedAt : run.startedAt;
	const when = ts
		? `${ terminal ? 'finished' : 'started' } ${ ago( ts ) }`
		: 'queued';
	return (
		<div
			className="task-row"
			data-testid={ `task-row-${ run.id }` }
			data-status={ run.status }
		>
			<button type="button" className="task-row-main" onClick={ onOpen }>
				<span className="task-row-head">
					<span className="task-row-status">
						{ TASK_STATUS_LABEL[ run.status ] }
					</span>
					{ scheduleHint && (
						<span className="task-row-schedule">
							{ scheduleHint }
						</span>
					) }
				</span>
				<span className="task-row-title">{ run.title }</span>
				<span className="task-row-meta">
					from { projectName } · { when }
				</span>
				{ run.summary && (
					<span className="task-row-summary">{ run.summary }</span>
				) }
				{ run.status === 'running' && (
					<span
						className="task-progress-bar"
						data-indeterminate="true"
						aria-hidden="true"
					/>
				) }
			</button>
			{ onStop && ! terminal && (
				<button
					type="button"
					className="task-row-stop"
					data-testid={ `task-row-stop-${ run.id }` }
					onClick={ onStop }
				>
					Stop
				</button>
			) }
		</div>
	);
}

export type TaskDefinitionRowProps = {
	definition: TaskDefinition;
	projectName: string;
	lastRun: TaskRun | null;
	onRun: () => void;
	onEdit: () => void;
	onDelete: () => void;
};

export function TaskDefinitionRow( {
	definition,
	projectName,
	lastRun,
	onRun,
	onEdit,
	onDelete,
}: TaskDefinitionRowProps ): React.ReactElement {
	let lastRunText = 'never run';
	if ( lastRun ) {
		const label = TASK_STATUS_LABEL[ lastRun.status ].toLowerCase();
		lastRunText = lastRun.endedAt
			? `last run: ${ label } ${ ago( lastRun.endedAt ) }`
			: `last run: ${ label }`;
	}
	return (
		<div
			className="task-def-row"
			data-testid={ `task-def-row-${ definition.id }` }
		>
			<div className="task-def-row-body">
				<span className="task-def-row-title">{ definition.title }</span>
				<span className="task-def-row-meta">
					{ describeSchedule( definition.schedule ) } ·{ ' ' }
					{ projectName } · { lastRunText }
				</span>
			</div>
			<div className="task-def-row-actions">
				<button
					type="button"
					className="task-def-action"
					data-testid={ `task-def-run-${ definition.id }` }
					onClick={ onRun }
				>
					Run now
				</button>
				<button
					type="button"
					className="task-def-action"
					data-testid={ `task-def-edit-${ definition.id }` }
					onClick={ onEdit }
				>
					Edit
				</button>
				<button
					type="button"
					className="task-def-action task-def-action-danger"
					data-testid={ `task-def-delete-${ definition.id }` }
					onClick={ onDelete }
				>
					Delete
				</button>
			</div>
		</div>
	);
}
