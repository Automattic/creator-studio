import React from 'react';

import type { TaskDefinition, TaskRun } from '../../types';
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
	const lastRunFor = ( defId: string ): TaskRun | null =>
		runs.find( ( r ) => r.definitionId === defId ) ?? null;

	const allRuns = [
		...runs.filter( ( r ) => ! isTerminalStatus( r.status ) ),
		...runs
			.filter( ( r ) => isTerminalStatus( r.status ) )
			.slice( 0, RECENT_LIMIT ),
	];

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
			{ definitions.length > 0 && (
				<section className="project-tasks-section">
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

			{ allRuns.length > 0 && (
				<section className="project-tasks-section">
					<h3 className="project-tasks-section-label">Runs</h3>
					{ allRuns.map( ( run ) => (
						<TaskRunRow
							key={ run.id }
							run={ run }
							onOpen={ () => onOpenRun( run ) }
							onStop={
								! isTerminalStatus( run.status )
									? () => onStopRun( run.id )
									: undefined
							}
						/>
					) ) }
				</section>
			) }
		</div>
	);
}
