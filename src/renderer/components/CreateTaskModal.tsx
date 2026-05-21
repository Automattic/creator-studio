import React, { useEffect, useState } from 'react';
import { Dialog } from '@base-ui/react/dialog';

import type { Project, TaskDefinition, TaskSchedule } from '../../types';
import { ordinal } from '../lib/ordinal';

type ScheduleKind = TaskSchedule[ 'kind' ];

type Props = {
	open: boolean;
	onClose: () => void;
	projects: Project[];
	defaultProjectId: string | null;
	// When set, the modal edits an existing definition instead of creating one.
	editDef: TaskDefinition | null;
};

const SCHEDULE_OPTIONS: ReadonlyArray< { kind: ScheduleKind; label: string } > =
	[
		{ kind: 'manual', label: 'Manual' },
		{ kind: 'hourly', label: 'Hourly' },
		{ kind: 'daily', label: 'Daily' },
		{ kind: 'weekly', label: 'Weekly' },
		{ kind: 'monthly', label: 'Monthly' },
	];

// Display order Mon→Sun; values match JS getDay() (Sun=0).
const WEEKDAYS: ReadonlyArray< { value: number; label: string } > = [
	{ value: 1, label: 'Mon' },
	{ value: 2, label: 'Tue' },
	{ value: 3, label: 'Wed' },
	{ value: 4, label: 'Thu' },
	{ value: 5, label: 'Fri' },
	{ value: 6, label: 'Sat' },
	{ value: 0, label: 'Sun' },
];

const DAYS_OF_MONTH: ReadonlyArray< number > = Array.from(
	{ length: 31 },
	( _, i ) => i + 1
);

