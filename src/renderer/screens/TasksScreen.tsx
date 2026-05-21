import React from 'react';

import type { Project, TaskDefinition, TaskRun } from '../../types';
import {
	isTerminalStatus,
	TaskDefinitionRow,
	TaskRunRow,
} from '../components/TaskRows';

type TasksScreenProps = {
	definitions: TaskDefinition[];
	runs: TaskRun[];
	projects: Project[];
	onOpenRun: ( run: TaskRun ) => void;
	onStopRun: ( runId: string ) => void;
	onRunDefinition: ( projectId: string, defId: string ) => void;
	onEditDefinition: ( def: TaskDefinition ) => void;
	onDeleteDefinition: ( def: TaskDefinition ) => void;
	onNewTask: () => void;
};

const RECENT_LIMIT = 50;

export function TasksScreen( {
	definitions,
	runs,
	projects,
	onOpenRun,
	onStopRun,
	onRunDefinition,
	onEditDefinition,
	onDeleteDefinition,
	onNewTask,
}: TasksScreenProps ): React.ReactElement {
	const projectName = ( id: string ): string =>
		projects.find( ( p ) => p.id === id )?.name ?? 'Unknown project';

	const lastRunFor = ( defId: string ): TaskRun | null =>
		runs.find( ( r ) => r.definitionId === defId ) ?? null;

	const allRuns = [
		...runs.filter( ( r ) => ! isTerminalStatus( r.status ) ),
		...runs
			.filter( ( r ) => isTerminalStatus( r.status ) )
			.slice( 0, RECENT_LIMIT ),
	];
	const isEmpty = definitions.length === 0 && runs.length === 0;

	return (
		<div className="tasks-screen" data-testid="screen-tasks">
			<header className="tasks-screen-header">
				<h1 className="tasks-screen-title">Tasks</h1>
				<button
					type="button"
					className="tasks-new-task"
					data-testid="tasks-new-task"
					onClick={ onNewTask }
				>
					New task
				</button>
			</header>

			{ isEmpty ? (
				<div className="tasks-screen-empty" data-testid="tasks-empty">
					<p className="tasks-screen-empty-title">No tasks yet</p>
					<p className="tasks-screen-empty-body">
						Tasks let Studio Write do work for you in the background
						— on a schedule or on demand.
					</p>
				</div>
			) : (
				<div className="tasks-screen-body">
					{ definitions.length > 0 && (
						<section
							className="tasks-section"
							data-section="tasks"
							data-testid="tasks-section-tasks"
						>
							{ definitions.map( ( def ) => (
								<TaskDefinitionRow
									key={ def.id }
									definition={ def }
									projectName={ projectName( def.projectId ) }
									lastRun={ lastRunFor( def.id ) }
									onRun={ () =>
										onRunDefinition( def.projectId, def.id )
									}
									onEdit={ () => onEditDefinition( def ) }
									onDelete={ () => onDeleteDefinition( def ) }
								/>
							) ) }
						</section>
					) }

					<section
						className="tasks-section"
						data-section="runs"
						data-testid="tasks-section-runs"
					>
						<h2 className="tasks-section-label">Runs</h2>
						{ allRuns.length === 0 ? (
							<div
								className="tasks-recent-empty"
								data-testid="tasks-recent-empty"
							>
								No tasks have run yet.
							</div>
						) : (
							allRuns.map( ( run ) => (
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
							) )
						) }
					</section>
				</div>
			) }
		</div>
	);
}
