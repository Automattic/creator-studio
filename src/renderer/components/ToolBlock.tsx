import React, { useId, useState } from 'react';

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

function filePath( input: unknown ): string | null {
	if (
		typeof input === 'object' &&
		input !== null &&
		typeof ( input as { file_path?: unknown } ).file_path === 'string'
	) {
		return ( input as { file_path: string } ).file_path;
	}
	return null;
}

function basename( path: string ): string {
	const trimmed = path.replace( /\/+$/, '' );
	const idx = trimmed.lastIndexOf( '/' );
	return idx === -1 ? trimmed : trimmed.slice( idx + 1 );
}

function patternArg( input: unknown ): string | null {
	if (
		typeof input === 'object' &&
		input !== null &&
		typeof ( input as { pattern?: unknown } ).pattern === 'string'
	) {
		return ( input as { pattern: string } ).pattern;
	}
	return null;
}

function formatBytes( n: number ): string {
	if ( n < 1024 ) {
		return `${ n } B`;
	}
	if ( n < 1024 * 1024 ) {
		return `${ ( n / 1024 ).toFixed( 1 ) } KB`;
	}
	return `${ ( n / ( 1024 * 1024 ) ).toFixed( 1 ) } MB`;
}

function lineCount( s: string ): number {
	if ( s.length === 0 ) {
		return 0;
	}
	const trailing = s.endsWith( '\n' ) ? 1 : 0;
	return s.split( '\n' ).length - trailing;
}

function summarize(
	toolName: string,
	input: unknown,
	output: string | undefined
): { arg: string; hint: string | null } {
	if ( toolName === 'Bash' ) {
		const cmd = bashCommand( input ) ?? '';
		let hint: string | null = null;
		if ( typeof output === 'string' && output.length > 0 ) {
			const cleaned = stripAnsi( output );
			const lines = lineCount( cleaned );
			if ( lines > 1 ) {
				hint = `${ lines } lines`;
			} else {
				hint = formatBytes( cleaned.length );
			}
		}
		return { arg: cmd, hint };
	}

	if (
		toolName === 'Read' ||
		toolName === 'Write' ||
		toolName === 'Edit' ||
		toolName === 'NotebookEdit'
	) {
		const path = filePath( input );
		const arg = path ? basename( path ) : JSON.stringify( input );
		let hint: string | null = null;
		if (
			toolName === 'Read' &&
			typeof output === 'string' &&
			output.length > 0
		) {
			hint = `${ lineCount( stripAnsi( output ) ) } lines`;
		}
		return { arg, hint };
	}

	if ( toolName === 'Glob' || toolName === 'Grep' ) {
		const pattern = patternArg( input );
		const arg = pattern ?? JSON.stringify( input );
		let hint: string | null = null;
		if ( typeof output === 'string' && output.length > 0 ) {
			hint = `${ lineCount( stripAnsi( output ) ) } matches`;
		}
		return { arg, hint };
	}

	const fallback = JSON.stringify( input );
	return {
		arg: fallback.length > 80 ? fallback.slice( 0, 80 ) + '…' : fallback,
		hint: null,
	};
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
	const bodyId = useId();

	const [ userToggled, setUserToggled ] = useState( false );
	const [ userExpanded, setUserExpanded ] = useState( false );
	const defaultExpanded = status !== 'done';
	const expanded = userToggled ? userExpanded : defaultExpanded;

	let statusLabel = 'done';
	if ( status === 'running' ) {
		statusLabel = 'running…';
	} else if ( status === 'error' ) {
		statusLabel = 'error';
	}

	const { arg, hint } = summarize( toolName, input, output );

	return (
		<div
			className={ `tool-block${ isBash ? ' tool-block-bash' : '' }` }
			data-testid={ testId }
			data-status={ status }
			data-expanded={ expanded }
		>
			<button
				type="button"
				className="tool-block-summary"
				aria-expanded={ expanded }
				aria-controls={ bodyId }
				onClick={ () => {
					setUserExpanded( ! expanded );
					setUserToggled( true );
				} }
			>
				<span className="tool-block-chevron" aria-hidden="true">
					▸
				</span>
				<span className="tool-block-name">{ toolName }</span>
				<span className="tool-block-summary-arg">{ arg }</span>
				{ hint !== null && (
					<span className="tool-block-summary-hint">{ hint }</span>
				) }
				<span className="tool-block-status">{ statusLabel }</span>
			</button>
			{ expanded && (
				<div className="tool-block-body" id={ bodyId }>
					{ command !== null ? (
						<pre className="tool-block-command">{ `$ ${ command }` }</pre>
					) : (
						<pre className="tool-block-input">
							{ JSON.stringify( input, null, 2 ) }
						</pre>
					) }
					{ output !== undefined && output.length > 0 && (
						<pre className="tool-output">
							{ stripAnsi( output ) }
						</pre>
					) }
				</div>
			) }
		</div>
	);
}
