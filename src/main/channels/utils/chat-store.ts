import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { getProject } from './project-get';
import type { ChatMeta } from '../../../types';

const STORE_DIR = '.studio-write';
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
		const chats: ChatMeta[] = parsed.chats.map( ( c ) => ( {
			id: c.id,
			title: c.title,
			sessionId: c.sessionId ?? null,
			createdAt: c.createdAt ?? 0,
			lastMessageAt: c.lastMessageAt ?? null,
			draftRelPath: c.draftRelPath,
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

export function removeChat( projectPath: string, chatId: string ): boolean {
	const data = readMetaFile( projectPath );
	const next = data.chats.filter( ( c ) => c.id !== chatId );
	const removed = next.length !== data.chats.length;
	if ( removed ) {
		writeMetaFile( projectPath, { chats: next } );
	}
	const log = chatLogPath( projectPath, chatId );
	if ( fs.existsSync( log ) ) {
		fs.rmSync( log, { force: true } );
	}
	return removed;
}

export function touchMeta(
	projectPath: string,
	chatId: string,
	patch: Partial<
		Pick<
			ChatMeta,
			'sessionId' | 'lastMessageAt' | 'title' | 'draftRelPath'
		>
	>
): ChatMeta {
	const data = readMetaFile( projectPath );
	let chat = data.chats.find( ( c ) => c.id === chatId );
	const now = Date.now();
	if ( ! chat ) {
		chat = {
			id: chatId,
			title: patch.title,
			sessionId: null,
			createdAt: now,
			lastMessageAt: null,
			draftRelPath: patch.draftRelPath,
		};
		data.chats.push( chat );
	} else if ( patch.title !== undefined ) {
		chat.title = patch.title;
	}
	if ( patch.sessionId !== undefined ) {
		chat.sessionId = patch.sessionId;
	}
	if ( patch.lastMessageAt !== undefined ) {
		chat.lastMessageAt = patch.lastMessageAt;
	}
	if ( patch.draftRelPath !== undefined ) {
		chat.draftRelPath = patch.draftRelPath;
	}
	writeMetaFile( projectPath, data );
	return chat;
}

// True for project chats — i.e. chats not bound to a specific draft. Used by
// chats:list / chats:recent to keep draft-editor chats out of the project
// sidebar.
export function isProjectChat( chat: ChatMeta ): boolean {
	return ! chat.draftRelPath;
}

// Chats associated with a specific draft, sorted by createdAt. The data
// model supports many chats per draft; the current draft-editor UI only
// surfaces one (see ensureDraftChat).
export function listDraftChats(
	projectPath: string,
	draftRelPath: string
): ChatMeta[] {
	const meta = readMetaFile( projectPath );
	return meta.chats
		.filter( ( c ) => c.draftRelPath === draftRelPath )
		.sort( ( a, b ) => a.createdAt - b.createdAt );
}

// Returns the most-recent draft chat for the given draft, creating one if
// none exists. The returned chat always has draftRelPath set.
export function ensureDraftChat(
	projectPath: string,
	draftRelPath: string
): ChatMeta {
	const existing = listDraftChats( projectPath, draftRelPath );
	if ( existing.length > 0 ) {
		return existing[ existing.length - 1 ];
	}
	const id = randomUUID();
	return touchMeta( projectPath, id, { draftRelPath } );
}
