import { z } from 'zod';

export const IpcChannels = {
	send: 'chat:send',
	event: 'chat:event',
} as const;

export const SendRequest = z.object( {
	prompt: z.string().min( 1 ),
} );
export type SendRequest = z.infer< typeof SendRequest >;

export const AgentEvent = z.discriminatedUnion( 'kind', [
	z.object( { kind: z.literal( 'init' ), sessionId: z.string() } ),
	z.object( { kind: z.literal( 'text-delta' ), text: z.string() } ),
	z.object( { kind: z.literal( 'tool-use' ), toolName: z.string() } ),
	z.object( { kind: z.literal( 'done' ), success: z.boolean() } ),
	z.object( { kind: z.literal( 'error' ), message: z.string() } ),
] );
export type AgentEvent = z.infer< typeof AgentEvent >;
