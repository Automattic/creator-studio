import React from 'react';

import type { PermissionRequestDetail } from '../../types';

import { ShieldIcon } from '../icons';

export type PermissionRequest = {
	requestId: string;
	projectId: string;
	chatId: string;
	// Set for task-run permission requests (chatId is empty in that case) so
	// the decision can be routed back to the right run.
	runId?: string;
	toolName: string;
	input: unknown;
	// Optional structured context for a tailored prompt card. Falls back to
	// the generic JSON view when absent.
	detail?: PermissionRequestDetail;
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

function asRecord( input: unknown ): Record< string, unknown > | null {
	return typeof input === 'object' &&
		input !== null &&
		! Array.isArray( input )
		? ( input as Record< string, unknown > )
		: null;
}

function stringField(
	rec: Record< string, unknown > | null,
	key: string
): string | null {
	const value = rec?.[ key ];
	return typeof value === 'string' && value.length > 0 ? value : null;
}

// Renders the tool input the way the user needs to read it to make a call:
// a Bash command as a terminal block, a file/URL argument as a labelled
// field, anything else as pretty-printed JSON.
function PermissionPromptDetail( {
	input,
	detail,
}: {
	input: unknown;
	detail?: PermissionRequestDetail;
} ): React.ReactElement {
	if ( detail?.kind === 'wp-publish' ) {
		return <PermissionPromptWpPublish detail={ detail } />;
	}

	const rec = asRecord( input );
	const command = stringField( rec, 'command' );
	const description = stringField( rec, 'description' );
	const filePath = stringField( rec, 'file_path' );
	const url = stringField( rec, 'url' );

	if ( command !== null ) {
		return (
			<div className="permission-prompt-detail">
				<pre className="permission-prompt-command">{ `$ ${ command }` }</pre>
				{ description !== null && (
					<p className="permission-prompt-caption">{ description }</p>
				) }
			</div>
		);
	}

	if ( filePath !== null || url !== null ) {
		return (
			<dl className="permission-prompt-fields">
				{ filePath !== null && (
					<>
						<dt>File</dt>
						<dd>{ filePath }</dd>
					</>
				) }
				{ url !== null && (
					<>
						<dt>URL</dt>
						<dd>{ url }</dd>
					</>
				) }
			</dl>
		);
	}

	return (
		<pre className="permission-prompt-input">
			{ JSON.stringify( input, null, 2 ) }
		</pre>
	);
}

function PermissionPromptWpPublish( {
	detail,
}: {
	detail: Extract< PermissionRequestDetail, { kind: 'wp-publish' } >;
} ): React.ReactElement {
	const displayPath = `${ detail.draftFolder }/${ detail.draftRelPath }`;
	return (
		<dl
			className="permission-prompt-fields"
			data-testid="permission-prompt-wp-publish"
		>
			<dt>Draft</dt>
			<dd>
				{ detail.draftTitle ? (
					<>
						<strong>{ detail.draftTitle }</strong>
						<span className="permission-prompt-subtle">
							{ ' ' }
							({ displayPath })
						</span>
					</>
				) : (
					displayPath
				) }
			</dd>
			<dt>Site</dt>
			<dd>
				<strong>{ detail.connectionLabel }</strong>
				<span className="permission-prompt-subtle">
					{ ' ' }
					({ detail.connectionSiteUrl })
				</span>
			</dd>
		</dl>
	);
}

function renderPromptTitle(
	request: PermissionRequest,
	mode: 'chat' | 'task'
): React.ReactNode {
	if ( request.detail?.kind === 'wp-publish' ) {
		return mode === 'task'
			? 'This task wants to publish to WordPress'
			: 'Studio Write wants to publish to WordPress';
	}
	return (
		<>
			{ mode === 'task'
				? 'This task needs your OK to use '
				: 'Studio Write wants to use ' }
			<strong>{ request.toolName }</strong>
		</>
	);
}

export function PermissionPrompt( {
	request,
	onDecision,
	mode = 'chat',
}: PermissionPromptProps ): React.ReactElement {
	return (
		<div
			className="permission-prompt"
			data-testid="permission-prompt"
			data-mode={ mode }
			role="alertdialog"
			aria-label={ `Permission request for ${ request.toolName }` }
		>
			<div className="permission-prompt-head">
				<span className="permission-prompt-icon" aria-hidden="true">
					<ShieldIcon size={ 15 } />
				</span>
				<span className="permission-prompt-title">
					{ renderPromptTitle( request, mode ) }
				</span>
			</div>

			<PermissionPromptDetail
				input={ request.input }
				detail={ request.detail }
			/>

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
