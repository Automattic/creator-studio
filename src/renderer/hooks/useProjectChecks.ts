import { useCallback, useEffect, useState } from 'react';

import type { DraftCheckMeta } from '../../types';

// Project-scoped checks state shared between the project view and the draft
// editor: list, watch, and the CRUD that doesn't depend on a draft body.
// The draft editor layers run/results state on top of this.
export type ProjectChecks = {
	checksMeta: DraftCheckMeta[];
	editingCheckRelPath: string | null;
	setEditingCheckRelPath: ( relPath: string | null ) => void;
	handleToggleCheckEnabled: (
		relPath: string,
		next: boolean
	) => Promise< void >;
	handleCreateCheck: () => Promise< void >;
	handleEditCheck: ( relPath: string ) => void;
	handleDeleteCheck: ( relPath: string ) => Promise< void >;
	handleResetCheckDefaults: () => Promise< void >;
};

export function useProjectChecks( projectId: string ): ProjectChecks {
	const [ checksMeta, setChecksMeta ] = useState< DraftCheckMeta[] >( [] );
	const [ editingCheckRelPath, setEditingCheckRelPath ] = useState<
		string | null
	>( null );

	// The watcher emits opaque "something changed" pings; we always re-pull
	// the full list. Drop stale responses if the project shifts under us.
	useEffect( () => {
		if ( ! projectId ) {
			setChecksMeta( [] );
			return;
		}
		let cancelled = false;
		const reload = async (): Promise< void > => {
			const list = await window.api.checks.list( projectId );
			if ( cancelled ) {
				return;
			}
			setChecksMeta( list );
		};
		void reload();
		void window.api.checks.watch( projectId );
		const off = window.api.checks.onFolderChanged( ( event ) => {
			if ( event.projectId !== projectId ) {
				return;
			}
			void reload();
		} );
		return () => {
			cancelled = true;
			off();
			void window.api.checks.unwatch();
		};
	}, [ projectId ] );

	const handleToggleCheckEnabled = useCallback(
		async ( relPath: string, next: boolean ): Promise< void > => {
			// Read-modify-write so we preserve `body` and any extra
			// frontmatter keys the user might have. The folder watcher
			// re-pulls metadata from the resulting write.
			const current = await window.api.checks.read( projectId, relPath );
			if ( ! current ) {
				return;
			}
			await window.api.checks.write( projectId, relPath, {
				title: current.title,
				enabled: next,
				body: current.body,
				frontmatter: current.frontmatter,
				expectedMtime: current.mtime,
			} );
		},
		[ projectId ]
	);

	const handleCreateCheck = useCallback( async (): Promise< void > => {
		const result = await window.api.checks.create( projectId );
		if ( result.ok ) {
			setEditingCheckRelPath( result.relPath );
		}
	}, [ projectId ] );

	const handleEditCheck = useCallback( ( relPath: string ): void => {
		setEditingCheckRelPath( relPath );
	}, [] );

	const handleDeleteCheck = useCallback(
		async ( relPath: string ): Promise< void > => {
			await window.api.checks.delete( projectId, relPath );
			setEditingCheckRelPath( ( current ) =>
				current === relPath ? null : current
			);
		},
		[ projectId ]
	);

	const handleResetCheckDefaults = useCallback( async (): Promise< void > => {
		await window.api.checks.resetDefaults( projectId );
	}, [ projectId ] );

	return {
		checksMeta,
		editingCheckRelPath,
		setEditingCheckRelPath,
		handleToggleCheckEnabled,
		handleCreateCheck,
		handleEditCheck,
		handleDeleteCheck,
		handleResetCheckDefaults,
	};
}
