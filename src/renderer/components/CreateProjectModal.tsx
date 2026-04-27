import React, { useEffect, useState } from 'react';
import { Dialog } from '@base-ui/react/dialog';

import type { Project } from '../../types';

import { FolderPlusIcon } from '../icons';

type Props = {
	open: boolean;
	onClose: () => void;
	onCreated: ( project: Project ) => void;
};

function basename( filePath: string ): string {
	const parts = filePath.split( /[\\/]/ ).filter( Boolean );
	return parts[ parts.length - 1 ] ?? filePath;
}

export function CreateProjectModal( {
	open,
	onClose,
	onCreated,
}: Props ): React.ReactElement {
	const [ path, setPath ] = useState< string | null >( null );
	const [ name, setName ] = useState( '' );
	const [ goal, setGoal ] = useState( '' );
	const [ submitting, setSubmitting ] = useState( false );

	// Reset form whenever the modal closes so the next opening starts fresh.
	useEffect( () => {
		if ( ! open ) {
			setPath( null );
			setName( '' );
			setGoal( '' );
			setSubmitting( false );
		}
	}, [ open ] );

	const onPickFolder = async (): Promise< void > => {
		const chosen = await window.api.project.pickPath();
		if ( ! chosen ) {
			return;
		}
		setPath( chosen );
		setName( ( prev ) =>
			prev.trim().length > 0 ? prev : basename( chosen )
		);
	};

	const canSubmit = path !== null && name.trim().length > 0 && ! submitting;

	const onCreate = async (): Promise< void > => {
		if ( ! path || ! canSubmit ) {
			return;
		}
		setSubmitting( true );
		try {
			const trimmedGoal = goal.trim();
			const project = await window.api.project.create( {
				path,
				name: name.trim(),
				goal: trimmedGoal.length > 0 ? trimmedGoal : undefined,
			} );
			onCreated( project );
			onClose();
		} finally {
			setSubmitting( false );
		}
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
				<Dialog.Backdrop className="dialog-backdrop" />
				<Dialog.Popup
					className="dialog-panel"
					data-testid="create-project-modal"
				>
					<Dialog.Title className="dialog-title">
						Use an existing folder
					</Dialog.Title>
					<Dialog.Description className="dialog-subtitle">
						Pick a folder and Claude will treat its files as project
						context. Add a goal to shape how Claude approaches the
						work.
					</Dialog.Description>

					<div className="dialog-field">
						<span
							className="dialog-label"
							id="project-pick-folder-label"
						>
							Choose folder
						</span>
						<button
							type="button"
							className="dialog-folder-picker"
							data-testid="project-pick-folder"
							aria-labelledby="project-pick-folder-label"
							onClick={ () => {
								void onPickFolder();
							} }
						>
							<FolderPlusIcon />
							<span className="dialog-folder-picker-path">
								{ path ?? 'Pick a folder…' }
							</span>
						</button>
					</div>

					<div className="dialog-field">
						<label className="dialog-label" htmlFor="project-name">
							Name <span className="dialog-required">*</span>
						</label>
						<input
							id="project-name"
							type="text"
							className="dialog-input"
							data-testid="project-name"
							value={ name }
							onChange={ ( e ) => setName( e.target.value ) }
							placeholder="Project name"
						/>
					</div>

					<div className="dialog-field">
						<label className="dialog-label" htmlFor="project-goal">
							Goal
						</label>
						<textarea
							id="project-goal"
							className="dialog-textarea"
							data-testid="project-goal"
							rows={ 3 }
							value={ goal }
							onChange={ ( e ) => setGoal( e.target.value ) }
							placeholder="Tell Claude how to work in this project (optional)"
						/>
					</div>

					<div className="dialog-footer">
						<button
							type="button"
							className="dialog-button-secondary"
							data-testid="project-cancel"
							onClick={ onClose }
							disabled={ submitting }
						>
							Cancel
						</button>
						<button
							type="button"
							className="dialog-button-primary"
							data-testid="project-create"
							onClick={ () => {
								void onCreate();
							} }
							disabled={ ! canSubmit }
						>
							{ submitting ? 'Creating…' : 'Create' }
						</button>
					</div>
				</Dialog.Popup>
			</Dialog.Portal>
		</Dialog.Root>
	);
}
