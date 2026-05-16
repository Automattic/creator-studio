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
	resourcePath: z.string().min( 1 ),
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

export type ProjectCreateNewResult =
	| { status: 'ok'; project: Project }
	| { status: 'target-exists'; targetPath: string }
	| { status: 'io-error'; message: string };

export const DirEntry = z.object( {
	name: z.string(),
	isDirectory: z.boolean(),
	mtime: z.number().optional(),
	// Frontmatter `title:` for `.md` files. Only set when present — never
	// echoes the filename, so the renderer can fall back to `name`.
	title: z.string().optional(),
	// First non-frontmatter paragraph for `.md` files (truncated). Undefined
	// for folders, non-markdown files, and unreadable entries.
	excerpt: z.string().optional(),
	// Project-relative path to a cached thumbnail (e.g. PDF page-1 render).
	// Set only when the thumb file exists on disk; missing or failed-to-
	// generate entries omit it. Renderer composes the URL via
	// `studio-asset://<projectId>/<thumbPath>`.
	thumbPath: z.string().optional(),
	// When a `.md` file wraps a URL clipping (frontmatter `source:`/`url:`
	// or the first http(s) URL in the body), the main process records the
	// originating host so the renderer can show a branded chip even before
	// the og:image lands. `clippingKind` is set to `'youtube'` for YouTube
	// hosts so cards can overlay a play-triangle.
	clippingHost: z.string().optional(),
	clippingKind: z.enum( [ 'youtube', 'web' ] ).optional(),
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
	groupKey: 'sources' | 'drafts' | 'done' | 'checks';
	parts: string[];
};

// View state of the resources panel, kept per project in App. Survives the
// preview round-trip; not persisted across sessions.
export type ResourcesViewState = {
	query: string;
	drill: Drill | null;
	scrollTop: number;
};

// The resource the user is currently looking at. Derived in App from
// `editingDraft` (when the full draft editor is mounted) or
// `previewedFileByProject[activeProjectId]` (when previewing in the
// resources panel). Threaded down so the chat composer can silently
// attach it on send — so prompts like "expand this draft" target the
// file on screen without the user staging it.
export type OpenResource = {
	folder: 'sources' | 'drafts' | 'done' | 'checks';
	relPath: string;
	name: string;
};

// Where the user is when no file is open. Derived in App from the
// active screen and the resources panel's drill state. Threaded into
// the chat composer so prompts like "what's in this folder?" reach the
// agent with a concrete location. Only consulted when `OpenResource`
// is null — a file's path already conveys its folder.
export type CurrentView =
	| { kind: 'project-home' }
	| {
			kind: 'folder';
			folder: 'sources' | 'drafts' | 'done' | 'checks';
			subPath: string;
	  };

export const DraftSidebarTab = z.enum( [
	'chat',
	'checks',
	'outline',
	'share',
] );
export type DraftSidebarTab = z.infer< typeof DraftSidebarTab >;

// One actionable suggestion produced by a check. Offsets are CodeMirror
// document positions resolved against the body that was sent to the model;
// the renderer's `applyAnnotation` path maps them through subsequent edits
// (Apply) and any unrelated edit clears all issues outright.
// `checkRelPath` is the stable identifier (a project-relative path into
// `checks/`) used for grouping internally; `checkTitle` is the display
// label captured at dispatch time so a mid-run title edit doesn't reshuffle
// the rendered results.
export const DraftCheckIssue = z.object( {
	id: z.string(),
	checkRelPath: z.string().min( 1 ),
	checkTitle: z.string(),
	from: z.number().int().nonnegative(),
	to: z.number().int().nonnegative(),
	original: z.string().min( 1 ),
	replacement: z.string(),
	message: z.string(),
} );
export type DraftCheckIssue = z.infer< typeof DraftCheckIssue >;

// One entry per enabled check, even when the model errored or returned
// nothing — keeps the renderer's per-check error rows trivial.
export const DraftCheckResult = z.object( {
	checkRelPath: z.string().min( 1 ),
	checkTitle: z.string(),
	issues: z.array( DraftCheckIssue ),
	error: z.string().nullable(),
} );
export type DraftCheckResult = z.infer< typeof DraftCheckResult >;

// Per-file metadata for the checks panel and resources grid. Body content
// is intentionally not included — only the InlineFileEditor pulls that, via
// `checks:read`. `parseError` lets the UI surface "invalid frontmatter" on a
// row without aborting the listing.
//
// `order` is an optional sort key — bundled defaults ship with explicit
// values (10, 20, 30, …) so foundation/source checks list in a fixed
// sequence; user-created checks omit it and sort alphabetically after.
export const DraftCheckMeta = z.object( {
	relPath: z.string().min( 1 ),
	title: z.string(),
	enabled: z.boolean(),
	order: z.number().nullable(),
	mtime: z.number(),
	parseError: z.string().nullable(),
	// True when the check's frontmatter has `voice: true`. The check runner
	// uses this to swap in voice-specific prompt scaffolding (only flag clear
	// mismatches; bail when the body is empty or a placeholder).
	voice: z.boolean(),
} );
export type DraftCheckMeta = z.infer< typeof DraftCheckMeta >;

export const AuthMode = z.enum( [ 'api-key', 'claude-code' ] );
export type AuthMode = z.infer< typeof AuthMode >;

export const ClaudeAuthStatus = z.object( {
	signedIn: z.boolean(),
	email: z.string().optional(),
	// 'pro' | 'max' | 'team' | 'enterprise' as seen so far. Kept open so a
	// new subscription tier from upstream doesn't fail validation.
	subscriptionType: z.string().optional(),
	// 'claude.ai' | 'console' | 'apiKey'. We expose this so the renderer can
	// distinguish a subscription account from a console (API-key-backed)
	// account, which changes the copy in Settings.
	authMethod: z.string().optional(),
	orgName: z.string().optional(),
} );
export type ClaudeAuthStatus = z.infer< typeof ClaudeAuthStatus >;

export const UiPrefs = z.object( {
	resourcesPanelOpen: z.boolean(),
	// Per-project list of chat IDs the user closed in a previous session.
	// Persisted so opening a project restores the same set of open tabs
	// instead of revealing every chat that was ever started.
	closedChatIdsByProject: z.record( z.string(), z.array( z.string() ) ),
	draftSidebarOpen: z.boolean(),
	draftSidebarTab: DraftSidebarTab,
	// Unset until the first-launch resolver picks 'claude-code' (when the
	// user is already signed in via Claude Code) or 'api-key' (default).
	authMode: AuthMode.optional(),
} );
export type UiPrefs = z.infer< typeof UiPrefs >;

export const Settings = z.object( {
	anthropicApiKey: z.string(),
	authMode: AuthMode,
} );
export type Settings = z.infer< typeof Settings >;

// One connected WordPress site. Self-hosted sites use REST + an
// application password (Basic-auth header `username:appPassword`).
// WordPress.com sites use OAuth — `wpcomBlogId` identifies which blog
// the token's `global` scope is bound to, since REST calls go through
// `/wp/v2/sites/<blogId>/...` rather than the site origin.
//
// The secret itself never leaves the main process. The renderer-facing
// projection (`WordpressConnectionPublic`) strips both `secretCipher`
// and `username` so the renderer can list connections without ever
// holding the credential.
export const WordpressConnectionKind = z.enum( [
	'app-password',
	'wpcom-oauth',
] );
export type WordpressConnectionKind = z.infer< typeof WordpressConnectionKind >;

export const WordpressConnection = z.object( {
	id: z.string().min( 1 ),
	label: z.string().min( 1 ),
	siteUrl: z.string().min( 1 ),
	kind: WordpressConnectionKind,
	username: z.string().optional(),
	// base64 of safeStorage.encryptString(rawSecret). When safeStorage
	// isn't available (rare; logged on first write), holds the raw
	// secret prefixed with `plain:` so we can detect it and warn.
	secretCipher: z.string().min( 1 ),
	wpcomBlogId: z.number().int().positive().optional(),
	createdAt: z.number(),
} );
export type WordpressConnection = z.infer< typeof WordpressConnection >;

export const WordpressConnectionPublic = z.object( {
	id: z.string().min( 1 ),
	label: z.string().min( 1 ),
	siteUrl: z.string().min( 1 ),
	kind: WordpressConnectionKind,
	username: z.string().optional(),
	wpcomBlogId: z.number().int().positive().optional(),
	createdAt: z.number(),
} );
export type WordpressConnectionPublic = z.infer<
	typeof WordpressConnectionPublic
>;

// Emitted by `wordpress:importProject` while it pulls posts. `total`
// is null during the initial fetch (we don't know the page count yet);
// once writing starts it's the concrete number of posts the import
// will write. `phase: 'done'` is sent once at the end as a UX hint —
// the channel resolves with the created `Project` independently.
export const WordpressImportProgress = z.object( {
	importId: z.string().min( 1 ),
	phase: z.enum( [ 'fetching', 'writing', 'done' ] ),
	current: z.number().int().nonnegative(),
	total: z.number().int().nonnegative().nullable(),
} );
export type WordpressImportProgress = z.infer< typeof WordpressImportProgress >;

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

// Push event when a watched note / draft file changes on disk. mtime is null
// when the file was deleted between events (rare, but the watcher debounces
// and reads stat after the fact, so we surface it explicitly rather than dropping).
export const NoteFileChanged = z.object( {
	projectId: z.string().min( 1 ),
	relPath: z.string().min( 1 ),
	mtime: z.number().nullable(),
} );
export type NoteFileChanged = z.infer< typeof NoteFileChanged >;

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
		code: z
			.enum( [
				'invalid_api_key',
				'claude_code_signed_out',
				'claude_code_subscription_invalid',
			] )
			.optional(),
	} ),
	z.object( {
		kind: z.literal( 'chat-title' ),
		projectId: z.string().min( 1 ),
		chatId: z.string().min( 1 ),
		title: z.string(),
	} ),
] );
export type AgentEvent = z.infer< typeof AgentEvent >;
