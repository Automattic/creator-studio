import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

import type { DraftAttachment, MessageSelection } from '../../types';
import { SelectionsIcon } from '../icons';
import { relativeDate } from '../lib/relativeDate';
import {
	resolveProjectFile,
	type ResolvedProjectFile,
} from '../lib/resolveProjectFile';
import { ToolBlock } from './ToolBlock';
import { ToolGroup } from './ToolGroup';

export type UserMessage = {
	kind: 'user';
	id: string;
	text: string;
	attachments?: DraftAttachment[];
	selections?: MessageSelection[];
};

export type AssistantErrorAction = 'open-settings';

export type AssistantMessage = {
	kind: 'assistant';
	id: string;
	text: string;
	streaming: boolean;
	errored?: boolean;
	cancelled?: boolean;
	// Optional inline affordance rendered next to an errored bubble — e.g.
	// "Open Settings" for a bad-API-key error.
	errorAction?: AssistantErrorAction;
};

export type ToolMessage = {
	kind: 'tool';
	id: string;
	toolUseId: string;
	toolName: string;
	input: unknown;
	status: 'running' | 'done' | 'error';
	output?: string;
};

export type ChatMessage = UserMessage | AssistantMessage | ToolMessage;

type CreatedFileItem = {
	kind: 'created-file';
	id: string;
	folder: ResolvedProjectFile[ 'folder' ];
	relPath: string;
	name: string;
};

type TranscriptItem =
	| UserMessage
	| AssistantMessage
	| { kind: 'tool-group'; tools: ToolMessage[] }
	| CreatedFileItem;

export function groupMessages( messages: ChatMessage[] ): TranscriptItem[] {
	const items: TranscriptItem[] = [];
	for ( const m of messages ) {
		if ( m.kind === 'tool' ) {
			const last = items[ items.length - 1 ];
			if ( last && last.kind === 'tool-group' ) {
				last.tools.push( m );
			} else {
				items.push( { kind: 'tool-group', tools: [ m ] } );
			}
			continue;
		}
		items.push( m );
	}
	return items;
}

// Walks the grouped transcript, and after each tool group, emits one
// `created-file` card per unique file the agent successfully wrote inside
// `<projectPath>/{sources,drafts,published}/`. The dedup is across the whole
// transcript: a Write that later turns into an Edit/Write cycle still shows
// only the first card. Returns the input unchanged when projectPath is null
// (e.g. callers that haven't wired the prop yet).
export function withCreatedFileCards(
	items: TranscriptItem[],
	projectPath: string | null
): TranscriptItem[] {
	if ( ! projectPath ) {
		return items;
	}
	const out: TranscriptItem[] = [];
	const seen = new Set< string >();
	for ( const item of items ) {
		out.push( item );
		if ( item.kind !== 'tool-group' ) {
			continue;
		}
		for ( const tool of item.tools ) {
			if ( tool.toolName !== 'Write' || tool.status !== 'done' ) {
				continue;
			}
			const path = extractFilePath( tool.input );
			if ( ! path ) {
				continue;
			}
			const resolved = resolveProjectFile( path, projectPath );
			if ( ! resolved ) {
				continue;
			}
			const dedupKey = `${ resolved.folder }:${ resolved.relPath }`;
			if ( seen.has( dedupKey ) ) {
				continue;
			}
			seen.add( dedupKey );
			out.push( {
				kind: 'created-file',
				id: `created:${ tool.id }:${ dedupKey }`,
				folder: resolved.folder,
				relPath: resolved.relPath,
				name: resolved.name,
			} );
		}
	}
	return out;
}

function extractFilePath( input: unknown ): string | null {
	if (
		typeof input === 'object' &&
		input !== null &&
		typeof ( input as { file_path?: unknown } ).file_path === 'string'
	) {
		return ( input as { file_path: string } ).file_path;
	}
	return null;
}

type Props = {
	messages: ChatMessage[];
	// Absolute path of the active project, used to detect which Write tool
	// outputs land inside `sources/`, `drafts/`, or `published/` so they can
	// be surfaced as clickable cards. Optional: callers that don't pass it
	// (or pass null) just see the old transcript without created-file cards.
	projectPath?: string | null;
	onPreviewAttachment?: (
		folder: 'sources' | 'drafts' | 'published',
		relPath: string,
		name: string
	) => void;
	onErrorAction?: ( action: AssistantErrorAction ) => void;
	transcriptRef?: React.Ref< HTMLElement >;
	testId?: string;
};

