import { z } from 'zod';

export const IpcChannels = {
	send: 'chat:send',
	event: 'chat:event',
	permissionRespond: 'permission:respond',
	foldersList: 'folders:list',
	foldersAdd: 'folders:add',
	foldersRemove: 'folders:remove',
} as const;

export const Folder = z.object( {
	id: z.string().min( 1 ),
	path: z.string().min( 1 ),
	label: z.string().min( 1 ),
} );
export type Folder = z.infer< typeof Folder >;

export const FoldersRemoveRequest = z.object( {
	id: z.string().min( 1 ),
} );
export type FoldersRemoveRequest = z.infer< typeof FoldersRemoveRequest >;

export const SendRequest = z.object( {
	prompt: z.string().min( 1 ),
} );
export type SendRequest = z.infer< typeof SendRequest >;

export const PermissionResponse = z.object( {
	requestId: z.string().min( 1 ),
	decision: z.enum( [ 'allow', 'deny' ] ),
	remember: z.boolean(),
} );
export type PermissionResponse = z.infer< typeof PermissionResponse >;

export const AgentEvent = z.discriminatedUnion( 'kind', [
	z.object( { kind: z.literal( 'init' ), sessionId: z.string() } ),
	z.object( { kind: z.literal( 'text-delta' ), text: z.string() } ),
	z.object( {
		kind: z.literal( 'tool-use-start' ),
		toolUseId: z.string(),
		toolName: z.string(),
		input: z.unknown(),
	} ),
	z.object( {
		kind: z.literal( 'tool-result' ),
		toolUseId: z.string(),
		output: z.string(),
		isError: z.boolean(),
	} ),
	z.object( {
		kind: z.literal( 'permission-request' ),
		requestId: z.string(),
		toolName: z.string(),
		input: z.unknown(),
	} ),
	z.object( {
		kind: z.literal( 'result' ),
		costUsd: z.number(),
		tokens: z.number(),
		durationMs: z.number(),
		numTurns: z.number(),
	} ),
	z.object( { kind: z.literal( 'done' ), success: z.boolean() } ),
	z.object( { kind: z.literal( 'error' ), message: z.string() } ),
] );
export type AgentEvent = z.infer< typeof AgentEvent >;
