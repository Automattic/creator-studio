import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { getFolder } from './folderService';

const STORE_DIR = '.creator-studio';
const CHATS_DIR = 'chats';
const META_FILE = 'chats.json';

export const DEFAULT_CHAT_ID = 'default';

export type ChatKind = 'general' | 'ideas' | 'draft';

export type ChatMeta = {
	id: string;
	kind: ChatKind;
	title?: string;
	sessionId: string | null;
	createdAt: number;
	lastMessageAt: number | null;
};

export type PersistedUser = {
	kind: 'user';
	id: string;
	text: string;
	at: number;
};

export type PersistedAssistant = {
	kind: 'assistant';
	id: string;
	text: string;
	errored?: boolean;
	at: number;
};

export type PersistedTool = {
	kind: 'tool';
	id: string;
	toolUseId: string;
	toolName: string;
	input: unknown;
	status: 'done' | 'error';
	output?: string;
	at: number;
};

export type PersistedMessage =
	| PersistedUser
	| PersistedAssistant
	| PersistedTool;

type ChatsMetaFile = {
	chats: ChatMeta[];
};

function folderStoreDir( folderPath: string ): string {
	return path.join( folderPath, STORE_DIR );
}

function chatLogPath( folderPath: string, chatId: string ): string {
	return path.join(
		folderStoreDir( folderPath ),
		CHATS_DIR,
		`${ chatId }.jsonl`
	);
}

function metaPath( folderPath: string ): string {
	return path.join( folderStoreDir( folderPath ), META_FILE );
}

function ensureDir( dir: string ): void {
	fs.mkdirSync( dir, { recursive: true } );
}

function resolveFolderPath( folderId: string ): string | null {
	const folder = getFolder( folderId );
	return folder?.path ?? null;
}

export function appendMessage(
	folderId: string,
	chatId: string,
	message: PersistedMessage
): void {
	const folderPath = resolveFolderPath( folderId );
	if ( ! folderPath ) {
		return;
	}
	const logPath = chatLogPath( folderPath, chatId );
	ensureDir( path.dirname( logPath ) );
	fs.appendFileSync( logPath, JSON.stringify( message ) + '\n', 'utf-8' );
	touchMeta( folderPath, chatId, { lastMessageAt: message.at } );
}

export function loadChat(
	folderId: string,
	chatId: string
): PersistedMessage[] {
	const folderPath = resolveFolderPath( folderId );
	if ( ! folderPath ) {
		return [];
	}
	const logPath = chatLogPath( folderPath, chatId );
	if ( ! fs.existsSync( logPath ) ) {
		return [];
	}
	const raw = fs.readFileSync( logPath, 'utf-8' );
	const lines = raw.split( /\r?\n/ ).filter( ( line ) => line.length > 0 );
	const messages: PersistedMessage[] = [];
	for ( const line of lines ) {
		try {
			messages.push( JSON.parse( line ) as PersistedMessage );
		} catch {
			// Skip malformed line; keep going.
		}
	}
	return messages;
}

function readMetaFile( folderPath: string ): ChatsMetaFile {
	const file = metaPath( folderPath );
	if ( ! fs.existsSync( file ) ) {
		return { chats: [] };
	}
	try {
		const parsed = JSON.parse( fs.readFileSync( file, 'utf-8' ) ) as {
			chats?: Array< Partial< ChatMeta > & { id: string } >;
		};
		if ( ! Array.isArray( parsed.chats ) ) {
			return { chats: [] };
		}
		// Normalize legacy entries that predate `kind`.
		const chats: ChatMeta[] = parsed.chats.map( ( c ) => ( {
			id: c.id,
			kind: c.kind ?? 'general',
			title: c.title,
			sessionId: c.sessionId ?? null,
			createdAt: c.createdAt ?? 0,
			lastMessageAt: c.lastMessageAt ?? null,
		} ) );
		return { chats };
	} catch {
		return { chats: [] };
	}
}

function writeMetaFile( folderPath: string, data: ChatsMetaFile ): void {
	const file = metaPath( folderPath );
	ensureDir( path.dirname( file ) );
	fs.writeFileSync( file, JSON.stringify( data, null, 2 ), 'utf-8' );
}

function touchMeta(
	folderPath: string,
	chatId: string,
	patch: Partial<
		Pick< ChatMeta, 'sessionId' | 'lastMessageAt' | 'kind' | 'title' >
	>
): ChatMeta {
	const data = readMetaFile( folderPath );
	let chat = data.chats.find( ( c ) => c.id === chatId );
	const now = Date.now();
	if ( ! chat ) {
		chat = {
			id: chatId,
			kind: patch.kind ?? 'general',
			title: patch.title,
			sessionId: null,
			createdAt: now,
			lastMessageAt: null,
		};
		data.chats.push( chat );
	} else {
		if ( patch.kind !== undefined ) {
			chat.kind = patch.kind;
		}
		if ( patch.title !== undefined ) {
			chat.title = patch.title;
		}
	}
	if ( patch.sessionId !== undefined ) {
		chat.sessionId = patch.sessionId;
	}
	if ( patch.lastMessageAt !== undefined ) {
		chat.lastMessageAt = patch.lastMessageAt;
	}
	writeMetaFile( folderPath, data );
	return chat;
}

export function listChats( folderId: string ): ChatMeta[] {
	const folderPath = resolveFolderPath( folderId );
	if ( ! folderPath ) {
		return [];
	}
	const meta = readMetaFile( folderPath );
	return [ ...meta.chats ].sort( ( a, b ) => a.createdAt - b.createdAt );
}

export function createChat(
	folderId: string,
	options: { kind?: ChatKind; title?: string } = {}
): ChatMeta | null {
	const folderPath = resolveFolderPath( folderId );
	if ( ! folderPath ) {
		return null;
	}
	const chatId = randomUUID();
	return touchMeta( folderPath, chatId, {
		kind: options.kind ?? 'general',
		title: options.title,
	} );
}

export function getSessionId(
	folderId: string,
	chatId: string
): string | null {
	const folderPath = resolveFolderPath( folderId );
	if ( ! folderPath ) {
		return null;
	}
	const meta = readMetaFile( folderPath );
	return meta.chats.find( ( c ) => c.id === chatId )?.sessionId ?? null;
}

export function setSessionId(
	folderId: string,
	chatId: string,
	sessionId: string
): void {
	const folderPath = resolveFolderPath( folderId );
	if ( ! folderPath ) {
		return;
	}
	touchMeta( folderPath, chatId, { sessionId } );
}