export function ChatTranscript( {
	messages,
	projectPath = null,
	onPreviewAttachment,
	onErrorAction,
	transcriptRef,
	testId = 'transcript',
}: Props ): React.ReactElement {
	const items = withCreatedFileCards(
		groupMessages( messages ),
		projectPath
	);
	return (
		<main
			className="transcript"
			data-testid={ testId }
			ref={ transcriptRef }
		>
			{ items.map( ( item ) => {
				if ( item.kind === 'user' ) {
					const atts = item.attachments ?? [];
					const sels = item.selections ?? [];
					return (
						<div
							key={ item.id }
							className="bubble bubble-user"
							data-testid="bubble-user"
						>
							{ sels.length > 0 && (
								<div
									className="bubble-selections"
									data-testid="bubble-selections"
									aria-label={ `${ sels.length } selection${
										sels.length === 1 ? '' : 's'
									}` }
									title={ sels
										.map(
											( s ) =>
												`Lines ${ s.fromLine }–${ s.toLine }:\n${ s.text }`
										)
										.join( '\n\n———\n\n' ) }
								>
									<span
										className="bubble-selections-icon"
										aria-hidden="true"
									>
										<SelectionsIcon size={ 14 } />
									</span>
									<span className="bubble-selections-label">
										{ sels.length === 1
											? '1 selection'
											: `${ sels.length } selections` }
									</span>
								</div>
							) }
							<div className="bubble-text">{ item.text }</div>
							{ atts.map( ( a ) => (
								<UserAttachmentCard
									key={ `${ a.folder }:${ a.relPath }` }
									attachment={ a }
									onPreview={
										onPreviewAttachment
											? () =>
													onPreviewAttachment(
														a.folder,
														a.relPath,
														a.name
													)
											: undefined
									}
								/>
							) ) }
						</div>
					);
				}
				if ( item.kind === 'assistant' ) {
					const isWorking = item.streaming && item.text.length === 0;
					const isCancelled = ! item.streaming && !! item.cancelled;
					if (
						! item.streaming &&
						! isCancelled &&
						item.text.length === 0
					) {
						return null;
					}
					return (
						<div
							key={ item.id }
							className={ `bubble bubble-assistant${
								item.errored ? ' bubble-error' : ''
							}${ isCancelled ? ' bubble-cancelled' : '' }` }
							data-testid="bubble-assistant"
							data-streaming={ item.streaming ? 'true' : 'false' }
							data-cancelled={ isCancelled ? 'true' : 'false' }
						>
							{ isWorking ? (
								<div
									className="bubble-thinking"
									data-testid="bubble-thinking"
									aria-label="Assistant is working"
								>
									<span />
									<span />
									<span />
								</div>
							) : (
								<>
									{ item.text.length > 0 && (
										<div className="bubble-text bubble-markdown">
											<ReactMarkdown
												remarkPlugins={ [ remarkGfm ] }
											>
												{ item.text }
											</ReactMarkdown>
										</div>
									) }
									{ isCancelled && (
										<div
											className="bubble-stopped"
											data-testid="bubble-stopped"
										>
											Stopped
										</div>
									) }
									{ item.errorAction === 'open-settings' &&
										onErrorAction && (
											<button
												type="button"
												className="bubble-error-action"
												data-testid="bubble-error-open-settings"
												onClick={ () =>
													onErrorAction(
														'open-settings'
													)
												}
											>
												Open Settings
											</button>
										) }
								</>
							) }
						</div>
					);
				}
				if ( item.kind === 'created-file' ) {
					return (
						<CreatedFileCard
							key={ item.id }
							folder={ item.folder }
							relPath={ item.relPath }
							name={ item.name }
							onPreview={
								onPreviewAttachment
									? () =>
											onPreviewAttachment(
												item.folder,
												item.relPath,
												item.name
											)
									: undefined
							}
						/>
					);
				}
				if ( item.tools.length === 1 ) {
					const t = item.tools[ 0 ];
					return (
						<ToolBlock
							key={ t.id }
							toolName={ t.toolName }
							input={ t.input }
							status={ t.status }
							output={ t.output }
						/>
					);
				}
				return (
					<ToolGroup
						key={ item.tools[ 0 ].id }
						tools={ item.tools }
					/>
				);
			} ) }
		</main>
	);
}

function fileExtensionLabel( name: string ): string {
	const dot = name.lastIndexOf( '.' );
	if ( dot <= 0 || dot === name.length - 1 ) {
		return 'File';
	}
	return name.slice( dot + 1 ).toUpperCase();
}

function CreatedFileCard( {
	folder,
	relPath,
	name,
	onPreview,
}: {
	folder: 'sources' | 'drafts' | 'published';
	relPath: string;
	name: string;
	onPreview?: () => void;
} ): React.ReactElement {
	const ext = fileExtensionLabel( name );
	return (
		<button
			type="button"
			className="bubble-attachment bubble-created-file"
			data-testid="bubble-created-file"
			data-folder={ folder }
			data-rel-path={ relPath }
			onClick={ onPreview }
			disabled={ ! onPreview }
			title={ `Open ${ name }` }
		>
			<span className="bubble-attachment-name">{ name }</span>
			<span className="bubble-attachment-meta">
				<span className="bubble-attachment-kind">
					Created · { ext } · { folder }
				</span>
			</span>
		</button>
	);
}

function UserAttachmentCard( {
	attachment,
	onPreview,
}: {
	attachment: DraftAttachment;
	onPreview?: () => void;
} ): React.ReactElement {
	const ext = fileExtensionLabel( attachment.name );
	const date =
		attachment.mtime !== null ? relativeDate( attachment.mtime ) : null;
	return (
		<button
			type="button"
			className="bubble-attachment"
			data-testid="bubble-attachment"
			onClick={ onPreview }
			disabled={ ! onPreview }
			title={ `Preview ${ attachment.name }` }
		>
			<span className="bubble-attachment-name">{ attachment.name }</span>
			<span className="bubble-attachment-meta">
				<span className="bubble-attachment-kind">
					Document · { ext }
				</span>
				{ date && (
					<span className="bubble-attachment-date">{ date }</span>
				) }
			</span>
		</button>
	);
}
