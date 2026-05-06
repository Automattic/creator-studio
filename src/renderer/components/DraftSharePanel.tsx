import React, { useEffect, useRef, useState } from 'react';

import { CodeIcon, DoneIcon, DownloadIcon, MarkdownIcon } from '../icons';
import { markdownToHtml } from '../lib/markdownToHtml';

type Props = {
	body: string;
	relPath: string;
	projectId: string;
	onMarkedDone: () => void;
};

type ActionId = 'copy-md' | 'copy-html' | 'save-md';
type ActionStatus = 'idle' | 'success' | 'error';

const STATUS_LABEL: Record< ActionId, Record< ActionStatus, string > > = {
	'copy-md': { idle: '', success: 'Copied', error: 'Failed' },
	'copy-html': { idle: '', success: 'Copied', error: 'Failed' },
	'save-md': { idle: '', success: 'Saved', error: 'Failed' },
};

export function DraftSharePanel( {
	body,
	relPath,
	projectId,
	onMarkedDone,
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
					{ markDoneState === 'pending' ? 'Moving…' : 'Mark as done' }
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
