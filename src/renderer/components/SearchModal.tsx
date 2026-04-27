import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Dialog } from '@base-ui/react/dialog';

import type { Folder } from '../../types';

import { SearchIcon } from '../icons';

type Props = {
	open: boolean;
	onClose: () => void;
	folders: Folder[];
	onSelect: ( folderId: string ) => void;
};

export function SearchModal( {
	open,
	onClose,
	folders,
	onSelect,
}: Props ): React.ReactElement {
	const [ query, setQuery ] = useState( '' );
	const inputRef = useRef< HTMLInputElement >( null );

	useEffect( () => {
		if ( ! open ) {
			setQuery( '' );
		}
	}, [ open ] );

	const filtered = useMemo( () => {
		const q = query.trim().toLowerCase();
		if ( ! q ) {
			return folders;
		}
		return folders.filter( ( f ) => {
			return (
				f.name.toLowerCase().includes( q ) ||
				( f.goal?.toLowerCase().includes( q ) ?? false )
			);
		} );
	}, [ folders, query ] );

	const handlePick = ( id: string ): void => {
		onSelect( id );
		onClose();
	};

	return (
		<Dialog.Root
			open={ open }
			onOpenChange={ ( isOpen ) => {
				if ( ! isOpen ) {
					onClose();
				}
			} }
		>
			<Dialog.Portal>
				<Dialog.Backdrop className="dialog-backdrop search-modal-backdrop" />
				<Dialog.Popup
					className="search-modal"
					data-testid="search-modal"
					initialFocus={ inputRef }
				>
					<Dialog.Title className="search-modal-srtitle">
						Search projects
					</Dialog.Title>
					<div className="search-modal-input-row">
						<SearchIcon />
						<input
							ref={ inputRef }
							type="text"
							className="search-modal-input"
							data-testid="search-modal-input"
							placeholder="Search projects, drafts, published…"
							value={ query }
							onChange={ ( e ) => setQuery( e.target.value ) }
						/>
						<kbd className="search-modal-esc">esc</kbd>
					</div>
					<div className="search-modal-body">
						<div className="search-modal-section-label">
							Projects
						</div>
						{ filtered.length === 0 ? (
							<div
								className="search-modal-empty"
								data-testid="search-modal-empty"
							>
								No projects match.
							</div>
						) : (
							<ul
								className="search-modal-list"
								data-testid="search-modal-list"
							>
								{ filtered.map( ( folder ) => (
									<li key={ folder.id }>
										<button
											type="button"
											className="search-modal-item"
											data-testid={ `search-modal-item-${ folder.id }` }
											onClick={ () =>
												handlePick( folder.id )
											}
										>
											<span className="search-modal-item-text">
												<span className="search-modal-item-title">
													{ folder.name }
												</span>
												{ folder.goal && (
													<span className="search-modal-item-desc">
														{ folder.goal }
													</span>
												) }
											</span>
										</button>
									</li>
								) ) }
							</ul>
						) }
					</div>
				</Dialog.Popup>
			</Dialog.Portal>
		</Dialog.Root>
	);
}
