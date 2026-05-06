import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

import type { DraftAttachment, MessageSelection } from '../../types';
import { relativeDate } from '../lib/relativeDate';
import { SelectionsIcon } from '../icons';
import { ToolBlock } from './ToolBlock';
import { ToolGroup } from './ToolGroup';

export type UserMessage = {
	kind: 'user';
	id: string;
	text: string;
	attachments?: DraftAttachment[];
	selections?: MessageSelection[];
};

export type AssistantMessage = {
	kind: 'assistant';
	id: string;
	text: string;
	streaming: boolean;
	errored?: boolean;
	cancelled?: boolean;
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

type TranscriptItem =
	| UserMessage
	| AssistantMessage
	| { kind: 'tool-group'; tools: ToolMessage[] };

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

type Props = {
	messages: ChatMessage[];
	onPreviewAttachment?: (
		folder: 'sources' | 'drafts' | 'published',
		relPath: string,
		name: string
	) => void;
	transcriptRef?: React.Ref< HTMLElement >;
	testId?: string;
};

export function ChatTranscript( {
	messages,
	onPreviewAttachment,
	transcriptRef,
	testId = 'transcript',
}: Props ): React.ReactElement {
	return (
		<main
			className="transcript"
			data-testid={ testId }
			ref={ transcriptRef }
		>
			{ groupMessages( messages ).map( ( item ) => {
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
								</>
							) }
						</div>
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
