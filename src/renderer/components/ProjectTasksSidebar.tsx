import React from 'react';

import type { TaskDefinition, TaskRun } from '../../types';
import { CloseIcon } from '../icons';
import { describeSchedule } from '../lib/describeSchedule';
import { isTerminalStatus, TaskDefinitionRow, TaskRunRow } from './TaskRows';

const RECENT_LIMIT = 12;

type Props = {
	open: boolean;
	onClose: () => void;
	projectName: string;
	runs: TaskRun[];
	definitions: TaskDefinition[];
	onOpenRun: ( run: TaskRun ) => void;
	onStopRun: ( runId: string ) => void;
	onRunDefinition: ( defId: string ) => void;
	onEditDefinition: ( def: TaskDefinition ) => void;
	onDeleteDefinition: ( def: TaskDefinition ) => void;
	onNewTask: () => void;
};

// A toggleable right rail on the project screen: this project's running
// tasks, saved tasks (with Run / Edit / Delete), and a New task action.
export function ProjectTasksSidebar( {
	open,
	onClose,
	projectName,
	runs,
	definitions,
	onOpenRun,
	onStopRun,
	onRunDefinition,
	onEditDefinition,
	onDeleteDefinition,
	onNewTask,
}: Props ): React.ReactElement | null {
	if ( ! open ) {
		return null;
	}

	const defById = new Map( definitions.map( ( d ) => [ d.id, d ] ) );
	const scheduleHint = ( run: TaskRun ): string | null => {
		if ( run.definitionId ) {
			const def = defById.get( run.definitionId );
			if ( def ) {
				return describeSchedule( def.schedule );
			}
		}
		return run.kind === 'import-url' ? 'Import' : 'One-off';
	};
	const lastRunFor = ( defId: string ): TaskRun | null =>
		runs.find( ( r ) => r.definitionId === defId ) ?? null;

	const running = runs.filter( ( r ) => ! isTerminalStatus( r.status ) );
	const recent = runs
		.filter( ( r ) => isTerminalStatus( r.status ) )
		.slice( 0, RECENT_LIMIT );

	return (
		<aside
			className="project-tasks-sidebar"
			data-testid="project-tasks-sidebar"
			aria-label="Tasks"
		>
			<div className="project-tasks-sidebar-header">
				<span className="project-tasks-sidebar-title">Tasks</span>
				<button
					type="button"
					className="project-tasks-sidebar-close"
					data-testid="project-tasks-sidebar-close"
					aria-label="Close tasks"
					onClick={ onClose }
				>
					<CloseIcon />
				</button>
			</div>

			<div className="project-tasks-sidebar-body">
				{ running.length > 0 && (
					<section className="project-tasks-section">
						<h3 className="project-tasks-section-label">Running</h3>
						{ running.map( ( run ) => (
							<TaskRunRow
								key={ run.id }
								run={ run }
								projectName={ projectName }
								scheduleHint={ scheduleHint( run ) }
								onOpen={ () => onOpenRun( run ) }
								onStop={ () => onStopRun( run.id ) }
							/>
						) ) }
					</section>
				) }

				<section className="project-tasks-section">
					<h3 className="project-tasks-section-label">Your tasks</h3>
					{ definitions.length === 0 ? (
						<div
							className="project-tasks-empty"
							data-testid="project-tasks-empty"
						>
							No tasks for this project yet.
						</div>
					) : (
						definitions.map( ( def ) => (
							<TaskDefinitionRow
								key={ def.id }
								definition={ def }
								projectName={ projectName }
								lastRun={ lastRunFor( def.id ) }
								onRun={ () => onRunDefinition( def.id ) }
								onEdit={ () => onEditDefinition( def ) }
								onDelete={ () => onDeleteDefinition( def ) }
							/>
						) )
					) }
				</section>

				{ recent.length > 0 && (
					<section className="project-tasks-section">
						<h3 className="project-tasks-section-label">Recent</h3>
						{ recent.map( ( run ) => (
							<TaskRunRow
								key={ run.id }
								run={ run }
								projectName={ projectName }
								scheduleHint={ scheduleHint( run ) }
								onOpen={ () => onOpenRun( run ) }
							/>
						) ) }
					</section>
				) }
			</div>

			<div className="project-tasks-sidebar-footer">
				<button
					type="button"
					className="project-tasks-new"
					data-testid="project-tasks-new"
					onClick={ onNewTask }
				>
					+ New task
				</button>
			</div>
		</aside>
	);
}
