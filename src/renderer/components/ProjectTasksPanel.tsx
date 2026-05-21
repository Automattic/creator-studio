import React from 'react';

import type { TaskDefinition, TaskRun } from '../../types';
import { TASK_TEMPLATES } from '../lib/taskTemplates';
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
	onNewTaskFromTemplate?: ( templateId: string ) => void;
};

export function ProjectTasksPanel( {
	projectName,
	runs,
	definitions,
	onOpenRun,
	onStopRun,
	onRunDefinition,
	onEditDefinition,
	onDeleteDefinition,
	onNewTaskFromTemplate,
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
					<p className="project-tasks-empty-text">
						No tasks for this project yet. Start from a template or
						use the + above.
					</p>
					{ onNewTaskFromTemplate && (
						<div className="task-template-list">
							{ TASK_TEMPLATES.map( ( tpl ) => (
								<button
									key={ tpl.id }
									type="button"
									className="task-template-list-item"
									data-testid={ `task-template-item-${ tpl.id }` }
									onClick={ () =>
										onNewTaskFromTemplate( tpl.id )
									}
								>
									<span className="task-template-list-title">
										{ tpl.title }
									</span>
									<span className="task-template-list-desc">
										{ tpl.description }
									</span>
								</button>
							) ) }
						</div>
					) }
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
