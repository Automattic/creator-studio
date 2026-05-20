import React from 'react';

export type PermissionRequest = {
	requestId: string;
	projectId: string;
	chatId: string;
	// Set for task-run permission requests (chatId is empty in that case) so
	// the decision can be routed back to the right run.
	runId?: string;
	toolName: string;
	input: unknown;
};

export type PermissionPromptProps = {
	request: PermissionRequest;
	onDecision: (
		requestId: string,
		decision: 'allow' | 'deny',
		remember: boolean
	) => void;
	// 'task' collapses to a simple Deny / Approve pair — background task runs
	// have no per-session permission memory.
	mode?: 'chat' | 'task';
};

export function PermissionPrompt( {
	request,
	onDecision,
	mode = 'chat',
}: PermissionPromptProps ): React.ReactElement {
	return (
		<div
			className="permission-prompt"
			data-testid="permission-prompt"
			role="alertdialog"
			aria-label={ `Permission request for ${ request.toolName }` }
		>
			<div className="permission-prompt-title">
				{ mode === 'task'
					? 'This task needs your OK to use '
					: 'Claude wants to use ' }
				<strong>{ request.toolName }</strong>
			</div>
			<pre className="permission-prompt-input">
				{ JSON.stringify( request.input, null, 2 ) }
			</pre>
			<div className="permission-prompt-actions">
				<button
					type="button"
					className="permission-action permission-action-deny"
					data-testid="permission-deny"
					onClick={ () =>
						onDecision( request.requestId, 'deny', false )
					}
				>
					Deny
				</button>
				{ mode === 'task' ? (
					<button
						type="button"
						className="permission-action permission-action-primary"
						data-testid="permission-allow-once"
						onClick={ () =>
							onDecision( request.requestId, 'allow', false )
						}
					>
						Approve
					</button>
				) : (
					<>
						<button
							type="button"
							className="permission-action"
							data-testid="permission-allow-once"
							onClick={ () =>
								onDecision( request.requestId, 'allow', false )
							}
						>
							Allow once
						</button>
						<button
							type="button"
							className="permission-action permission-action-primary"
							data-testid="permission-allow-session"
							onClick={ () =>
								onDecision( request.requestId, 'allow', true )
							}
						>
							Allow for session
						</button>
					</>
				) }
			</div>
		</div>
	);
}
