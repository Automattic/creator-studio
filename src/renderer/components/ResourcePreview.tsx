import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Document, Page, pdfjs } from 'react-pdf';
// `?url` resolves the worker bundle through Vite — served from node_modules in
// dev, emitted as an asset in the packaged build. The pinned pdfjs-dist
// version must match the one react-pdf was built against (see package.json).
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

// Aligns the absolutely-positioned text layer with the rendered canvas so
// selection highlights track the glyphs. Without this stylesheet selections
// drift and `window.getSelection()` rectangles end up offset.
import 'react-pdf/dist/Page/TextLayer.css';

import type { MessageSelection } from '../../types';
import { DeleteResourceDialog } from './DeleteResourceDialog';
import { InlineFileEditor } from './InlineFileEditor';
import { RenameDraftDialog } from './RenameDraftDialog';
import { ResourceActionMenu } from './ResourceActionMenu';
import type { SelectionMenuMode } from '../editor/SelectionMenu';
import { previewKind } from '../lib/previewKind';
import { relativeDate } from '../lib/relativeDate';
import { extractYouTubeVideoId } from '../../youtube';

pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

type Folder = 'sources' | 'drafts' | 'done';

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
	selectionMenuMode: SelectionMenuMode;
	onAddSelection: ( selection: MessageSelection ) => void;
	onOpenSelectionChat: () => void;
	// Fired when the inline editor renames the file (auto-rename on title
	// blur, or explicit rename). The parent updates `previewedFile` to the
	// new path so the next render targets the renamed file.
	onRelPathChanged?: ( newRelPath: string ) => void;
	onDeleted: () => void;
};

