import React, { useEffect, useRef, useState } from 'react';

import type { WordpressConnectionPublic } from '../../types';

import {
	CodeIcon,
	DoneIcon,
	DownloadIcon,
	MarkdownIcon,
	WordpressIcon,
} from '../icons';
import { markdownToHtml } from '../lib/markdownToHtml';

type Props = {
	body: string;
	relPath: string;
	projectId: string;
	folder: 'sources' | 'drafts' | 'done' | 'checks';
	// Explicit Mark-as-done click: file moved to done/, unmount the
	// editor (the caller typically navigates back to the resources
	// view).
	onMarkedDone: () => void;
	// Auto-move after a successful publish: file is now in done/ at
	// `newRelPath`. The caller updates the editor's relPath/folder
	// in place so the user stays on the document — the share panel
	// keeps its success state visible (with the View live post
	// link).
	onPublishedAndMoved?: ( newRelPath: string ) => void;
};

type ActionId = 'copy-md' | 'copy-html' | 'save-md';
type ActionStatus = 'idle' | 'success' | 'error';

type PublishState =
	| { kind: 'idle' }
	| { kind: 'pending'; connectionId: string }
	| {
			kind: 'success';
			postLink: string;
			siteLabel: string;
			mediaErrorCount: number;
	  }
	| { kind: 'error'; message: string };

const STATUS_LABEL: Record< ActionId, Record< ActionStatus, string > > = {
	'copy-md': { idle: '', success: 'Copied', error: 'Failed' },
	'copy-html': { idle: '', success: 'Copied', error: 'Failed' },
	'save-md': { idle: '', success: 'Saved', error: 'Failed' },
};

function publishLabel(
	state: PublishState,
	connections: WordpressConnectionPublic[],
	preferredConnection: WordpressConnectionPublic | null
): string {
	if ( state.kind === 'pending' ) {
		return 'Publishing…';
	}
	if ( preferredConnection ) {
		return `Publish to ${ preferredConnection.label }`;
	}
	if ( connections.length === 1 ) {
		return `Publish to ${ connections[ 0 ].label }`;
	}
	return 'Publish to WordPress';
}

function describePublishError( reason: string, status?: number ): string {
	switch ( reason ) {
		case 'unauthorized':
			return 'WordPress refused the credentials — the connection may need to be reconnected.';
		case 'forbidden':
			return "This account can't publish to that site.";
		case 'network':
			return 'Network error — the site is unreachable.';
		case 'connection-not-found':
			return 'Connection no longer exists. Pick another in Settings.';
		case 'draft-not-found':
			return "Couldn't read the draft file from disk.";
		case 'http-error':
			return status
				? `WordPress returned an unexpected error (HTTP ${ status }).`
				: 'WordPress returned an unexpected error.';
		default:
			return 'Publish failed.';
	}
}

