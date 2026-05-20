import React, { useCallback, useEffect, useState } from 'react';

type SnapshotSource = 'agent' | 'manual' | 'idle' | 'pre-restore';

type SnapshotMeta = {
	id: string;
	takenAt: number;
	source: SnapshotSource;
};

type Props = {
	projectId: string;
	relPath: string;
	folder: 'sources' | 'drafts' | 'done' | 'checks';
	selectedSnapshotId: string | null;
	onSelectSnapshot: ( id: string | null ) => void;
};

const SOURCE_LABEL: Record< SnapshotSource, string > = {
	agent: 'Agent',
	manual: 'Manual',
	idle: 'Auto',
	'pre-restore': 'Pre-restore',
};

const RTF = new Intl.RelativeTimeFormat( undefined, { numeric: 'auto' } );

function formatRelative( ts: number, now: number ): string {
	const diffSec = Math.round( ( ts - now ) / 1000 );
	const abs = Math.abs( diffSec );
	if ( abs < 60 ) {
		return RTF.format( diffSec, 'second' );
	}
	if ( abs < 3600 ) {
		return RTF.format( Math.round( diffSec / 60 ), 'minute' );
	}
	if ( abs < 86_400 ) {
		return RTF.format( Math.round( diffSec / 3600 ), 'hour' );
	}
	return RTF.format( Math.round( diffSec / 86_400 ), 'day' );
}

export function DraftHistoryPanel( {
	projectId,
	relPath,
	folder,
	selectedSnapshotId,
	onSelectSnapshot,
}: Props ): React.ReactElement {
	const [ snapshots, setSnapshots ] = useState< SnapshotMeta[] >( [] );
	const [ taking, setTaking ] = useState( false );
	const [ now, setNow ] = useState( () => Date.now() );

	const refresh = useCallback( async () => {
		if ( ! projectId || ! relPath ) {
			return;
		}
		const list = await window.api.drafts.history.list(
			projectId,
			relPath,
			folder
		);
		setSnapshots( list );
	}, [ projectId, relPath, folder ] );

	useEffect( () => {
		void refresh();
	}, [ refresh ] );

	useEffect( () => {
		if ( ! projectId || ! relPath ) {
			return undefined;
		}
		const unsubscribe = window.api.drafts.history.onChanged( ( event ) => {
			if (
				event.projectId === projectId &&
				event.folder === folder &&
				event.relPath === relPath
			) {
				void refresh();
			}
		} );
		return unsubscribe;
	}, [ projectId, relPath, folder, refresh ] );

	useEffect( () => {
		const id = window.setInterval( () => setNow( Date.now() ), 30_000 );
		return () => window.clearInterval( id );
	}, [] );

	const onTakeSnapshot = useCallback( async () => {
		if ( taking || ! projectId || ! relPath ) {
			return;
		}
		setTaking( true );
		try {
			await window.api.drafts.history.snapshot(
				projectId,
				relPath,
				folder,
				'manual'
			);
			await refresh();
		} finally {
			setTaking( false );
		}
	}, [ taking, projectId, relPath, folder, refresh ] );

	const onRowClick = useCallback(
		( id: string ) => {
			// Clicking the active row again returns the main pane to the
			// live editor — simpler than a separate close affordance.
			onSelectSnapshot( id === selectedSnapshotId ? null : id );
		},
		[ onSelectSnapshot, selectedSnapshotId ]
	);

	return (
		<div
			className="draft-history-panel"
			data-testid="draft-history-panel"
			data-view="list"
		>
			<div className="draft-history-header">
				<button
					type="button"
					className="draft-history-snapshot-btn"
					data-testid="draft-history-snapshot"
					onClick={ onTakeSnapshot }
					disabled={ taking || ! projectId || ! relPath }
				>
					{ taking ? 'Taking snapshot…' : 'Take snapshot' }
				</button>
			</div>
			<ul
				className="draft-history-list"
				data-testid="draft-history-list"
				aria-label="Document history"
			>
				<li
					className="draft-history-item"
					data-testid="draft-history-current"
					data-current="true"
				>
					<span className="draft-history-item-time">Current</span>
					<span className="draft-history-item-source">Live</span>
				</li>
				{ snapshots.length === 0 && (
					<li
						className="draft-history-empty"
						data-testid="draft-history-empty"
					>
						No snapshots yet.
					</li>
				) }
				{ snapshots.map( ( s ) => (
					<li key={ s.id } className="draft-history-row">
						<button
							type="button"
							className="draft-history-item draft-history-item-button"
							data-testid={ `draft-history-item-${ s.id }` }
							data-selected={
								s.id === selectedSnapshotId ? 'true' : 'false'
							}
							onClick={ () => onRowClick( s.id ) }
						>
							<span
								className="draft-history-item-time"
								title={ new Date( s.takenAt ).toLocaleString() }
							>
								{ formatRelative( s.takenAt, now ) }
							</span>
							<span
								className="draft-history-item-source"
								data-source={ s.source }
							>
								{ SOURCE_LABEL[ s.source ] }
							</span>
						</button>
					</li>
				) ) }
			</ul>
		</div>
	);
}
