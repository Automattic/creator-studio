import React, { useEffect, useRef, useState } from 'react';

import { TrashIcon } from '../icons';
import type { ChatMeta } from '../../types';

type Props = {
	chats: ChatMeta[];
	activeChatId: string | null;
	chatLabels: Map< string, string >;
	closedChatIds?: ReadonlyArray< string >;
	onSelect: ( chatId: string ) => void;
	onOpenClosed?: ( chatId: string ) => void;
	onDelete: ( chatId: string ) => void;
	onClose: () => void;
	testIdPrefix: string;
	// Optional outer container the popover treats as "inside" for the
	// outside-click dismiss check. Parents that render the popover next
	// to the toggle button pass a ref to the wrapper that holds both —
	// otherwise clicking the toggle would dismiss + re-toggle (stuck open).
	boundaryRef?: React.RefObject< HTMLElement | null >;
};

export function ChatHistoryPopover( {
	chats,
	activeChatId,
	chatLabels,
	closedChatIds,
	onSelect,
	onOpenClosed,
	onDelete,
	onClose,
	testIdPrefix,
	boundaryRef,
}: Props ): React.ReactElement {
	const [ query, setQuery ] = useState( '' );
	const rootRef = useRef< HTMLDivElement | null >( null );
	const searchRef = useRef< HTMLInputElement | null >( null );
	const closedSet = new Set( closedChatIds ?? [] );

	const filtered = ( () => {
		const q = query.trim().toLowerCase();
		if ( ! q ) {
			return chats;
		}
		return chats.filter( ( c ) =>
			( chatLabels.get( c.id ) ?? '' ).toLowerCase().includes( q )
		);
	} )();

	useEffect( () => {
		searchRef.current?.focus();
		const onDocClick = ( e: MouseEvent ): void => {
			const boundary = boundaryRef?.current ?? rootRef.current;
			if ( boundary && ! boundary.contains( e.target as Node ) ) {
				onClose();
			}
		};
		const onKey = ( e: KeyboardEvent ): void => {
			if ( e.key === 'Escape' ) {
				onClose();
			}
		};
		document.addEventListener( 'mousedown', onDocClick );
		document.addEventListener( 'keydown', onKey );
		return () => {
			document.removeEventListener( 'mousedown', onDocClick );
			document.removeEventListener( 'keydown', onKey );
		};
	}, [ onClose, boundaryRef ] );

	const activate = ( chatId: string ): void => {
		if ( closedSet.has( chatId ) && onOpenClosed ) {
			onOpenClosed( chatId );
		} else {
			onSelect( chatId );
		}
		onClose();
	};

	return (
		<div
			ref={ rootRef }
			className="chat-history-popover"
			data-testid={ `${ testIdPrefix }-popover` }
		>
			<input
				ref={ searchRef }
				type="text"
				className="chat-history-search"
				data-testid={ `${ testIdPrefix }-search` }
				placeholder="Search chats…"
				value={ query }
				onChange={ ( e ) => setQuery( e.target.value ) }
				onKeyDown={ ( e ) => {
					if ( e.key === 'Enter' && filtered.length > 0 ) {
						activate( filtered[ 0 ].id );
					}
				} }
			/>
			<div className="chat-history-list" role="listbox">
				{ filtered.length === 0 ? (
					<div
						className="chat-history-empty"
						data-testid={ `${ testIdPrefix }-empty` }
					>
						{ chats.length === 0 ? 'No chats yet' : 'No matches' }
					</div>
				) : (
					filtered.map( ( chat ) => {
						const label = chatLabels.get( chat.id );
						const isClosed = closedSet.has( chat.id );
						const isActive = chat.id === activeChatId;
						return (
							<div
								key={ chat.id }
								className="chat-history-item"
								data-active={ isActive ? 'true' : 'false' }
							>
								<button
									type="button"
									className="chat-history-item-select"
									role="option"
									aria-selected={ isActive }
									data-testid={ `${ testIdPrefix }-item-${ chat.id }` }
									onClick={ () => activate( chat.id ) }
								>
									<span className="chat-history-item-label">
										{ label }
									</span>
									{ isClosed && (
										<span className="chat-history-item-hint">
											closed
										</span>
									) }
								</button>
								<button
									type="button"
									className="chat-history-item-delete"
									data-testid={ `${ testIdPrefix }-item-delete-${ chat.id }` }
									aria-label={ `Delete ${ label }` }
									title="Delete chat"
									onClick={ ( e ) => {
										e.stopPropagation();
										onDelete( chat.id );
									} }
								>
									<TrashIcon size={ 12 } />
								</button>
							</div>
						);
					} )
				) }
			</div>
		</div>
	);
}
