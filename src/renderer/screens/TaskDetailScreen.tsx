import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

import type { TaskDefinition, TaskRun } from '../../types';
import { ChatTranscript } from '../components/ChatTranscript';
import {
	PermissionPrompt,
	type PermissionRequest,
} from '../components/PermissionPrompt';
import { isTerminalStatus, TASK_STATUS_LABEL } from '../components/TaskRows';
import { RefreshIcon, StopIcon } from '../icons';
import { describeSchedule } from '../lib/describeSchedule';
import { persistedToMessages } from '../lib/persistedToMessages';
import { relativeDate } from '../lib/relativeDate';
import type { Message } from './ProjectScreen';

const POLL_INTERVAL_MS = 1500;

type TaskDetailScreenProps = {
	run: TaskRun;
	definition: TaskDefinition | null;
	projectName: string;
	projectPath: string | null;
	permissions: PermissionRequest[];
	onBack: () => void;
	onStop: () => void;
	onRerun: () => void;
	onPermissionDecision: (
		requestId: string,
		decision: 'allow' | 'deny'
	) => void;
	onOpenResource: (
		folder: 'sources' | 'drafts' | 'done' | 'checks',
		relPath: string,
		name: string
	) => void;
};

export function TaskDetailScreen( {
	run,
	definition,
	projectName,
	projectPath,
	permissions,
	onBack,
	onStop,
	onRerun,
	onPermissionDecision,
	onOpenResource,
}: TaskDetailScreenProps ): React.ReactElement {
	const [ messages, setMessages ] = useState< Message[] >( [] );
	const [ slot, setSlot ] = useState< HTMLElement | null >( null );

	useEffect( () => {
		setSlot( document.getElementById( 'task-detail-titlebar-slot' ) );
	}, [] );

	// Load the transcript, and while the run is live poll it — the run
	// transcript is not streamed over events.
	const terminal = isTerminalStatus( run.status );
	useEffect( () => {
		let cancelled = false;
		const load = (): void => {
			void window.api.tasks
				.runLoad( run.projectId, run.id )
				.then( ( persisted ) => {
					if ( ! cancelled ) {
						setMessages( persistedToMessages( persisted ) );
					}
				} );
		};
		load();
		if ( terminal ) {
			return () => {
				cancelled = true;
			};
		}
		const timer = setInterval( load, POLL_INTERVAL_MS );
		return () => {
			cancelled = true;
			clearInterval( timer );
		};
	}, [ run.projectId, run.id, terminal ] );

	const elapsed = ( (): string => {
		if ( run.startedAt && run.endedAt ) {
			const mins = Math.max(
				1,
				Math.round( ( run.endedAt - run.startedAt ) / 60000 )
			);
			return `ran for ${ mins }m`;
		}
		if ( run.startedAt ) {
			const rel = relativeDate( run.startedAt );
			return rel === 'now' ? 'started just now' : `started ${ rel } ago`;
		}
		return 'queued';
	} )();

	return (
		<div
			className="task-detail"
			data-testid="task-detail"
			data-status={ run.status }
		>
			{ slot &&
				createPortal(
					<div className="task-detail-titlebar">
						<button
							type="button"
							className="task-detail-back"
							data-testid="task-detail-back"
							aria-label="Back to Tasks"
							title="Back to Tasks"
							onClick={ onBack }
						>
							<span aria-hidden="true">←</span>
						</button>
						<span className="task-detail-titlebar-name">
							{ run.title }
						</span>
						<span
							className="task-detail-status-chip"
							data-testid="task-detail-status-chip"
							data-status={ run.status }
						>
							{ TASK_STATUS_LABEL[ run.status ] }
						</span>
					</div>,
					slot
				) }

			<div className="task-detail-body">
				<div className="task-detail-header">
					<div
						className="task-detail-meta"
						data-testid="task-detail-meta"
					>
						<span>
							{ definition
								? describeSchedule( definition.schedule )
								: 'One-off' }
						</span>
						<span
							className="task-detail-meta-sep"
							aria-hidden="true"
						>
							·
						</span>
						<span>{ projectName }</span>
						<span
							className="task-detail-meta-sep"
							aria-hidden="true"
						>
							·
						</span>
						<span>{ elapsed }</span>
					</div>

					<div className="task-detail-actions">
						{ ! terminal && (
							<button
								type="button"
								className="task-detail-action task-detail-action-stop"
								data-testid="task-detail-stop"
								onClick={ onStop }
							>
								<StopIcon size={ 11 } />
								Stop
							</button>
						) }
						{ terminal && definition && (
							<button
								type="button"
								className="task-detail-action"
								data-testid="task-detail-rerun"
								onClick={ onRerun }
							>
								<RefreshIcon size={ 13 } />
								Run again
							</button>
						) }
					</div>
				</div>

				{ run.summary && (
					<p
						className="task-detail-summary"
						data-testid="task-detail-result"
					>
						{ run.summary }
					</p>
				) }

				<ChatTranscript
					messages={ messages }
					projectPath={ projectPath }
					onPreviewAttachment={ onOpenResource }
					testId="task-detail-transcript"
					emptyState={
						<div className="task-detail-waiting">
							Waiting for the task to start…
						</div>
					}
				/>

				{ permissions.length > 0 && (
					<PermissionPrompt
						request={ permissions[ 0 ] }
						mode="task"
						onDecision={ ( requestId, decision ) =>
							onPermissionDecision( requestId, decision )
						}
					/>
				) }
			</div>
		</div>
	);
}
