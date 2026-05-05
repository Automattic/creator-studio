import React, { useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

import { DeleteResourceDialog } from './DeleteResourceDialog';
import { ResourceActionMenu } from './ResourceActionMenu';
import { previewKind } from '../lib/previewKind';
import { relativeDate } from '../lib/relativeDate';

type Folder = 'sources' | 'drafts' | 'published';

type Props = {
	projectId: string;
	folder: Folder;
	relPath: string;
	name: string;
	addToChatDisabled: boolean;
	onBack: () => void;
	onAddToChat: () => void;
	onOpenNewChat: () => void;
	// Set only when the previewed file is editable (markdown drafts today).
	onEditDraft?: () => void;
	onDeleted: () => void;
};

const MENU_ID = 'resource-preview';

// In-project base directory for the open file, e.g. `drafts/2026-04` for
// `drafts/2026-04/foo.md` (or `drafts` for a root-level file). Used to
// resolve relative refs in markdown and to build the studio-asset URL.
function fileBaseInProject( folder: Folder, relPath: string ): string {
	const slash = relPath.lastIndexOf( '/' );
	const subDir = slash > 0 ? `/${ relPath.slice( 0, slash ) }` : '';
	return `${ folder }${ subDir }`;
}

export function ResourcePreview( {
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
	const kind = previewKind( name );
	// Bumped each time the agent finishes a turn for this project so both
	// markdown re-reads and image cache-busts pick up file edits the agent
	// just made. Manual edits outside the app aren't watched.
	const [ reloadNonce, setReloadNonce ] = useState( 0 );
	const [ mtime, setMtime ] = useState< number | null >( null );
	const [ openMenuId, setOpenMenuId ] = useState< string | null >( null );
	const [ pendingDeletion, setPendingDeletion ] = useState< {
		name: string;
	} | null >( null );
	const [ deleting, setDeleting ] = useState( false );
	const menuRef = useRef< HTMLDivElement | null >( null );

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

	useEffect( () => {
		const off = window.api.agent.onEvent( ( event ) => {
			if ( event.kind === 'done' && event.projectId === projectId ) {
				setReloadNonce( ( n ) => n + 1 );
			}
		} );
		return off;
	}, [ projectId ] );

	// Header date is sourced from a stat IPC for every file kind so markdown
	// and image previews show the same "modified at" string the resource
	// cards do.
	useEffect( () => {
		let cancelled = false;
		void window.api.project
			.statFile( projectId, subPath )
			.then( ( res ) => {
				if ( cancelled ) {
					return;
				}
				setMtime( res ? res.mtime : null );
			} )
			.catch( () => {
				if ( cancelled ) {
					return;
				}
				setMtime( null );
			} );
		return () => {
			cancelled = true;
		};
	}, [ projectId, subPath, reloadNonce ] );

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

	const date = mtime !== null ? relativeDate( mtime ) : null;

	return (
		<div className="resource-preview" data-testid="resource-preview">
			<div className="resource-preview-header">
				<button
					type="button"
					className="resource-preview-back"
					data-testid="resource-preview-back"
					onClick={ onBack }
					aria-label="Back to resources"
					title="Back to resources"
				>
					<span aria-hidden="true">‹</span> Back
				</button>
				<div className="resource-preview-title-wrap">
					<span
						className="resource-preview-title"
						data-testid="resource-preview-title"
						title={ relPath }
					>
						{ name }
					</span>
					{ date && (
						<span className="resource-preview-date">{ date }</span>
					) }
				</div>
				<div className="resource-preview-actions">
					<ResourceActionMenu
						menuId={ MENU_ID }
						openMenuId={ openMenuId }
						setOpenMenuId={ setOpenMenuId }
						menuRef={ menuRef }
						buttonTestId="resource-preview-menu-button"
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
				className="resource-preview-body"
				data-testid="resource-preview-body"
				data-kind={ kind ?? 'unknown' }
			>
				{ kind === 'markdown' && (
					<MarkdownPreview
						projectId={ projectId }
						folder={ folder }
						relPath={ relPath }
						subPath={ subPath }
						reloadNonce={ reloadNonce }
					/>
				) }
				{ kind === 'image' && (
					<ImagePreview
						projectId={ projectId }
						folder={ folder }
						relPath={ relPath }
						name={ name }
						reloadNonce={ reloadNonce }
					/>
				) }
				{ kind === 'video' && (
					<VideoPreview
						projectId={ projectId }
						folder={ folder }
						relPath={ relPath }
						reloadNonce={ reloadNonce }
					/>
				) }
				{ kind === null && (
					<div className="resources-grid-hint">
						Preview unavailable for this file type
					</div>
				) }
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

type LoadState =
	| { status: 'loading' }
	| { status: 'loaded'; text: string }
	| { status: 'error' };

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

function MarkdownPreview( {
	projectId,
	folder,
	relPath,
	subPath,
	reloadNonce,
}: {
	projectId: string;
	folder: Folder;
	relPath: string;
	subPath: string;
	reloadNonce: number;
} ): React.ReactElement {
	const [ state, setState ] = useState< LoadState >( { status: 'loading' } );

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
				setState( { status: 'loaded', text: res.text } );
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

	if ( state.status === 'loading' ) {
		return <div className="resources-grid-hint">Loading…</div>;
	}
	if ( state.status === 'error' ) {
		return (
			<div className="resources-grid-hint">
				Couldn&apos;t read this file
			</div>
		);
	}
	if ( state.text.length === 0 ) {
		return (
			<div className="resources-grid-hint">
				This file is empty or too large to preview
			</div>
		);
	}
	return (
		<div className="resource-preview-markdown">
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
	);
}

function ImagePreview( {
	projectId,
	folder,
	relPath,
	name,
	reloadNonce,
}: {
	projectId: string;
	folder: Folder;
	relPath: string;
	name: string;
	reloadNonce: number;
} ): React.ReactElement {
	// `studio-asset://` is served by the main process (see main.ts); any
	// in-project file is fetchable from the renderer. The reload nonce is
	// appended as a cache buster so the agent's edits replace the visible
	// pixels instead of being shadowed by Chromium's image cache.
	const src = `studio-asset://${ projectId }/${ folder }/${ relPath }${
		reloadNonce > 0 ? `?v=${ reloadNonce }` : ''
	}`;
	return (
		<div
			className="resource-preview-image"
			data-testid="resource-preview-image"
		>
			<img src={ src } alt={ name } />
		</div>
	);
}

function VideoPreview( {
	projectId,
	folder,
	relPath,
	reloadNonce,
}: {
	projectId: string;
	folder: Folder;
	relPath: string;
	reloadNonce: number;
} ): React.ReactElement {
	const src = `studio-asset://${ projectId }/${ folder }/${ relPath }${
		reloadNonce > 0 ? `?v=${ reloadNonce }` : ''
	}`;
	return (
		<div
			className="resource-preview-video"
			data-testid="resource-preview-video"
		>
			{ /* eslint-disable-next-line jsx-a11y/media-has-caption --
			   user content; we don't have captions to attach. */ }
			<video src={ src } controls preload="metadata" key={ src } />
		</div>
	);
}
