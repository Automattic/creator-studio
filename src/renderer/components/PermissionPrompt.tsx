import React from 'react';

export type PermissionRequest = {
	requestId: string;
	projectId: string;
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
};

export function PermissionPrompt( {
	request,
	onDecision,
}: PermissionPromptProps ): React.ReactElement {
	return (
		<div
			className="permission-prompt"
			data-testid="permission-prompt"
			role="alertdialog"
			aria-label={ `Permission request for ${ request.toolName }` }
		>
			<div className="permission-prompt-title">
				Claude wants to use <strong>{ request.toolName }</strong>
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
			</div>
		</div>
	);
}
