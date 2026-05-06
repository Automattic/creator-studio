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

// Prompts have one entry per starter chat action exposed in the empty-state
// or "+" menu. Contextual flows (e.g. attaching a draft to the composer)
// build their text in-renderer rather than going through this lookup.
export const PROMPT_NAMES = [ ...CHAT_ACTION_IDS ] as const;
export const PromptName = z.enum( PROMPT_NAMES );
export type PromptName = z.infer< typeof PromptName >;

// URL kinds the "Import URL" flow can route to. Adding a new kind is one
// branch in the classifier (src/main/channels/utils/url-classifier.ts) plus
// a `resources/prompts/import-url/<kind>.md` file. The classifier always
// resolves something — `website` is the catch-all fallback — so callers
// don't need to handle "unknown".
export const UrlImportKind = z.enum( [ 'youtube', 'tweet', 'website' ] );
export type UrlImportKind = z.infer< typeof UrlImportKind >;

export const ResolvedUrlImport = z.object( {
	kind: UrlImportKind,
	normalizedUrl: z.string().min( 1 ),
	chatTitle: z.string().min( 1 ),
	prompt: z.string().min( 1 ),
} );
export type ResolvedUrlImport = z.infer< typeof ResolvedUrlImport >;

export const ChatMeta = z.object( {
	id: z.string().min( 1 ),
	title: z.string().optional(),
	sessionId: z.string().nullable(),
	createdAt: z.number(),
	lastMessageAt: z.number().nullable(),
	// POSIX-relative path of the draft this chat belongs to. Present only on
	// draft chats, which have their own composer in the draft editor sidebar
	// and are deliberately hidden from the project chat list.
	draftRelPath: z.string().min( 1 ).optional(),
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

// Optional reference attached to a user message. `folder` carries which
// resource folder the file lives in (sources/drafts/done) — older
// records (pre-multi-folder support) lacked the field and are read as
// `drafts` via the zod default. `mtime` is snapshotted at attach time so
// the bubble keeps showing "the file as it was when I attached it" even if
// the file is edited later in the conversation.
export const DraftAttachment = z.object( {
	kind: z.literal( 'draft' ),
	folder: z.enum( [ 'sources', 'drafts', 'done' ] ).default( 'drafts' ),
	relPath: z.string().min( 1 ),
	name: z.string().min( 1 ),
	mtime: z.number().nullable(),
} );
export type DraftAttachment = z.infer< typeof DraftAttachment >;

// Selections attached to a user message via the editor toolbar's
// "Add to chat" button. Persisted alongside the message so future
// features (assistant referencing prior selections, range-aware UI)
// have the original ranges, not just a count.
export const MessageSelection = z.object( {
	text: z.string(),
	fromLine: z.number().int().positive(),
	toLine: z.number().int().positive(),
} );
export type MessageSelection = z.infer< typeof MessageSelection >;

// `attachments` is the canonical multi-file shape. Older records persisted a
// single `attachment` field (pre-multi-attachment support) — the preprocess
// folds that into the array so historical chats still load.
const PersistedUser = z.preprocess(
	( raw ) => {
		if ( raw && typeof raw === 'object' && ! Array.isArray( raw ) ) {
			const obj = raw as Record< string, unknown >;
			if ( ! ( 'attachments' in obj ) && 'attachment' in obj ) {
				const { attachment, ...rest } = obj;
				return {
					...rest,
					attachments: attachment ? [ attachment ] : [],
				};
			}
		}
		return raw;
	},
	z.object( {
		kind: z.literal( 'user' ),
		id: z.string(),
		text: z.string(),
		attachments: z.array( DraftAttachment ).default( [] ),
		selections: z.array( MessageSelection ).default( [] ),
		at: z.number(),
	} )
);
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
	// First non-frontmatter paragraph for `.md` files (truncated). Undefined
	// for folders, non-markdown files, and unreadable entries.
	excerpt: z.string().optional(),
	// Project-relative path to a cached thumbnail (e.g. PDF page-1 render).
	// Set only when the thumb file exists on disk; missing or failed-to-
	// generate entries omit it. Renderer composes the URL via
	// `studio-asset://<projectId>/<thumbPath>`.
	thumbPath: z.string().optional(),
	// Folder-only summary fields. `entryCount` is the number of non-hidden
	// children one level deep; `latestChildMtime` is the max mtime among
	// those children (so the parent card can display "2d ago" the same way
	// a file card does). `childThumbPaths` carries up to 3 project-relative
	// asset paths — image files use their own path, PDFs/videos use a
	// cached thumb under `.studio-write/thumbs/` — newest first.
	// `childTextTiles` is the markdown-only fallback: the most recent
	// markdown files' titles + excerpts, used when no image/PDF/video tile
	// is available so the card still has a visual signature.
	entryCount: z.number().optional(),
	latestChildMtime: z.number().optional(),
	childThumbPaths: z.array( z.string() ).optional(),
	childTextTiles: z
		.array(
			z.object( {
				title: z.string(),
				excerpt: z.string().optional(),
			} )
		)
		.optional(),
} );
export type DirEntry = z.infer< typeof DirEntry >;
export type FolderTextTile = NonNullable< DirEntry[ 'childTextTiles' ] >[ 0 ];

