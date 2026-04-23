import React from 'react';

import { stripAnsi } from '../lib/stripAnsi';

export type ToolBlockProps = {
	toolName: string;
	input: unknown;
	status: 'running' | 'done' | 'error';
	output?: string;
};

function bashCommand( input: unknown ): string | null {
	if (
		typeof input === 'object' &&
		input !== null &&
		typeof ( input as { command?: unknown } ).command === 'string'
	) {
		return ( input as { command: string } ).command;
	}
	return null;
}

export function ToolBlock( {
	toolName,
	input,
	status,
	output,
}: ToolBlockProps ): React.ReactElement {
	const isBash = toolName === 'Bash';
	const command = isBash ? bashCommand( input ) : null;
	const testId = isBash ? 'tool-block-bash' : 'tool-block';
	let statusLabel = 'done';
	if ( status === 'running' ) {
		statusLabel = 'running…';
	} else if ( status === 'error' ) {
		statusLabel = 'error';
	}

	return (
		<div
			className={ `tool-block${ isBash ? ' tool-block-bash' : '' }` }
			data-testid={ testId }
			data-status={ status }
		>
			<div className="tool-block-header">
				<span className="tool-block-name">{ toolName }</span>
				<span className="tool-block-status">{ statusLabel }</span>
			</div>
			{ command !== null ? (
				<pre className="tool-block-command">{ `$ ${ command }` }</pre>
			) : (
				<pre className="tool-block-input">
					{ JSON.stringify( input, null, 2 ) }
				</pre>
			) }
			{ output !== undefined && output.length > 0 && (
				<pre className="tool-output">{ stripAnsi( output ) }</pre>
			) }
		</div>
	);
}
