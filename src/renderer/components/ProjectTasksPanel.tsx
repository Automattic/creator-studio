import React from 'react';

import type { TaskDefinition, TaskRun } from '../../types';
import { describeSchedule } from '../lib/describeSchedule';
import { isTerminalStatus, TaskDefinitionRow, TaskRunRow } from './TaskRows';

const RECENT_LIMIT = 12;

type Props = {
	projectName: string;
	runs: TaskRun[];
	definitions: TaskDefinition[];
	onOpenRun: ( run: TaskRun ) => void;
	onStopRun: ( runId: string ) => void;
	onRunDefinition: ( defId: string ) => void;
	onEditDefinition: ( def: TaskDefinition ) => void;
	onDeleteDefinition: ( def: TaskDefinition ) => void;
};

// Body of the Tasks tab inside the draft sidebar: this project's running
// tasks, saved tasks (Run / Edit / Delete) and recent runs. The sidebar
// shell (header, title, close, the "+ New task" action) is provided by
// DraftSidebar.
export function ProjectTasksPanel( {
	projectName,
	runs,
	definitions,
	onOpenRun,
	onStopRun,
	onRunDefinition,
	onEditDefinition,
	onDeleteDefinition,
}: Props ): React.ReactElement {
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

	if ( definitions.length === 0 && runs.length === 0 ) {
		return (
			<div
				className="project-tasks-panel"
				data-testid="project-tasks-panel"
			>
				<div
					className="project-tasks-empty"
					data-testid="project-tasks-empty"
				>
					No tasks for this project yet. Use the + above to create
					one.
				</div>
			</div>
		);
	}

	return (
		<div className="project-tasks-panel" data-testid="project-tasks-panel">
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

			{ definitions.length > 0 && (
				<section className="project-tasks-section">
					<h3 className="project-tasks-section-label">Your tasks</h3>
					{ definitions.map( ( def ) => (
						<TaskDefinitionRow
							key={ def.id }
							definition={ def }
							projectName={ projectName }
							lastRun={ lastRunFor( def.id ) }
							onRun={ () => onRunDefinition( def.id ) }
							onEdit={ () => onEditDefinition( def ) }
							onDelete={ () => onDeleteDefinition( def ) }
						/>
					) ) }
				</section>
			) }

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
	);
}