export const SearchHit = z.object( {
	folder: z.string(),
	relPath: z.string(),
	name: z.string(),
	isDirectory: z.boolean(),
	mtime: z.number().optional(),
	excerpt: z.string().optional(),
	thumbPath: z.string().optional(),
} );
export type SearchHit = z.infer< typeof SearchHit >;

// Folder the resources panel is currently drilled into. `parts` is the path
// inside that folder (empty array means "show the group's root"). Lifted out
// of `ResourcesGrid` so App can keep the drill path alive across the
// preview round-trip.
export type Drill = {
	groupKey: 'sources' | 'drafts' | 'done';
	parts: string[];
};

// View state of the resources panel, kept per project in App. Survives the
// preview round-trip; not persisted across sessions.
export type ResourcesViewState = {
	query: string;
	drill: Drill | null;
	scrollTop: number;
};

export const DraftSidebarTab = z.enum( [
	'chat',
	'checks',
	'outline',
	'same-project',
	'share',
] );
export type DraftSidebarTab = z.infer< typeof DraftSidebarTab >;

export const UiPrefs = z.object( {
	resourcesPanelOpen: z.boolean(),
	// Per-project list of chat IDs the user closed in a previous session.
	// Persisted so opening a project restores the same set of open tabs
	// instead of revealing every chat that was ever started.
	closedChatIdsByProject: z.record( z.string(), z.array( z.string() ) ),
	draftSidebarOpen: z.boolean(),
	draftSidebarTab: DraftSidebarTab,
} );
export type UiPrefs = z.infer< typeof UiPrefs >;

export const Settings = z.object( {
	anthropicApiKey: z.string(),
} );
export type Settings = z.infer< typeof Settings >;

export const ResourcesSort = z.enum( [
	'recent',
	'oldest',
	'name-asc',
	'name-desc',
] );
export type ResourcesSort = z.infer< typeof ResourcesSort >;

export const ResourcesShowFilter = z.object( {
	folders: z.boolean(),
	text: z.boolean(),
	images: z.boolean(),
	pdf: z.boolean(),
	video: z.boolean(),
	other: z.boolean(),
} );
export type ResourcesShowFilter = z.infer< typeof ResourcesShowFilter >;

// Per-project UI state persisted at <project>/.studio-write/ui-prefs.json.
// Distinct from window-level `UiPrefs` because the values follow the project
// (e.g. which resource sections the user collapsed in this workspace).
export const ProjectUiPrefs = z.object( {
	resourcesCollapsed: z.record( z.string(), z.boolean() ),
	resourcesSort: ResourcesSort,
	resourcesShow: ResourcesShowFilter,
} );
export type ProjectUiPrefs = z.infer< typeof ProjectUiPrefs >;

export const PermissionResponse = z.object( {
	requestId: z.string().min( 1 ),
	projectId: z.string().min( 1 ),
	decision: z.enum( [ 'allow', 'deny' ] ),
	remember: z.boolean(),
} );
export type PermissionResponse = z.infer< typeof PermissionResponse >;

// Push event when a watched draft file changes on disk. mtime is null when
// the file was deleted between events (rare, but the watcher debounces and
// reads stat after the fact, so we surface it explicitly rather than dropping).
export const DraftFileChanged = z.object( {
	projectId: z.string().min( 1 ),
	relPath: z.string().min( 1 ),
	mtime: z.number().nullable(),
} );
export type DraftFileChanged = z.infer< typeof DraftFileChanged >;

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
		// Optional machine-readable tag so the renderer can attach a
		// targeted affordance (e.g. an "Open Settings" link for auth errors).
		code: z.enum( [ 'invalid_api_key' ] ).optional(),
	} ),
	z.object( {
		kind: z.literal( 'chat-title' ),
		projectId: z.string().min( 1 ),
		chatId: z.string().min( 1 ),
		title: z.string(),
	} ),
] );
export type AgentEvent = z.infer< typeof AgentEvent >;
