import React, { useCallback, useEffect, useState } from 'react';

import type { DirEntry } from '../../types';

type LoadState =
	| { status: 'idle' }
	| { status: 'loading' }
	| { status: 'loaded'; entries: DirEntry[] }
	| { status: 'error' };

function joinPath( parent: string, name: string ): string {
	return parent ? `${ parent }/${ name }` : name;
}

type NodeProps = {
	projectId: string;
	relPath: string;
	name: string;
	isDirectory: boolean;
	depth: number;
};

function TreeNode( {
	projectId,
	relPath,
	name,
	isDirectory,
	depth,
}: NodeProps ): React.ReactElement {
	const [ open, setOpen ] = useState( false );
	const [ load, setLoad ] = useState< LoadState >( { status: 'idle' } );

	// Fetch on first toggle-open. Done in the handler (not an effect) so the
	// in-flight promise isn't cancelled by the re-render that flips status to
	// 'loading' — putting `load.status` in an effect dep array creates a
	// cleanup-then-bail race that strands the node at "Loading…".
	const onToggle = useCallback( (): void => {
		setOpen( ( wasOpen ) => {
			if ( ! wasOpen && load.status === 'idle' ) {
				setLoad( { status: 'loading' } );
				void window.api.project
					.listFiles( projectId, relPath )
					.then( ( entries ) =>
						setLoad( { status: 'loaded', entries } )
					)
					.catch( () => setLoad( { status: 'error' } ) );
			}
			return ! wasOpen;
		} );
	}, [ load.status, projectId, relPath ] );

	const indent = { paddingLeft: `${ 8 + depth * 14 }px` };

	if ( ! isDirectory ) {
		return (
			<div
				className="resources-tree-row resources-tree-file"
				style={ indent }
			>
				<span className="resources-tree-bullet" aria-hidden="true">
					·
				</span>
				<span className="resources-tree-name">{ name }</span>
			</div>
		);
	}

	return (
		<div className="resources-tree-node">
			<button
				type="button"
				className="resources-tree-row resources-tree-dir"
				style={ indent }
				onClick={ onToggle }
				aria-expanded={ open }
			>
				<span className="resources-tree-caret" aria-hidden="true">
					{ open ? '▾' : '▸' }
				</span>
				<span className="resources-tree-name">{ name }</span>
			</button>
			{ open && (
				<div className="resources-tree-children" role="group">
					{ load.status === 'loading' && (
						<div
							className="resources-tree-hint"
							style={ {
								paddingLeft: `${ 8 + ( depth + 1 ) * 14 }px`,
							} }
						>
							Loading…
						</div>
					) }
					{ load.status === 'error' && (
						<div
							className="resources-tree-hint"
							style={ {
								paddingLeft: `${ 8 + ( depth + 1 ) * 14 }px`,
							} }
						>
							Failed to read
						</div>
					) }
					{ load.status === 'loaded' && load.entries.length === 0 && (
						<div
							className="resources-tree-hint"
							style={ {
								paddingLeft: `${ 8 + ( depth + 1 ) * 14 }px`,
							} }
						>
							Empty
						</div>
					) }
					{ load.status === 'loaded' &&
						load.entries.map( ( entry ) => (
							<TreeNode
								key={ entry.name }
								projectId={ projectId }
								relPath={ joinPath( relPath, entry.name ) }
								name={ entry.name }
								isDirectory={ entry.isDirectory }
								depth={ depth + 1 }
							/>
						) ) }
				</div>
			) }
		</div>
	);
}

type Props = {
	projectId: string;
};

export function ResourcesTree( { projectId }: Props ): React.ReactElement {
	const [ load, setLoad ] = useState< LoadState >( { status: 'idle' } );

	useEffect( () => {
		let cancelled = false;
		setLoad( { status: 'loading' } );
		void window.api.project
			.listFiles( projectId, '' )
			.then( ( entries ) => {
				if ( cancelled ) {
					return;
				}
				setLoad( { status: 'loaded', entries } );
			} )
			.catch( () => {
				if ( cancelled ) {
					return;
				}
				setLoad( { status: 'error' } );
			} );
		return () => {
			cancelled = true;
		};
	}, [ projectId ] );

	if ( load.status === 'loading' || load.status === 'idle' ) {
		return (
			<div
				className="resources-tree-hint"
				data-testid="resources-loading"
			>
				Loading…
			</div>
		);
	}
	if ( load.status === 'error' ) {
		return (
			<div className="resources-tree-hint" data-testid="resources-error">
				Failed to read folder
			</div>
		);
	}
	if ( load.entries.length === 0 ) {
		return (
			<div
				className="resources-tree-hint"
				data-testid="resources-tree-empty"
			>
				Folder is empty
			</div>
		);
	}
	return (
		<div
			className="resources-tree"
			data-testid="resources-tree"
			role="tree"
		>
			{ load.entries.map( ( entry ) => (
				<TreeNode
					key={ entry.name }
					projectId={ projectId }
					relPath={ entry.name }
					name={ entry.name }
					isDirectory={ entry.isDirectory }
					depth={ 0 }
				/>
			) ) }
		</div>
	);
}
