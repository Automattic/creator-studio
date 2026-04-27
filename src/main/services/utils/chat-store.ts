import fs from 'node:fs';
import path from 'node:path';

import { getProject } from '../project-get';
import type { ChatMeta } from '../../../types';

const STORE_DIR = '.creator-studio';
const CHATS_DIR = 'chats';
const META_FILE = 'chats.json';

export const DEFAULT_CHAT_ID = 'default';

type ChatsMetaFile = { chats: ChatMeta[] };

function projectStoreDir( projectPath: string ): string {
	return path.join( projectPath, STORE_DIR );
}

export function chatLogPath( projectPath: string, chatId: string ): string {
	return path.join(
		projectStoreDir( projectPath ),
		CHATS_DIR,
		`${ chatId }.jsonl`
	);
}

function metaPath( projectPath: string ): string {
	return path.join( projectStoreDir( projectPath ), META_FILE );
}

export function ensureDir( dir: string ): void {
	fs.mkdirSync( dir, { recursive: true } );
}

export function resolveProjectPath( projectId: string ): string | null {
	const project = getProject( projectId );
	return project?.path ?? null;
}

export function readMetaFile( projectPath: string ): ChatsMetaFile {
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

export function touchMeta(
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
