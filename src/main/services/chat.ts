import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { getProject, listProjects } from './project';
import type {
	ChatKind,
	ChatMeta,
	PersistedMessage,
	RecentChat,
} from '../../types';

const STORE_DIR = '.creator-studio';
const CHATS_DIR = 'chats';
const META_FILE = 'chats.json';

export const DEFAULT_CHAT_ID = 'default';

type ChatsMetaFile = {
	chats: ChatMeta[];
};

function projectStoreDir( projectPath: string ): string {
	return path.join( projectPath, STORE_DIR );
}

function chatLogPath( projectPath: string, chatId: string ): string {
	return path.join(
		projectStoreDir( projectPath ),
		CHATS_DIR,
		`${ chatId }.jsonl`
	);
}

function metaPath( projectPath: string ): string {
	return path.join( projectStoreDir( projectPath ), META_FILE );
}

function ensureDir( dir: string ): void {
	fs.mkdirSync( dir, { recursive: true } );
}

function resolveProjectPath( projectId: string ): string | null {
	const project = getProject( projectId );
	return project?.path ?? null;
}

export function appendMessage(
	projectId: string,
	chatId: string,
	message: PersistedMessage
): void {
	const projectPath = resolveProjectPath( projectId );
	if ( ! projectPath ) {
		return;
	}
	const logPath = chatLogPath( projectPath, chatId );
	ensureDir( path.dirname( logPath ) );
	fs.appendFileSync( logPath, JSON.stringify( message ) + '\n', 'utf-8' );
	touchMeta( projectPath, chatId, { lastMessageAt: message.at } );
}

export function loadChat(
	projectId: string,
	chatId: string
): PersistedMessage[] {
	const projectPath = resolveProjectPath( projectId );
	if ( ! projectPath ) {
		return [];
	}
	const logPath = chatLogPath( projectPath, chatId );
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

function readMetaFile( projectPath: string ): ChatsMetaFile {
	const file = metaPath( projectPath );
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

function writeMetaFile( projectPath: string, data: ChatsMetaFile ): void {
	const file = metaPath( projectPath );
	ensureDir( path.dirname( file ) );
	fs.writeFileSync( file, JSON.stringify( data, null, 2 ), 'utf-8' );
}

function touchMeta(
	projectPath: string,
	chatId: string,
	patch: Partial<
		Pick< ChatMeta, 'sessionId' | 'lastMessageAt' | 'kind' | 'title' >
	>
): ChatMeta {
	const data = readMetaFile( projectPath );
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
	writeMetaFile( projectPath, data );
	return chat;
}

// Flat list of every chat across every linked project, newest activity first.
// Only includes chats the user has actually sent into (lastMessageAt set).
export function listRecentChats(): RecentChat[] {
	const out: RecentChat[] = [];
	for ( const project of listProjects() ) {
		const meta = readMetaFile( project.path );
		for ( const chat of meta.chats ) {
			if ( chat.lastMessageAt === null ) {
				continue;
			}
			out.push( {
				projectId: project.id,
				projectName: project.name,
				chat,
			} );
		}
	}
	out.sort(
		( a, b ) =>
			( b.chat.lastMessageAt ?? 0 ) - ( a.chat.lastMessageAt ?? 0 )
	);
	return out;
}

export function listChats( projectId: string ): ChatMeta[] {
	const projectPath = resolveProjectPath( projectId );
	if ( ! projectPath ) {
		return [];
	}
	const meta = readMetaFile( projectPath );
	return [ ...meta.chats ].sort( ( a, b ) => a.createdAt - b.createdAt );
}

export function createChat(
	projectId: string,
	options: { kind?: ChatKind; title?: string } = {}
): ChatMeta | null {
	const projectPath = resolveProjectPath( projectId );
	if ( ! projectPath ) {
		return null;
	}
	const chatId = randomUUID();
	return touchMeta( projectPath, chatId, {
		kind: options.kind ?? 'general',
		title: options.title,
	} );
}

export function getSessionId(
	projectId: string,
	chatId: string
): string | null {
	const projectPath = resolveProjectPath( projectId );
	if ( ! projectPath ) {
		return null;
	}
	const meta = readMetaFile( projectPath );
	return meta.chats.find( ( c ) => c.id === chatId )?.sessionId ?? null;
}

export function setSessionId(
	projectId: string,
	chatId: string,
	sessionId: string
): void {
	const projectPath = resolveProjectPath( projectId );
	if ( ! projectPath ) {
		return;
	}
	touchMeta( projectPath, chatId, { sessionId } );
}