const MENU_ID = 'resource-preview';

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
	selectionMenuMode,
	onAddSelection,
	onOpenSelectionChat,
	onRelPathChanged,
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
	const [ renameDialog, setRenameDialog ] = useState< {
		open: boolean;
		busy: boolean;
		error: 'invalid-name' | 'collision' | 'io-error' | null;
	} >( { open: false, busy: false, error: null } );
	// Surfaced by InlineFileEditor for source-markdown notes whose
	// frontmatter has a meaningful title. The header reads from this when
	// set; otherwise it falls back to the filename. No reset-on-relPath
	// effect: in-place relPath changes only come from our own rename
	// (which already updated the title via onDisplayTitleChange before
	// renaming), and genuine file swaps unmount ResourcePreview via the
	// Back button → grid → re-open path, giving us a fresh null start.
	const [ displayTitle, setDisplayTitle ] = useState< string | null >( null );
	// YouTube video id extracted from the source markdown's frontmatter URL
	// (`source` / `url` / `link`). Surfaced by InlineFileEditor after the file
	// loads. When set, we render the YouTube embed above the editor.
	const [ youtubeVideoId, setYoutubeVideoId ] = useState< string | null >(
		null
	);
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

	const confirmRename = async ( desired: string ): Promise< void > => {
		if ( renameDialog.busy || folder !== 'sources' ) {
			return;
		}
		setRenameDialog( ( prev ) => ( { ...prev, busy: true, error: null } ) );
		const result = await window.api.sources.rename(
			projectId,
			relPath,
			desired,
			{ markManual: true }
		);
		if ( result.ok === false ) {
			const reason = result.reason;
			setRenameDialog( {
				open: true,
				busy: false,
				error:
					reason === 'invalid-name' ||
					reason === 'collision' ||
					reason === 'io-error'
						? reason
						: 'io-error',
			} );
			return;
		}
		setRenameDialog( { open: false, busy: false, error: null } );
		onRelPathChanged?.( result.relPath );
	};

	const date = mtime !== null ? relativeDate( mtime ) : null;

	// The header (back button + title/date + actions menu) renders into the
	// window titlebar slot owned by App.tsx so the resource controls replace
	// the project title while previewing. Resolve the slot via a layout
	// effect so the portal mounts in the same paint as the preview body —
	// avoids a one-frame flash where the titlebar shows the project title.
	const [ titlebarSlot, setTitlebarSlot ] = useState< HTMLElement | null >(
		null
	);
	useLayoutEffect( () => {
		setTitlebarSlot(
			document.getElementById( 'resource-preview-titlebar-slot' )
		);
	}, [] );

	return (
		<div className="resource-preview" data-testid="resource-preview">
			{ titlebarSlot &&
				createPortal(
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
								{ displayTitle ?? name }
							</span>
							{ date && (
								<span className="resource-preview-date">
									{ date }
								</span>
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
								onRename={
									folder === 'sources' && kind === 'markdown'
										? () =>
												setRenameDialog( {
													open: true,
													busy: false,
													error: null,
												} )
										: undefined
								}
								onDelete={ () =>
									setPendingDeletion( { name } )
								}
							/>
						</div>
					</div>,
					titlebarSlot
				) }
			<div
				className="resource-preview-body"
				data-testid="resource-preview-body"
				data-kind={ kind ?? 'unknown' }
			>
				{ ( kind === 'markdown' || kind === 'text' ) && (
					<>
						{ youtubeVideoId && (
							<YouTubePlayer videoId={ youtubeVideoId } />
						) }
						<InlineFileEditor
							projectId={ projectId }
							folder={ folder }
							relPath={ relPath }
							name={ name }
							selectionMenuMode={ selectionMenuMode }
							onAddSelection={ onAddSelection }
							onOpenSelectionChat={ onOpenSelectionChat }
							onRelPathChanged={ onRelPathChanged }
							onDisplayTitleChange={ setDisplayTitle }
							onClippingUrlChange={ ( url ) =>
								setYoutubeVideoId(
									url ? extractYouTubeVideoId( url ) : null
								)
							}
						/>
					</>
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
				{ kind === 'pdf' && (
					<PdfPreview
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
			<RenameDraftDialog
				open={ renameDialog.open }
				currentBasename={ relPath.replace( /\.md$/i, '' ) }
				busy={ renameDialog.busy }
				error={ renameDialog.error }
				noun="note"
				onConfirm={ ( desired ) => {
					void confirmRename( desired );
				} }
				onCancel={ () => {
					if ( renameDialog.busy ) {
						return;
					}
					setRenameDialog( {
						open: false,
						busy: false,
						error: null,
					} );
				} }
			/>
		</div>
	);
}

function YouTubePlayer( { videoId }: { videoId: string } ): React.ReactElement {
	// `rel=0` keeps YouTube's "next up" suggestions to the same channel after
	// playback ends — less likely to lead a writer down an unrelated rabbit
	// hole. No `autoplay` flag: the iframe renders YouTube's poster + play
	// button and waits for an explicit click.
	const src = `https://www.youtube.com/embed/${ videoId }?rel=0`;
	return (
		<div
			className="resource-preview-youtube"
			data-testid="resource-preview-youtube"
		>
			<iframe
				key={ videoId }
				src={ src }
				title="YouTube video player"
				loading="lazy"
				referrerPolicy="strict-origin-when-cross-origin"
				allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
			/>
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

function PdfPreview( {
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
	const [ numPages, setNumPages ] = useState< number | null >( null );
	return (
		<div
			className="resource-preview-pdf"
			data-testid="resource-preview-pdf"
		>
			<Document
				// Remount on src change so an agent overwrite refetches the
				// file instead of holding the previously parsed buffer.
				key={ src }
				file={ src }
				onLoadSuccess={ ( pdf ) => setNumPages( pdf.numPages ) }
				loading={ <div className="resources-grid-hint">Loading…</div> }
				error={
					<div className="resources-grid-hint">
						Couldn&apos;t read this file
					</div>
				}
				noData={
					<div className="resources-grid-hint">
						Couldn&apos;t read this file
					</div>
				}
			>
				{ numPages !== null &&
					Array.from( { length: numPages }, ( _, i ) => (
						<Page
							key={ i + 1 }
							pageNumber={ i + 1 }
							renderTextLayer
							renderAnnotationLayer={ false }
						/>
					) ) }
			</Document>
		</div>
	);
}
