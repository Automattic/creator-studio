/**
 * App-wide domain types. Each is a zod schema (the canonical definition,
 * usable for runtime validation) plus an inferred TypeScript type of the
 * same name (used everywhere — see the namespace pattern in
 * src/main/ipc.ts's history).
 *
 * These cross every process boundary (main, preload, renderer) so they
 * deliberately live outside src/main/ — they're domain concepts, not
 * IPC concerns.
 */

import { z } from 'zod';

import { CHAT_ACTION_IDS } from './chat-actions';

// Prompts are a superset of chat-action ids: every starter chat has a
// matching prompt, but contextual prompts (e.g. `discuss-draft`, fired when
// the user clicks a draft card) live outside the empty-state / "+" menu.
export const PROMPT_NAMES = [ ...CHAT_ACTION_IDS, 'discuss-draft' ] as const;
export const PromptName = z.enum( PROMPT_NAMES );
export type PromptName = z.infer< typeof PromptName >;

export const ChatMeta = z.object( {
	id: z.string().min( 1 ),
	title: z.string().optional(),
	sessionId: z.string().nullable(),
	createdAt: z.number(),
	lastMessageAt: z.number().nullable(),
	// Set when the chat is bound to a specific draft file (relative path
	// inside the project). Used to reuse an existing chat when the user
	// re-clicks the same draft card.
	draftPath: z.string().optional(),
} );
export type ChatMeta = z.infer< typeof ChatMeta >;

export const RecentChat = z.object( {
	projectId: z.string().min( 1 ),
	projectName: z.string().min( 1 ),
	chat: ChatMeta,
} );
export type RecentChat = z.infer< typeof RecentChat >;

export const Draft = z.object( {
	projectId: z.string().min( 1 ),
	projectName: z.string().min( 1 ),
	relPath: z.string().min( 1 ),
	title: z.string(),
	description: z.string(),
	wordCount: z.number().int().nonnegative(),
	mtime: z.number(),
} );
export type Draft = z.infer< typeof Draft >;

const PersistedUser = z.object( {
	kind: z.literal( 'user' ),
	id: z.string(),
	text: z.string(),
	at: z.number(),
} );
const PersistedAssistant = z.object( {
	kind: z.literal( 'assistant' ),
	id: z.string(),
	text: z.string(),
	errored: z.boolean().optional(),
	cancelled: z.boolean().optional(),
	at: z.number(),
} );
const PersistedTool = z.object( {
	kind: z.literal( 'tool' ),
	id: z.string(),
	toolUseId: z.string(),
	toolName: z.string(),
	input: z.unknown(),
	status: z.enum( [ 'done', 'error' ] ),
	output: z.string().optional(),
	at: z.number(),
} );
export const PersistedMessage = z.discriminatedUnion( 'kind', [
	PersistedUser,
	PersistedAssistant,
	PersistedTool,
] );
export type PersistedMessage = z.infer< typeof PersistedMessage >;

export const Project = z.object( {
	id: z.string().min( 1 ),
	path: z.string().min( 1 ),
	label: z.string().min( 1 ),
	name: z.string().min( 1 ),
	goal: z.string().optional(),
} );
export type Project = z.infer< typeof Project >;

export const DirEntry = z.object( {
	name: z.string(),
	isDirectory: z.boolean(),
	mtime: z.number().optional(),
} );
export type DirEntry = z.infer< typeof DirEntry >;

export const SearchHit = z.object( {
	folder: z.string(),
	relPath: z.string(),
	name: z.string(),
	isDirectory: z.boolean(),
	mtime: z.number().optional(),
} );
export type SearchHit = z.infer< typeof SearchHit >;

export const UiPrefs = z.object( {
	resourcesPanelOpen: z.boolean(),
} );
export type UiPrefs = z.infer< typeof UiPrefs >;

// Per-project UI state persisted at <project>/.studio-write/ui-prefs.json.
// Distinct from window-level `UiPrefs` because the values follow the project
// (e.g. which resource sections the user collapsed in this workspace).
export const ProjectUiPrefs = z.object( {
	resourcesCollapsed: z.record( z.string(), z.boolean() ),
} );
export type ProjectUiPrefs = z.infer< typeof ProjectUiPrefs >;

export const PermissionResponse = z.object( {
	requestId: z.string().min( 1 ),
	projectId: z.string().min( 1 ),
	decision: z.enum( [ 'allow', 'deny' ] ),
	remember: z.boolean(),
} );
export type PermissionResponse = z.infer< typeof PermissionResponse >;

export const AgentEvent = z.discriminatedUnion( 'kind', [
	z.object( {
		kind: z.literal( 'init' ),
		projectId: z.string().min( 1 ),
		chatId: z.string().min( 1 ),
		sessionId: z.string(),
	} ),
	z.object( {
		kind: z.literal( 'text-delta' ),
		projectId: z.string().min( 1 ),
		chatId: z.string().min( 1 ),
		text: z.string(),
	} ),
	z.object( {
		kind: z.literal( 'tool-use-start' ),
		projectId: z.string().min( 1 ),
		chatId: z.string().min( 1 ),
		toolUseId: z.string(),
		toolName: z.string(),
		input: z.unknown(),
	} ),
	z.object( {
		kind: z.literal( 'tool-result' ),
		projectId: z.string().min( 1 ),
		chatId: z.string().min( 1 ),
		toolUseId: z.string(),
		output: z.string(),
		isError: z.boolean(),
	} ),
	z.object( {
		kind: z.literal( 'permission-request' ),
		projectId: z.string().min( 1 ),
		chatId: z.string().min( 1 ),
		requestId: z.string(),
		toolName: z.string(),
		input: z.unknown(),
	} ),
	z.object( {
		kind: z.literal( 'result' ),
		projectId: z.string().min( 1 ),
		chatId: z.string().min( 1 ),
		costUsd: z.number(),
		tokens: z.number(),
		durationMs: z.number(),
		numTurns: z.number(),
	} ),
	z.object( {
		kind: z.literal( 'done' ),
		projectId: z.string().min( 1 ),
		chatId: z.string().min( 1 ),
		success: z.boolean(),
		cancelled: z.boolean(),
	} ),
	z.object( {
		kind: z.literal( 'error' ),
		projectId: z.string().min( 1 ),
		chatId: z.string().min( 1 ),
		message: z.string(),
	} ),
	z.object( {
		kind: z.literal( 'chat-title' ),
		projectId: z.string().min( 1 ),
		chatId: z.string().min( 1 ),
		title: z.string(),
	} ),
] );
export type AgentEvent = z.infer< typeof AgentEvent >;
