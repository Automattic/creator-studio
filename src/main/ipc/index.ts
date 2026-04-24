/**
 * IPC contract shared by the main process, preload, and renderer.
 *
 *   IpcChannels         — channel name constants; the "URLs" of the IPC layer.
 *   AgentEvent          — discriminated union for main → renderer push events
 *                         on IpcChannels.chatOnEvent.
 *   PermissionResponse  — renderer → main payload for the user's reply to a
 *                         prior permission prompt; shared because both the
 *                         agent service (which constructs it) and the channel
 *                         file (which validates it) need the schema.
 *   Folder / ChatMeta / ChatKind / PersistedMessage / PromptName
 *                       — domain types referenced across processes.
 *
 * Per-channel request schemas + handlers live in src/main/ipc/channels/<name>.ts
 * via `defineChannel`. The router is in ./router.ts; the registry of channels
 * is in ./registry.ts.
 */

import { z } from 'zod';

export const IpcChannels = {
	chatOnEvent: 'chat:onEvent',
	chatSend: 'chat:send',
	chatsCreate: 'chats:create',
	chatsList: 'chats:list',
	chatsLoad: 'chats:load',
	foldersAdd: 'folders:add',
	foldersList: 'folders:list',
	foldersRemove: 'folders:remove',
	permissionRespond: 'permission:respond',
	promptsGet: 'prompts:get',
} as const;

export const PromptName = z.enum( [ 'ideas', 'draft' ] );
export type PromptName = z.infer< typeof PromptName >;

export const ChatKind = z.enum( [ 'general', 'ideas', 'draft' ] );
export type ChatKind = z.infer< typeof ChatKind >;

export const ChatMeta = z.object( {
	id: z.string().min( 1 ),
	kind: ChatKind,
	title: z.string().optional(),
	sessionId: z.string().nullable(),
	createdAt: z.number(),
	lastMessageAt: z.number().nullable(),
} );
export type ChatMeta = z.infer< typeof ChatMeta >;

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

export const Folder = z.object( {
	id: z.string().min( 1 ),
	path: z.string().min( 1 ),
	label: z.string().min( 1 ),
} );
export type Folder = z.infer< typeof Folder >;

export const PermissionResponse = z.object( {
	requestId: z.string().min( 1 ),
	folderId: z.string().min( 1 ),
	decision: z.enum( [ 'allow', 'deny' ] ),
	remember: z.boolean(),
} );
export type PermissionResponse = z.infer< typeof PermissionResponse >;

export const AgentEvent = z.discriminatedUnion( 'kind', [
	z.object( {
		kind: z.literal( 'init' ),
		folderId: z.string().min( 1 ),
		sessionId: z.string(),
	} ),
	z.object( {
		kind: z.literal( 'text-delta' ),
		folderId: z.string().min( 1 ),
		text: z.string(),
	} ),
	z.object( {
		kind: z.literal( 'tool-use-start' ),
		folderId: z.string().min( 1 ),
		toolUseId: z.string(),
		toolName: z.string(),
		input: z.unknown(),
	} ),
	z.object( {
		kind: z.literal( 'tool-result' ),
		folderId: z.string().min( 1 ),
		toolUseId: z.string(),
		output: z.string(),
		isError: z.boolean(),
	} ),
	z.object( {
		kind: z.literal( 'permission-request' ),
		folderId: z.string().min( 1 ),
		requestId: z.string(),
		toolName: z.string(),
		input: z.unknown(),
	} ),
	z.object( {
		kind: z.literal( 'result' ),
		folderId: z.string().min( 1 ),
		costUsd: z.number(),
		tokens: z.number(),
		durationMs: z.number(),
		numTurns: z.number(),
	} ),
	z.object( {
		kind: z.literal( 'done' ),
		folderId: z.string().min( 1 ),
		success: z.boolean(),
	} ),
	z.object( {
		kind: z.literal( 'error' ),
		folderId: z.string().min( 1 ),
		message: z.string(),
	} ),
] );
export type AgentEvent = z.infer< typeof AgentEvent >;
