import { diffWordsWithSpace } from 'diff';
import React, { useCallback, useEffect, useMemo, useState } from 'react';

import { computeDiffStats } from '../lib/diff-stats';

type SnapshotSource = 'agent' | 'manual' | 'idle' | 'pre-agent' | 'pre-restore';

type LoadedSnapshot = {
	id: string;
	takenAt: number;
	source: SnapshotSource;
	title: string;
	body: string;
};

type Props = {
	projectId: string;
	relPath: string;
	folder: 'sources' | 'drafts' | 'done' | 'checks';
	snapshotId: string;
	onClose: () => void;
	onRestored?: () => void;
};

const SOURCE_LABEL: Record< SnapshotSource, string > = {
	agent: 'Agent',
	manual: 'Manual',
	idle: 'Auto',
	'pre-agent': 'Pre-agent',
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

export function DraftHistoryDiffView( {
	projectId,
	relPath,
	folder,
	snapshotId,
	onClose,
	onRestored,
}: Props ): React.ReactElement {
	const [ snapshot, setSnapshot ] = useState< LoadedSnapshot | null >( null );
	// The body we diff against. For most snapshots this is the live draft;
	// for 'agent' snapshots it's the matching 'pre-agent' body so the diff
	// shows what the agent actually changed.
	const [ referenceBody, setReferenceBody ] = useState< string >( '' );
	const [ loading, setLoading ] = useState( true );
	const [ restoring, setRestoring ] = useState( false );
	const [ error, setError ] = useState< string | null >( null );

	useEffect( () => {
		let cancelled = false;
		setLoading( true );
		setError( null );
		void ( async () => {
			const snapRes = await window.api.drafts.history.read(
				projectId,
				relPath,
				folder,
				snapshotId
			);
			if ( cancelled ) {
				return;
			}
			if ( ! snapRes.ok ) {
				setError( 'Could not load snapshot.' );
				setLoading( false );
				return;
			}
			const snap = snapRes.snapshot;
			setSnapshot( {
				id: snap.id,
				takenAt: snap.takenAt,
				source: snap.source,
				title: snap.title,
				body: snap.body,
			} );

			if ( snap.source === 'pre-agent' ) {
				// Pre-agent is the baseline — no diff reference needed.
				setReferenceBody( snap.body );
			} else if ( snap.source === 'agent' ) {
				// Diff the agent snapshot against its pre-agent counterpart
				// so the diff shows what the agent actually changed.
				const list = await window.api.drafts.history.list(
					projectId,
					relPath,
					folder
				);
				if ( cancelled ) {
					return;
				}
				const preAgent = list.find(
					( s ) =>
						s.source === 'pre-agent' &&
						s.takenAt < snap.takenAt &&
						snap.takenAt - s.takenAt < 5000
				);
				if ( preAgent ) {
					const preRes = await window.api.drafts.history.read(
						projectId,
						relPath,
						folder,
						preAgent.id
					);
					if ( cancelled ) {
						return;
					}
					setReferenceBody(
						preRes.ok ? preRes.snapshot.body : snap.body
					);
				} else {
					const currentRes = await window.api.drafts.read(
						projectId,
						relPath,
						{ folder }
					);
					if ( cancelled ) {
						return;
					}
					setReferenceBody( currentRes?.body ?? '' );
				}
			} else {
				const currentRes = await window.api.drafts.read(
					projectId,
					relPath,
					{ folder }
				);
				if ( cancelled ) {
					return;
				}
				setReferenceBody( currentRes?.body ?? '' );
			}
			setLoading( false );
		} )();
		return () => {
			cancelled = true;
		};
	}, [ projectId, relPath, folder, snapshotId ] );

	const diffParts = useMemo( () => {
		if ( ! snapshot ) {
			return [];
		}
		// For agent snapshots the reference is the pre-agent body, so we diff
		// reference → snapshot (old → new). For everything else we diff
		// snapshot → current (old → current).
		return snapshot.source === 'agent'
			? diffWordsWithSpace( referenceBody, snapshot.body )
			: diffWordsWithSpace( snapshot.body, referenceBody );
	}, [ snapshot, referenceBody ] );

	const hasChanges = useMemo(
		() => diffParts.some( ( p ) => p.added || p.removed ),
		[ diffParts ]
	);

	const stats = useMemo( () => computeDiffStats( diffParts ), [ diffParts ] );

	const onRestore = useCallback( async () => {
		if ( ! snapshot || restoring ) {
			return;
		}
		setRestoring( true );
		try {
			const res = await window.api.drafts.history.restore(
				projectId,
				relPath,
				folder,
				snapshot.id
			);
			if ( res.ok ) {
				onRestored?.();
				onClose();
			}
		} finally {
			setRestoring( false );
		}
	}, [
		snapshot,
		restoring,
		projectId,
		relPath,
		folder,
		onRestored,
		onClose,
	] );

	const now = Date.now();

	return (
		<div
			className="draft-history-diff-view"
			data-testid="draft-history-diff-view"
		>
			<div className="draft-history-diff-toolbar">
				<div className="draft-history-diff-meta">
					{ snapshot && (
						<>
							<span
								className="draft-history-diff-meta-time"
								title={ new Date(
									snapshot.takenAt
								).toLocaleString() }
							>
								Viewing snapshot from{ ' ' }
								{ formatRelative( snapshot.takenAt, now ) }
							</span>
							<span
								className="draft-history-item-source"
								data-source={ snapshot.source }
							>
								{ SOURCE_LABEL[ snapshot.source ] }
							</span>
						</>
					) }
				</div>
				<div className="draft-history-diff-actions">
					<button
						type="button"
						className="draft-history-restore"
						data-testid="draft-history-diff-restore"
						onClick={ onRestore }
						disabled={ ! snapshot || restoring }
					>
						{ restoring ? 'Restoring…' : 'Restore' }
					</button>
					<button
						type="button"
						className="draft-history-back"
						data-testid="draft-history-diff-close"
						onClick={ onClose }
					>
						Close
					</button>
				</div>
			</div>
			{ loading && (
				<div className="draft-history-diff-empty">
					Loading snapshot…
				</div>
			) }
			{ ! loading && error && (
				<div
					className="draft-history-diff-empty"
					data-testid="draft-history-diff-error"
				>
					{ error }
				</div>
			) }
			{ ! loading && ! error && snapshot && (
				<>
					{ ! hasChanges && (
						<div
							className="draft-history-diff-empty"
							data-testid="draft-history-diff-unchanged"
						>
							No changes since this snapshot.
						</div>
					) }
					<pre
						className="draft-history-diff-body"
						data-testid="draft-history-diff-body"
					>
						{ diffParts.map( ( part, i ) => {
							if ( part.added ) {
								return (
									<ins
										key={ i }
										className="draft-history-diff-add"
									>
										{ part.value }
									</ins>
								);
							}
							if ( part.removed ) {
								return (
									<del
										key={ i }
										className="draft-history-diff-del"
									>
										{ part.value }
									</del>
								);
							}
							return (
								<span
									key={ i }
									className="draft-history-diff-same"
								>
									{ part.value }
								</span>
							);
						} ) }
					</pre>
					<div
						className="draft-history-diff-statusbar"
						data-testid="draft-history-diff-statusbar"
					>
						<span data-testid="draft-history-diff-stat-edits">
							{ stats.edits }{ ' ' }
							{ stats.edits === 1 ? 'edit' : 'edits' }
						</span>
						<span
							className="draft-history-diff-stat-add"
							data-testid="draft-history-diff-stat-add"
						>
							+{ stats.added }
						</span>
						<span
							className="draft-history-diff-stat-del"
							data-testid="draft-history-diff-stat-del"
						>
							−{ stats.removed }
						</span>
					</div>
				</>
			) }
		</div>
	);
}
