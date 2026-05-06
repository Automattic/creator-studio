import React, { useEffect, useRef, useState } from 'react';

import { CodeIcon, DownloadIcon, MarkdownIcon } from '../icons';

type Props = {
	body: string;
	relPath: string;
	projectId: string;
};

type ActionId = 'copy-md' | 'copy-html' | 'download-md';
type ActionStatus = 'idle' | 'success' | 'error';

const STATUS_LABEL: Record< ActionId, Record< ActionStatus, string > > = {
	'copy-md': { idle: '', success: 'Copied', error: 'Failed' },
	'copy-html': { idle: '', success: 'Copied', error: 'Failed' },
	'download-md': { idle: '', success: 'Saved', error: 'Failed' },
};

export function DraftSharePanel( {
	body,
	relPath,
	projectId,
}: Props ): React.ReactElement {
	const ready = relPath.length > 0 && projectId.length > 0;
	const [ status, setStatus ] = useState< Record< ActionId, ActionStatus > >(
		{
			'copy-md': 'idle',
			'copy-html': 'idle',
			'download-md': 'idle',
		}
	);
	const timersRef = useRef< Record< ActionId, number | null > >( {
		'copy-md': null,
		'copy-html': null,
		'download-md': null,
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

	return (
		<div className="draft-share-panel" data-testid="draft-share-panel">
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
						/* wired in next step */
					} }
				/>
				<ShareAction
					id="download-md"
					testId="draft-share-action-download-md"
					label="Download .md"
					Icon={ DownloadIcon }
					status={ status[ 'download-md' ] }
					disabled={ ! ready }
					onClick={ () => {
						/* wired in next step */
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
