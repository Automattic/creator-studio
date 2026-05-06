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

// Re-anchors every reference to a draft path so renaming the file on disk
// doesn't dangle attached chats. Touches two surfaces:
//   1. chats.json — chats whose draftRelPath matches get retargeted.
//   2. <chatId>.jsonl — each user message's DraftAttachment[] is scanned and
//      any entry pointing at the old path (folder: 'drafts') is updated.
//      We rewrite history because attachments are pointers to "the draft",
//      not snapshots of "the draft as it was at this point in time" — the
//      same file just lives at a new path now.
// No-op when oldRelPath === newRelPath.
export function remapDraftRelPath(
	projectPath: string,
	oldRelPath: string,
	newRelPath: string
): void {
	if ( oldRelPath === newRelPath ) {
		return;
	}
	const data = readMetaFile( projectPath );
	let metaChanged = false;
	for ( const chat of data.chats ) {
		if ( chat.draftRelPath === oldRelPath ) {
			chat.draftRelPath = newRelPath;
			metaChanged = true;
		}
	}
	if ( metaChanged ) {
		writeMetaFile( projectPath, data );
	}
	// Walk every chat log and rewrite matching DraftAttachment entries.
	// Project chats (no draftRelPath) can still have attached this draft as
	// context in past messages, so we can't restrict the scan to draft chats.
	const chatsDir = path.join( projectStoreDir( projectPath ), CHATS_DIR );
	if ( ! fs.existsSync( chatsDir ) ) {
		return;
	}
	let entries: string[];
	try {
		entries = fs.readdirSync( chatsDir );
	} catch {
		return;
	}
	for ( const entry of entries ) {
		if ( ! entry.endsWith( '.jsonl' ) ) {
			continue;
		}
		const file = path.join( chatsDir, entry );
		rewriteAttachmentsInLog( file, oldRelPath, newRelPath );
	}
}

// In-place rewrite of a chat .jsonl file: any user message whose attachments
// contain a DraftAttachment with folder='drafts' (the default for entries
// missing the field) and relPath === oldRelPath is updated to newRelPath.
// Lines that don't parse as JSON are passed through unchanged.
function rewriteAttachmentsInLog(
	file: string,
	oldRelPath: string,
	newRelPath: string
): void {
	let raw: string;
	try {
		raw = fs.readFileSync( file, 'utf-8' );
	} catch {
		return;
	}
	const lines = raw.split( /\r?\n/ );
	let changed = false;
	const out: string[] = [];
	for ( const line of lines ) {
		if ( line.length === 0 ) {
			out.push( line );
			continue;
		}
		let obj: unknown;
		try {
			obj = JSON.parse( line );
		} catch {
			out.push( line );
			continue;
		}
		if ( ! obj || typeof obj !== 'object' ) {
			out.push( line );
			continue;
		}
		const record = obj as Record< string, unknown >;
		if ( record.kind !== 'user' || ! Array.isArray( record.attachments ) ) {
			out.push( line );
			continue;
		}
		let lineChanged = false;
		const nextAttachments = ( record.attachments as unknown[] ).map(
			( att ) => {
				if ( ! att || typeof att !== 'object' ) {
					return att;
				}
				const a = att as Record< string, unknown >;
				const folder = a.folder ?? 'drafts';
				if (
					a.kind === 'draft' &&
					folder === 'drafts' &&
					a.relPath === oldRelPath
				) {
					lineChanged = true;
					return { ...a, relPath: newRelPath };
				}
				return att;
			}
		);
		if ( lineChanged ) {
			record.attachments = nextAttachments;
			changed = true;
			out.push( JSON.stringify( record ) );
		} else {
			out.push( line );
		}
	}
	if ( changed ) {
		fs.writeFileSync( file, out.join( '\n' ), 'utf-8' );
	}
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
