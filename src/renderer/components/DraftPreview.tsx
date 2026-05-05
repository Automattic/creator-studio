import React, { useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

import { DeleteResourceDialog } from './DeleteResourceDialog';
import { ResourceActionMenu } from './ResourceActionMenu';
import { relativeDate } from '../lib/relativeDate';

type LoadState =
	| { status: 'loading' }
	| { status: 'loaded'; text: string; mtime: number | null }
	| { status: 'error' };

type Props = {
	projectId: string;
	folder: 'sources' | 'drafts' | 'published';
	relPath: string;
	name: string;
	addToChatDisabled: boolean;
	onBack: () => void;
	onAddToChat: () => void;
	onOpenNewChat: () => void;
	// Only set when the previewed file is editable (drafts today). If
	// undefined, the menu hides the Edit item.
	onEditDraft?: () => void;
	onDeleted: () => void;
};

const MENU_ID = 'draft-preview';

// In-project base directory for the open file, e.g. `drafts/2026-04` for
// `drafts/2026-04/foo.md` (or `drafts` for a root-level file). Used as the
// resolution base when the markdown contains relative image / link refs.
function fileBaseInProject(
	folder: 'sources' | 'drafts' | 'published',
	relPath: string
): string {
	const slash = relPath.lastIndexOf( '/' );
	const subDir = slash > 0 ? `/${ relPath.slice( 0, slash ) }` : '';
	return `${ folder }${ subDir }`;
}

// Rewrites markdown URLs so relative refs (`./images/foo.png`,
// `../sources/cover.jpg`) point at the project's `studio-asset://` protocol.
// The renderer can't fetch arbitrary `file://` URLs from its own origin,
// but the main process exposes `studio-asset://<projectId>/<inProjectPath>`
// which serves any file inside the project root (see main.ts).
//
// Absolute URLs (http, https, data, mailto, file, …) and `#anchor` links
// pass through unchanged — they're either user intent or already loadable.
function makeUrlTransform(
	projectId: string,
	inProjectBase: string
): ( url: string ) => string {
	return ( url ) => {
		if ( ! url ) {
			return url;
		}
		if ( /^(?:[a-z][a-z0-9+.-]*:|#|\/\/)/i.test( url ) ) {
			return url;
		}
		// Resolve against a synthetic base so `..` segments collapse
		// correctly. The hostname carries the project id; the pathname is
		// the resolved in-project path.
		const cleaned = url.replace( /^\.\//, '' );
		try {
			const resolved = new URL(
				cleaned,
				`studio-asset://${ projectId }/${ inProjectBase }/`
			);
			return resolved.href;
		} catch {
			return url;
		}
	};
}

export function DraftPreview( {
	projectId,
	folder,
	relPath,
	name,
	addToChatDisabled,
	onBack,
	onAddToChat,
	onOpenNewChat,
	onEditDraft,
	onDeleted,
}: Props ): React.ReactElement {
	const [ state, setState ] = useState< LoadState >( { status: 'loading' } );
	// Bumped each time the agent finishes a turn for this project; the
	// load effect re-keys on it so the preview reflects file edits the
	// agent just made. Cheap re-read, not a watcher — manual edits made
	// outside the app won't show until the next agent turn.
	const [ reloadNonce, setReloadNonce ] = useState( 0 );
	const [ openMenuId, setOpenMenuId ] = useState< string | null >( null );
	const [ pendingDeletion, setPendingDeletion ] = useState< {
		name: string;
	} | null >( null );
	const [ deleting, setDeleting ] = useState( false );
	const menuRef = useRef< HTMLDivElement | null >( null );

	// `relPath` is the path inside `<folder>/` (e.g. `foo.md` or
	// `2026-04/foo.md`); the read-file IPC channel expects a path relative
	// to the project root, so prepend the folder.
	const subPath = `${ folder }/${ relPath }`;

	useEffect( () => {
		if ( ! openMenuId ) {
			return;
		}
		const onKey = ( e: KeyboardEvent ): void => {
			if ( e.key === 'Escape' ) {
				setOpenMenuId( null );
			}
		};
		const onDocClick = ( e: MouseEvent ): void => {
			if (
				menuRef.current &&
				! menuRef.current.contains( e.target as Node )
			) {
				setOpenMenuId( null );
			}
		};
		document.addEventListener( 'keydown', onKey );
		document.addEventListener( 'mousedown', onDocClick );
		return () => {
			document.removeEventListener( 'keydown', onKey );
			document.removeEventListener( 'mousedown', onDocClick );
		};
	}, [ openMenuId ] );

	const confirmDelete = async (): Promise< void > => {
		if ( ! pendingDeletion || deleting ) {
			return;
		}
		setDeleting( true );
		try {
			const result = await window.api.resources.delete(
				projectId,
				folder,
				relPath
			);
			if ( ! result.ok ) {
				return;
			}
			onDeleted();
			setPendingDeletion( null );
			onBack();
		} finally {
			setDeleting( false );
		}
	};

	const cancelDelete = (): void => {
		if ( deleting ) {
			return;
		}
		setPendingDeletion( null );
	};

	useEffect( () => {
		const off = window.api.agent.onEvent( ( event ) => {
			if ( event.kind === 'done' && event.projectId === projectId ) {
				setReloadNonce( ( n ) => n + 1 );
			}
		} );
		return off;
	}, [ projectId ] );

	useEffect( () => {
		let cancelled = false;
		// On a refresh (reloadNonce > 0) keep showing the previous content
		// while we re-read — flashing "Loading…" mid-conversation would be
		// noisy.
		if ( reloadNonce === 0 ) {
			setState( { status: 'loading' } );
		}
		void window.api.project
			.readFile( projectId, subPath )
			.then( ( res ) => {
				if ( cancelled ) {
					return;
				}
				if ( ! res ) {
					setState( { status: 'error' } );
					return;
				}
				setState( {
					status: 'loaded',
					text: res.text,
					mtime: res.mtime,
				} );
			} )
			.catch( () => {
				if ( cancelled ) {
					return;
				}
				setState( { status: 'error' } );
			} );
		return () => {
			cancelled = true;
		};
	}, [ projectId, subPath, reloadNonce ] );

	const date =
		state.status === 'loaded' && state.mtime !== null
			? relativeDate( state.mtime )
			: null;

	return (
		<div className="draft-preview" data-testid="draft-preview">
			<div className="draft-preview-header">
				<button
					type="button"
					className="draft-preview-back"
					data-testid="draft-preview-back"
					onClick={ onBack }
					aria-label="Back to resources"
					title="Back to resources"
				>
					<span aria-hidden="true">‹</span> Back
				</button>
				<div className="draft-preview-title-wrap">
					<span
						className="draft-preview-title"
						data-testid="draft-preview-title"
						title={ relPath }
					>
						{ name }
					</span>
					{ date && (
						<span className="draft-preview-date">{ date }</span>
					) }
				</div>
				<div className="draft-preview-actions">
					<ResourceActionMenu
						menuId={ MENU_ID }
						openMenuId={ openMenuId }
						setOpenMenuId={ setOpenMenuId }
						menuRef={ menuRef }
						buttonTestId="draft-preview-menu-button"
						ariaLabel={ `Actions for ${ name }` }
						onEdit={ onEditDraft }
						onAddToChat={ onAddToChat }
						onOpenNewChat={ onOpenNewChat }
						addToChatDisabled={ addToChatDisabled }
						onDelete={ () => setPendingDeletion( { name } ) }
					/>
				</div>
			</div>
			<div
				className="draft-preview-body"
				data-testid="draft-preview-body"
			>
				{ state.status === 'loading' && (
					<div className="resources-grid-hint">Loading…</div>
				) }
				{ state.status === 'error' && (
					<div className="resources-grid-hint">
						Couldn&apos;t read this file
					</div>
				) }
				{ state.status === 'loaded' &&
					( state.text.length === 0 ? (
						<div className="resources-grid-hint">
							This file is empty or too large to preview
						</div>
					) : (
						<div className="draft-preview-markdown">
							<ReactMarkdown
								remarkPlugins={ [ remarkGfm ] }
								urlTransform={ makeUrlTransform(
									projectId,
									fileBaseInProject( folder, relPath )
								) }
							>
								{ state.text }
							</ReactMarkdown>
						</div>
					) ) }
			</div>
			<DeleteResourceDialog
				pending={ pendingDeletion }
				deleting={ deleting }
				onConfirm={ () => {
					void confirmDelete();
				} }
				onCancel={ cancelDelete }
			/>
		</div>
	);
}
