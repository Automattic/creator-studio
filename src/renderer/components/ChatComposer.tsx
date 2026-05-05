import React, { useLayoutEffect, useRef } from 'react';
import { flushSync } from 'react-dom';

import type { DraftAttachment } from '../../types';
import { htmlToMarkdown } from '../lib/htmlToMarkdown';
import { ArrowUpIcon, CloseIcon, StopIcon } from '../icons';

type ComposerTestIds = {
	root?: string;
	input?: string;
	send?: string;
	attachments?: string;
};

type Props = {
	value: string;
	onChange: ( next: string ) => void;
	onSend: () => void;
	onCancel?: () => void;
	busy: boolean;
	disabled: boolean;
	placeholder: string;
	attachments?: DraftAttachment[];
	onPreviewAttachment?: (
		folder: 'sources' | 'drafts' | 'published',
		relPath: string
	) => void;
	onRemoveAttachment?: (
		folder: 'sources' | 'drafts' | 'published',
		relPath: string
	) => void;
	inputRef?: React.MutableRefObject< HTMLTextAreaElement | null >;
	testIds?: ComposerTestIds;
};

export function ChatComposer( {
	value,
	onChange,
	onSend,
	onCancel,
	busy,
	disabled,
	placeholder,
	attachments,
	onPreviewAttachment,
	onRemoveAttachment,
	inputRef,
	testIds,
}: Props ): React.ReactElement {
	const localRef = useRef< HTMLTextAreaElement | null >( null );
	const ref = inputRef ?? localRef;
	const ids = {
		root: testIds?.root ?? 'composer',
		input: testIds?.input ?? 'chat-input',
		send: testIds?.send ?? 'send-button',
		attachments: testIds?.attachments ?? 'composer-attachments',
	};

	// Resync the textarea height whenever the value changes — it grows with
	// content, capped by CSS max-height.
	useLayoutEffect( () => {
		const el = ref.current;
		if ( ! el ) {
			return;
		}
		el.style.height = 'auto';
		el.style.height = `${ el.scrollHeight }px`;
	}, [ value, ref ] );

	const sendDisabled = disabled || busy || value.trim().length === 0;
	const inputDisabled = disabled;

	const showAttachments =
		!! attachments && attachments.length > 0 && !! onRemoveAttachment;

	return (
		<div className="composer" data-testid={ ids.root }>
			<div
				className="composer-field"
				data-has-attachment={ showAttachments ? 'true' : 'false' }
			>
				{ showAttachments && (
					<div
						className="composer-attachments"
						data-testid={ ids.attachments }
					>
						{ attachments!.map( ( a ) => (
							<ComposerAttachmentChip
								key={ `${ a.folder }:${ a.relPath }` }
								attachment={ a }
								onPreview={
									onPreviewAttachment
										? () =>
												onPreviewAttachment(
													a.folder,
													a.relPath
												)
										: undefined
								}
								onRemove={ () =>
									onRemoveAttachment!( a.folder, a.relPath )
								}
							/>
						) ) }
					</div>
				) }
				<textarea
					ref={ ref }
					className="composer-input"
					data-testid={ ids.input }
					placeholder={ placeholder }
					rows={ 1 }
					value={ value }
					onChange={ ( e ) => onChange( e.target.value ) }
					onKeyDown={ ( e ) => {
						if (
							e.key === 'Enter' &&
							! e.shiftKey &&
							! e.nativeEvent.isComposing
						) {
							e.preventDefault();
							if ( ! sendDisabled ) {
								onSend();
							}
						}
					} }
					onPaste={ ( e ) => {
						const html = e.clipboardData.getData( 'text/html' );
						const plain = e.clipboardData.getData( 'text/plain' );
						if ( ! html || html === plain ) {
							return;
						}
						e.preventDefault();
						const el = e.currentTarget;
						const start = el.selectionStart ?? value.length;
						const end = el.selectionEnd ?? value.length;
						htmlToMarkdown( html )
							.then( ( md ) => {
								const next =
									value.slice( 0, start ) +
									md +
									value.slice( end );
								flushSync( () => {
									onChange( next );
								} );
								const pos = start + md.length;
								el.setSelectionRange( pos, pos );
								el.focus();
							} )
							.catch( ( err ) =>
								// eslint-disable-next-line no-console
								console.error( 'paste->markdown failed', err )
							);
					} }
					disabled={ inputDisabled }
				/>
				{ busy ? (
					<button
						type="button"
						className="composer-send composer-send-stop"
						data-testid={ ids.send }
						onClick={ () => onCancel?.() }
						disabled={ ! onCancel }
						aria-label="Stop"
					>
						<StopIcon size={ 10 } />
					</button>
				) : (
					<button
						type="button"
						className="composer-send"
						data-testid={ ids.send }
						onClick={ onSend }
						disabled={ sendDisabled }
						aria-label="Send message"
					>
						<ArrowUpIcon size={ 16 } />
					</button>
				) }
			</div>
		</div>
	);
}

function ComposerAttachmentChip( {
	attachment,
	onPreview,
	onRemove,
}: {
	attachment: DraftAttachment;
	onPreview?: () => void;
	onRemove: () => void;
} ): React.ReactElement {
	return (
		<div
			className="composer-attachment-chip"
			data-testid="composer-attachment-chip"
		>
			<button
				type="button"
				className="composer-attachment-chip-body"
				onClick={ onPreview }
				disabled={ ! onPreview }
				title={ `Preview ${ attachment.name }` }
			>
				<svg
					width="14"
					height="14"
					viewBox="0 0 20 20"
					aria-hidden="true"
					fill="none"
					stroke="currentColor"
					strokeWidth="1.5"
					strokeLinecap="round"
					strokeLinejoin="round"
				>
					<path d="M6 3h6l4 4v10a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z" />
					<path d="M12 3v4h4" />
				</svg>
				<span className="composer-attachment-chip-name">
					{ attachment.name }
				</span>
			</button>
			<button
				type="button"
				className="composer-attachment-chip-remove"
				data-testid="composer-attachment-remove"
				aria-label={ `Remove ${ attachment.name }` }
				title="Remove"
				onClick={ onRemove }
			>
				<CloseIcon size={ 10 } />
			</button>
		</div>
	);
}
