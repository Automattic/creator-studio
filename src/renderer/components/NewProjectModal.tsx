import React, { useEffect, useMemo, useState } from 'react';
import { Dialog } from '@base-ui/react/dialog';

import type { Project } from '../../types';

import { ChevronIcon, FolderIcon } from '../icons';

type Props = {
	open: boolean;
	onClose: () => void;
	onCreated: ( project: Project ) => void;
};

function previewFolderName( name: string ): string {
	const cleaned = name
		.trim()
		.replace( /[\\/]+/g, '-' )
		.replace( /\s+/g, ' ' )
		.replace( /^\.+/, '' );
	return cleaned.length > 0 ? cleaned : 'project';
}

export function NewProjectModal( {
	open,
	onClose,
	onCreated,
}: Props ): React.ReactElement {
	const [ name, setName ] = useState( '' );
	const [ goal, setGoal ] = useState( '' );
	const [ parentDir, setParentDir ] = useState< string | null >( null );
	const [ defaultParentDir, setDefaultParentDir ] = useState< string | null >(
		null
	);
	const [ advancedOpen, setAdvancedOpen ] = useState( false );
	const [ submitting, setSubmitting ] = useState( false );
	const [ error, setError ] = useState< string | null >( null );

	useEffect( () => {
		if ( ! open ) {
			setName( '' );
			setGoal( '' );
			setParentDir( null );
			setAdvancedOpen( false );
			setSubmitting( false );
			setError( null );
		}
	}, [ open ] );

	useEffect( () => {
		if ( ! open || defaultParentDir !== null ) {
			return;
		}
		let cancelled = false;
		void window.api.project.defaultParentDir().then( ( dir ) => {
			if ( ! cancelled ) {
				setDefaultParentDir( dir );
			}
		} );
		return () => {
			cancelled = true;
		};
	}, [ open, defaultParentDir ] );

	const onPickParentDir = async (): Promise< void > => {
		const chosen = await window.api.project.pickPath();
		if ( ! chosen ) {
			return;
		}
		setParentDir( chosen );
	};

	const trimmedName = name.trim();
	const effectiveParent = parentDir ?? defaultParentDir;
	const previewPath = useMemo( () => {
		if ( ! effectiveParent ) {
			return null;
		}
		return `${ effectiveParent }/${ previewFolderName( trimmedName ) }`;
	}, [ effectiveParent, trimmedName ] );

	const canSubmit = trimmedName.length > 0 && ! submitting;

	const onSubmit = async (): Promise< void > => {
		if ( ! canSubmit ) {
			return;
		}
		setSubmitting( true );
		setError( null );
		try {
			const trimmedGoal = goal.trim();
			const result = await window.api.project.createNew( {
				name: trimmedName,
				goal: trimmedGoal.length > 0 ? trimmedGoal : undefined,
				parentDir: parentDir ?? undefined,
			} );
			if ( result.status === 'ok' ) {
				onCreated( result.project );
				onClose();
			} else if ( result.status === 'already-linked' ) {
				setError(
					`This folder is already linked as "${ result.existing.name }".`
				);
			} else if ( result.status === 'target-exists' ) {
				setError(
					`A folder already exists at ${ result.targetPath }. Pick a different name or import that folder instead.`
				);
			} else {
				setError(
					`Couldn't create the project folder: ${ result.message }`
				);
			}
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
					data-testid="new-project-modal"
				>
					<Dialog.Title className="dialog-title">
						Start a new project
					</Dialog.Title>
					<Dialog.Description className="dialog-subtitle">
						Give it a name and Studio Write will create a folder for
						it. Add a goal to shape how Claude approaches the work.
					</Dialog.Description>

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

					<div className="dialog-advanced">
						<button
							type="button"
							className="dialog-advanced-toggle"
							data-testid="project-advanced-toggle"
							data-open={ advancedOpen ? 'true' : undefined }
							aria-expanded={ advancedOpen }
							onClick={ () => setAdvancedOpen( ( v ) => ! v ) }
						>
							<ChevronIcon
								className={
									advancedOpen
										? 'dialog-advanced-chevron dialog-advanced-chevron-open'
										: 'dialog-advanced-chevron'
								}
							/>
							<span>Advanced</span>
						</button>
						{ advancedOpen && (
							<div className="dialog-advanced-body">
								<div className="dialog-field">
									<span
										className="dialog-label"
										id="project-advanced-parent-label"
									>
										Parent folder
									</span>
									<button
										type="button"
										className="dialog-folder-picker"
										data-testid="project-advanced-parent"
										aria-labelledby="project-advanced-parent-label"
										onClick={ () => {
											void onPickParentDir();
										} }
									>
										<FolderIcon />
										<span className="dialog-folder-picker-path">
											{ effectiveParent ?? 'Loading…' }
										</span>
									</button>
								</div>
							</div>
						) }
						{ previewPath && trimmedName.length > 0 && (
							<p
								className="dialog-path-preview"
								data-testid="project-path-preview"
							>
								Will be created at <code>{ previewPath }</code>
							</p>
						) }
					</div>

					{ error && (
						<p
							className="dialog-error"
							data-testid="project-create-error"
						>
							{ error }
						</p>
					) }

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
								void onSubmit();
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