export function CreateTaskModal( {
	open,
	onClose,
	projects,
	defaultProjectId,
	editDef,
}: Props ): React.ReactElement {
	const [ name, setName ] = useState( '' );
	const [ description, setDescription ] = useState( '' );
	const [ instructions, setInstructions ] = useState( '' );
	const [ projectId, setProjectId ] = useState( '' );
	const [ scheduleKind, setScheduleKind ] =
		useState< ScheduleKind >( 'manual' );
	const [ time, setTime ] = useState( '09:00' );
	const [ weekday, setWeekday ] = useState( 1 );
	const [ dayOfMonth, setDayOfMonth ] = useState( 1 );
	const [ submitting, setSubmitting ] = useState( false );
	const [ error, setError ] = useState< string | null >( null );

	// Seed fields when the modal opens; clear them when it closes.
	useEffect( () => {
		if ( ! open ) {
			return;
		}
		if ( editDef ) {
			setName( editDef.title );
			setDescription( editDef.description );
			setInstructions( editDef.instructions );
			setProjectId( editDef.projectId );
			setScheduleKind( editDef.schedule.kind );
			if (
				editDef.schedule.kind === 'daily' ||
				editDef.schedule.kind === 'weekly' ||
				editDef.schedule.kind === 'monthly'
			) {
				setTime( editDef.schedule.time );
			}
			if ( editDef.schedule.kind === 'weekly' ) {
				setWeekday( editDef.schedule.weekday );
			}
			if ( editDef.schedule.kind === 'monthly' ) {
				setDayOfMonth( editDef.schedule.dayOfMonth );
			}
		} else {
			setName( '' );
			setDescription( '' );
			setInstructions( '' );
			setProjectId( defaultProjectId ?? projects[ 0 ]?.id ?? '' );
			setScheduleKind( 'manual' );
			setTime( '09:00' );
			setWeekday( 1 );
			setDayOfMonth( 1 );
		}
		setSubmitting( false );
		setError( null );
	}, [ open, editDef, defaultProjectId, projects ] );

	const buildSchedule = (): TaskSchedule => {
		switch ( scheduleKind ) {
			case 'hourly':
				return { kind: 'hourly' };
			case 'daily':
				return { kind: 'daily', time };
			case 'weekly':
				return { kind: 'weekly', weekday, time };
			case 'monthly':
				return { kind: 'monthly', dayOfMonth, time };
			case 'manual':
			default:
				return { kind: 'manual' };
		}
	};

	const canSubmit =
		name.trim().length > 0 &&
		instructions.trim().length > 0 &&
		projectId.length > 0 &&
		! submitting;

	const onSubmit = async (): Promise< void > => {
		if ( ! canSubmit ) {
			return;
		}
		setSubmitting( true );
		setError( null );
		try {
			const schedule = buildSchedule();
			if ( editDef ) {
				const updated = await window.api.tasks.update(
					editDef.projectId,
					editDef.id,
					{
						title: name.trim(),
						description: description.trim(),
						instructions: instructions.trim(),
						schedule,
					}
				);
				if ( ! updated ) {
					setError( 'Could not save the task.' );
					return;
				}
			} else {
				const created = await window.api.tasks.create( {
					projectId,
					title: name.trim(),
					description: description.trim(),
					instructions: instructions.trim(),
					schedule,
				} );
				if ( ! created ) {
					setError( 'Could not create the task.' );
					return;
				}
			}
			onClose();
		} catch ( err ) {
			setError( err instanceof Error ? err.message : String( err ) );
		} finally {
			setSubmitting( false );
		}
	};

	// `monthly` renders its own day + time row, so it stays out of the
	// generic "At" block.
	const showTime = scheduleKind === 'daily' || scheduleKind === 'weekly';

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
					data-testid="create-task-modal"
				>
					<Dialog.Title className="dialog-title">
						{ editDef ? 'Edit task' : 'New task' }
					</Dialog.Title>
					<Dialog.Description className="dialog-subtitle">
						Tasks let Studio Write do work for you on a schedule or
						on demand.
					</Dialog.Description>

					<p
						className="dialog-banner"
						data-testid="create-task-banner"
					>
						Tasks run while Studio Write is open.
					</p>

					<div className="dialog-field">
						<label className="dialog-label" htmlFor="task-name">
							Name <span className="dialog-required">*</span>
						</label>
						<input
							id="task-name"
							type="text"
							className="dialog-input"
							data-testid="task-name"
							value={ name }
							onChange={ ( e ) => setName( e.target.value ) }
							placeholder="Daily Reddit digest"
						/>
					</div>

					<div className="dialog-field">
						<label
							className="dialog-label"
							htmlFor="task-description"
						>
							Description
						</label>
						<input
							id="task-description"
							type="text"
							className="dialog-input"
							data-testid="task-description"
							value={ description }
							onChange={ ( e ) =>
								setDescription( e.target.value )
							}
							placeholder="A short summary of what this task does"
						/>
					</div>

					<div className="dialog-field">
						<label
							className="dialog-label"
							htmlFor="task-instructions"
						>
							Instructions{ ' ' }
							<span className="dialog-required">*</span>
						</label>
						<textarea
							id="task-instructions"
							className="dialog-textarea"
							data-testid="task-instructions"
							rows={ 6 }
							value={ instructions }
							onChange={ ( e ) =>
								setInstructions( e.target.value )
							}
							placeholder="What should Studio Write do each time this runs?"
						/>
					</div>

					<div className="dialog-field">
						<label className="dialog-label" htmlFor="task-project">
							Project
						</label>
						<select
							id="task-project"
							className="dialog-select"
							data-testid="task-project"
							value={ projectId }
							disabled={ editDef !== null }
							onChange={ ( e ) => setProjectId( e.target.value ) }
						>
							{ projects.map( ( p ) => (
								<option key={ p.id } value={ p.id }>
									{ p.name }
								</option>
							) ) }
						</select>
					</div>

					<div className="dialog-field">
						<span className="dialog-label">Schedule</span>
						<div
							className="dialog-segmented"
							role="tablist"
							aria-label="Schedule"
						>
							{ SCHEDULE_OPTIONS.map( ( opt ) => (
								<button
									key={ opt.kind }
									type="button"
									role="tab"
									className="dialog-segmented-option"
									data-testid={ `task-schedule-${ opt.kind }` }
									data-active={
										scheduleKind === opt.kind
											? 'true'
											: undefined
									}
									aria-selected={ scheduleKind === opt.kind }
									onClick={ () =>
										setScheduleKind( opt.kind )
									}
								>
									{ opt.label }
								</button>
							) ) }
						</div>
						{ scheduleKind === 'hourly' && (
							<p className="dialog-hint">
								Runs at the top of every hour.
							</p>
						) }
						{ showTime && (
							<div className="dialog-schedule-at">
								<label htmlFor="task-schedule-time">At</label>
								<input
									id="task-schedule-time"
									type="time"
									className="dialog-time-input"
									data-testid="task-schedule-time"
									value={ time }
									onChange={ ( e ) =>
										setTime( e.target.value )
									}
								/>
							</div>
						) }
						{ scheduleKind === 'weekly' && (
							<div className="dialog-weekday-row">
								{ WEEKDAYS.map( ( d ) => (
									<button
										key={ d.value }
										type="button"
										className="dialog-weekday-toggle"
										data-testid={ `task-schedule-weekday-${ d.value }` }
										data-active={
											weekday === d.value
												? 'true'
												: undefined
										}
										onClick={ () => setWeekday( d.value ) }
									>
										{ d.label }
									</button>
								) ) }
							</div>
						) }
						{ scheduleKind === 'monthly' && (
							<>
								<div className="dialog-schedule-at">
									<label htmlFor="task-schedule-day">
										On the
									</label>
									<select
										id="task-schedule-day"
										className="dialog-day-select"
										data-testid="task-schedule-day"
										value={ dayOfMonth }
										onChange={ ( e ) =>
											setDayOfMonth(
												Number( e.target.value )
											)
										}
									>
										{ DAYS_OF_MONTH.map( ( d ) => (
											<option key={ d } value={ d }>
												{ ordinal( d ) }
											</option>
										) ) }
									</select>
									<label htmlFor="task-schedule-time">
										at
									</label>
									<input
										id="task-schedule-time"
										type="time"
										className="dialog-time-input"
										data-testid="task-schedule-time"
										value={ time }
										onChange={ ( e ) =>
											setTime( e.target.value )
										}
									/>
								</div>
								{ dayOfMonth > 28 && (
									<p className="dialog-hint">
										Shorter months run on their last day.
									</p>
								) }
							</>
						) }
					</div>

					{ error && (
						<p
							className="dialog-error"
							data-testid="task-create-error"
						>
							{ error }
						</p>
					) }

					<div className="dialog-footer">
						<button
							type="button"
							className="dialog-button-secondary"
							data-testid="task-cancel"
							onClick={ onClose }
							disabled={ submitting }
						>
							Cancel
						</button>
						<button
							type="button"
							className="dialog-button-primary"
							data-testid="task-create"
							onClick={ () => {
								void onSubmit();
							} }
							disabled={ ! canSubmit }
						>
							{ /* eslint-disable-next-line no-nested-ternary */ }
							{ submitting
								? 'Saving…'
								: editDef
								? 'Save'
								: 'Create' }
						</button>
					</div>
				</Dialog.Popup>
			</Dialog.Portal>
		</Dialog.Root>
	);
}