export function DraftSharePanel( {
	body,
	relPath,
	projectId,
	folder,
	onMarkedDone,
	onPublishedAndMoved,
}: Props ): React.ReactElement {
	const ready = relPath.length > 0 && projectId.length > 0;
	const [ status, setStatus ] = useState< Record< ActionId, ActionStatus > >(
		{
			'copy-md': 'idle',
			'copy-html': 'idle',
			'save-md': 'idle',
		}
	);
	const [ markDoneState, setMarkDoneState ] = useState<
		'idle' | 'pending' | 'error'
	>( 'idle' );
	const [ connections, setConnections ] = useState<
		WordpressConnectionPublic[]
	>( [] );
	// Connection the project was imported from, if any. When this
	// connection is still configured, the publish button targets it
	// directly instead of opening the multi-site picker.
	const [ preferredConnectionId, setPreferredConnectionId ] = useState<
		string | null
	>( null );
	const [ publishState, setPublishState ] = useState< PublishState >( {
		kind: 'idle',
	} );
	const [ pickerOpen, setPickerOpen ] = useState( false );
	const publishWrapRef = useRef< HTMLDivElement | null >( null );

	useEffect( () => {
		if ( ! pickerOpen ) {
			return;
		}
		const onDocMouseDown = ( e: MouseEvent ): void => {
			const target = e.target as Node | null;
			if (
				publishWrapRef.current &&
				target &&
				publishWrapRef.current.contains( target )
			) {
				return;
			}
			setPickerOpen( false );
		};
		const onKey = ( e: KeyboardEvent ): void => {
			if ( e.key === 'Escape' ) {
				setPickerOpen( false );
			}
		};
		document.addEventListener( 'mousedown', onDocMouseDown );
		document.addEventListener( 'keydown', onKey );
		return () => {
			document.removeEventListener( 'mousedown', onDocMouseDown );
			document.removeEventListener( 'keydown', onKey );
		};
	}, [ pickerOpen ] );

	useEffect( () => {
		let cancelled = false;
		void window.api.wordpress.list().then( ( list ) => {
			if ( ! cancelled ) {
				setConnections( list );
			}
		} );
		return () => {
			cancelled = true;
		};
	}, [] );

	useEffect( () => {
		let cancelled = false;
		void window.api.projects.list().then( ( list ) => {
			if ( cancelled ) {
				return;
			}
			const project = list.find( ( p ) => p.id === projectId );
			setPreferredConnectionId( project?.wordpressConnectionId ?? null );
		} );
		return () => {
			cancelled = true;
		};
	}, [ projectId ] );

	// Only honour the preference while that connection is still
	// configured — if it was disconnected we fall back to the normal
	// single-connection / picker behaviour.
	const preferredConnection =
		preferredConnectionId !== null
			? connections.find( ( c ) => c.id === preferredConnectionId ) ??
			  null
			: null;

	const publishTo = async (
		connection: WordpressConnectionPublic
	): Promise< void > => {
		setPickerOpen( false );
		setPublishState( { kind: 'pending', connectionId: connection.id } );
		try {
			const result = await window.api.wordpress.publish( {
				projectId,
				relPath,
				folder: folder as 'drafts' | 'done',
				connectionId: connection.id,
			} );
			if ( result.ok === false ) {
				setPublishState( {
					kind: 'error',
					message: describePublishError(
						result.reason,
						result.status
					),
				} );
			} else {
				setPublishState( {
					kind: 'success',
					postLink: result.link,
					siteLabel: result.connection.label,
					mediaErrorCount: result.mediaErrors.length,
				} );
				// The publish channel moves the file to done/ on
				// success when the caller was in drafts/. We notify
				// the parent so it can update the editor's
				// relPath/folder in place — the editor stays open on
				// the same document (now in done/) and the share
				// panel keeps its "View live post" link visible.
				if (
					result.movedToDone &&
					folder === 'drafts' &&
					onPublishedAndMoved
				) {
					onPublishedAndMoved( result.movedToDone.relPath );
				}
			}
		} catch ( err ) {
			setPublishState( {
				kind: 'error',
				message:
					err instanceof Error
						? err.message
						: 'Publish failed unexpectedly.',
			} );
		}
	};

	const handlePublishClick = (): void => {
		if ( connections.length === 0 ) {
			return;
		}
		if ( preferredConnection ) {
			void publishTo( preferredConnection );
			return;
		}
		if ( connections.length === 1 ) {
			void publishTo( connections[ 0 ] );
			return;
		}
		setPickerOpen( ( v ) => ! v );
	};
	const timersRef = useRef< Record< ActionId, number | null > >( {
		'copy-md': null,
		'copy-html': null,
		'save-md': null,
	} );

	useEffect( () => {
		const timers = timersRef.current;
		return () => {
			( Object.keys( timers ) as ActionId[] ).forEach( ( id ) => {
				if ( timers[ id ] !== null ) {
					window.clearTimeout( timers[ id ] as number );
				}
			} );
		};
	}, [] );

	const flash = ( id: ActionId, next: ActionStatus ): void => {
		setStatus( ( prev ) => ( { ...prev, [ id ]: next } ) );
		if ( timersRef.current[ id ] !== null ) {
			window.clearTimeout( timersRef.current[ id ] as number );
		}
		timersRef.current[ id ] = window.setTimeout( () => {
			setStatus( ( prev ) => ( { ...prev, [ id ]: 'idle' } ) );
			timersRef.current[ id ] = null;
		}, 1500 );
	};

	const handleCopyMarkdown = async (): Promise< void > => {
		try {
			await navigator.clipboard.writeText( body );
			flash( 'copy-md', 'success' );
		} catch {
			flash( 'copy-md', 'error' );
		}
	};

	const handleSaveMarkdown = async (): Promise< void > => {
		try {
			const result = await window.api.drafts.export( relPath, body );
			if ( result.status === 'saved' ) {
				flash( 'save-md', 'success' );
			} else if ( result.status === 'error' ) {
				flash( 'save-md', 'error' );
			}
			// 'cancelled' leaves the row in idle state — no flash.
		} catch {
			flash( 'save-md', 'error' );
		}
	};

	const handleCopyHtml = async (): Promise< void > => {
		try {
			const html = await markdownToHtml( body );
			// Try the rich-MIME path first so pasting into Word/Docs renders
			// styled, falling back to plain text on environments without
			// ClipboardItem (older browsers, some sandboxed contexts).
			if ( typeof ClipboardItem !== 'undefined' ) {
				await navigator.clipboard.write( [
					new ClipboardItem( {
						'text/html': new Blob( [ html ], {
							type: 'text/html',
						} ),
						'text/plain': new Blob( [ html ], {
							type: 'text/plain',
						} ),
					} ),
				] );
			} else {
				await navigator.clipboard.writeText( html );
			}
			flash( 'copy-html', 'success' );
		} catch {
			flash( 'copy-html', 'error' );
		}
	};

	const handleMarkDone = async (): Promise< void > => {
		setMarkDoneState( 'pending' );
		try {
			const result = await window.api.drafts.markDone(
				projectId,
				relPath
			);
			if ( result.ok ) {
				// Successful move — leave the panel; the screen unmounts.
				onMarkedDone();
				return;
			}
			setMarkDoneState( 'error' );
		} catch {
			setMarkDoneState( 'error' );
		}
	};

	return (
		<div className="draft-share-panel" data-testid="draft-share-panel">
			{ folder === 'drafts' && (
				<>
					<button
						type="button"
						className="draft-share-mark-done"
						data-testid="draft-share-action-mark-done"
						data-state={ markDoneState }
						disabled={ ! ready || markDoneState === 'pending' }
						onClick={ () => {
							void handleMarkDone();
						} }
					>
						<DoneIcon size={ 18 } />
						<span className="draft-share-mark-done-label">
							{ markDoneState === 'pending'
								? 'Moving…'
								: 'Mark as done' }
						</span>
					</button>
					{ markDoneState === 'error' && (
						<p
							className="draft-share-error"
							data-testid="draft-share-mark-done-error"
						>
							Couldn’t move the draft. Try again.
						</p>
					) }
				</>
			) }
			{ connections.length > 0 &&
				folder !== 'sources' &&
				folder !== 'checks' && (
					<div
						className="draft-share-publish-wrap"
						ref={ publishWrapRef }
					>
						<button
							type="button"
							className="draft-share-publish"
							data-testid="draft-share-action-publish-wp"
							data-state={ publishState.kind }
							disabled={
								! ready || publishState.kind === 'pending'
							}
							onClick={ handlePublishClick }
						>
							<WordpressIcon size={ 18 } />
							<span className="draft-share-publish-label">
								{ publishLabel(
									publishState,
									connections,
									preferredConnection
								) }
							</span>
						</button>
						{ pickerOpen && connections.length > 1 && (
							<ul
								className="draft-share-publish-menu"
								data-testid="draft-share-publish-wp-menu"
								role="menu"
							>
								{ connections.map( ( connection ) => (
									<li key={ connection.id } role="none">
										<button
											type="button"
											role="menuitem"
											className="draft-share-publish-menu-item"
											data-testid={ `draft-share-publish-wp-target-${ connection.id }` }
											onClick={ () => {
												void publishTo( connection );
											} }
										>
											<span className="draft-share-publish-menu-label">
												{ connection.label }
											</span>
											<span className="draft-share-publish-menu-url">
												{ connection.siteUrl }
											</span>
										</button>
									</li>
								) ) }
							</ul>
						) }
						{ publishState.kind === 'success' && (
							<>
								<p
									className="draft-share-publish-success"
									data-testid="draft-share-publish-wp-success"
								>
									Published to { publishState.siteLabel }.{ ' ' }
									{ publishState.postLink && (
										<button
											type="button"
											className="dialog-link"
											data-testid="draft-share-publish-wp-success-link"
											onClick={ () => {
												void window.api.shell.openExternal(
													publishState.postLink
												);
											} }
										>
											View live post
										</button>
									) }
								</p>
								{ publishState.mediaErrorCount > 0 && (
									<p
										className="draft-share-error"
										data-testid="draft-share-publish-wp-media-warning"
									>
										{ publishState.mediaErrorCount } image
										{ publishState.mediaErrorCount === 1
											? ' '
											: 's ' }
										couldn’t be uploaded — they’ll show as
										broken on the live post.
									</p>
								) }
							</>
						) }
						{ publishState.kind === 'error' && (
							<p
								className="draft-share-error"
								data-testid="draft-share-publish-wp-error"
							>
								{ publishState.message }
							</p>
						) }
					</div>
				) }
			<div className="draft-share-actions">
				<ShareAction
					id="copy-md"
					testId="draft-share-action-copy-md"
					label="Copy as Markdown"
					Icon={ MarkdownIcon }
					status={ status[ 'copy-md' ] }
					disabled={ ! ready }
					onClick={ () => {
						void handleCopyMarkdown();
					} }
				/>
				<ShareAction
					id="copy-html"
					testId="draft-share-action-copy-html"
					label="Copy as HTML"
					Icon={ CodeIcon }
					status={ status[ 'copy-html' ] }
					disabled={ ! ready }
					onClick={ () => {
						void handleCopyHtml();
					} }
				/>
				<ShareAction
					id="save-md"
					testId="draft-share-action-save-md"
					label="Save .md"
					Icon={ DownloadIcon }
					status={ status[ 'save-md' ] }
					disabled={ ! ready }
					onClick={ () => {
						void handleSaveMarkdown();
					} }
				/>
			</div>
			<div role="status" aria-live="polite" className="sr-only">
				{ ( Object.keys( status ) as ActionId[] )
					.map( ( id ) =>
						status[ id ] !== 'idle'
							? STATUS_LABEL[ id ][ status[ id ] ]
							: ''
					)
					.filter( Boolean )
					.join( ', ' ) }
			</div>
		</div>
	);
}

type ShareActionProps = {
	id: ActionId;
	testId: string;
	label: string;
	Icon: typeof MarkdownIcon;
	status: ActionStatus;
	disabled: boolean;
	onClick: () => void;
};

function ShareAction( {
	id,
	testId,
	label,
	Icon,
	status,
	disabled,
	onClick,
}: ShareActionProps ): React.ReactElement {
	const statusText = STATUS_LABEL[ id ][ status ];
	return (
		<button
			type="button"
			className="draft-share-action"
			data-testid={ testId }
			data-status={ status }
			disabled={ disabled }
			onClick={ onClick }
		>
			<Icon size={ 18 } />
			<span className="draft-share-action-label">{ label }</span>
			{ statusText && (
				<span className="draft-share-action-status">
					{ statusText }
				</span>
			) }
		</button>
	);
}
