import React, { useId, useRef, useState } from 'react';

import { ToolBlock } from './ToolBlock';
import type { ToolMessage } from '../screens/ProjectScreen';

export type ToolGroupProps = {
	tools: ToolMessage[];
};

export function ToolGroup( { tools }: ToolGroupProps ): React.ReactElement {
	const bodyId = useId();
	const anyRunning = tools.some( ( t ) => t.status === 'running' );
	const lastTool = tools[ tools.length - 1 ];
	const lastErrored = lastTool?.status === 'error';

	const [ userToggled, setUserToggled ] = useState( false );
	const [ userExpanded, setUserExpanded ] = useState( false );

	// Once every tool in a multi-tool group finishes, lock the collapsed
	// state so the group doesn't auto-re-expand when the next batch of
	// tool-use-start events arrives (which would flash the entire body).
	const hasCompletedRef = useRef( false );
	if ( ! anyRunning && tools.length > 1 ) {
		hasCompletedRef.current = true;
	}

	const expanded = userToggled
		? userExpanded
		: anyRunning && ! hasCompletedRef.current;

	// Single tool — render the bare ToolBlock without group chrome.
	if ( tools.length === 1 ) {
		const t = tools[ 0 ];
		return (
			<ToolBlock
				toolName={ t.toolName }
				input={ t.input }
				status={ t.status }
				output={ t.output }
			/>
		);
	}

	let statusLabel = 'done';
	if ( anyRunning ) {
		statusLabel = 'working…';
	} else if ( lastErrored ) {
		statusLabel = 'error';
	}

	let status: 'running' | 'done' | 'error' = 'done';
	if ( anyRunning ) {
		status = 'running';
	} else if ( lastErrored ) {
		status = 'error';
	}

	return (
		<div
			className="tool-group"
			data-testid="tool-group"
			data-status={ status }
			data-expanded={ expanded }
		>
			<button
				type="button"
				className="tool-group-summary"
				aria-expanded={ expanded }
				aria-controls={ bodyId }
				onClick={ () => {
					setUserExpanded( ! expanded );
					setUserToggled( true );
				} }
			>
				<span className="tool-group-chevron" aria-hidden="true">
					▸
				</span>
				<span className="tool-group-count">
					{ `${ tools.length } steps` }
				</span>
				<span className="tool-group-status">{ statusLabel }</span>
			</button>
			{ expanded && (
				<div className="tool-group-body" id={ bodyId }>
					{ tools.map( ( t ) => (
						<ToolBlock
							key={ t.id }
							toolName={ t.toolName }
							input={ t.input }
							status={ t.status }
							output={ t.output }
						/>
					) ) }
				</div>
			) }
		</div>
	);
}
