/**
 * Renderer → main IPC handler registration.
 *
 * Channels (invoke + push) and any schemas exclusive to a single channel
 * live in src/main/channels/<name>.ts via `defineChannel` / `defineEvent`.
 * Helpers shared by more than one channel live in src/main/channels/utils/.
 * Channel-name strings live in `channels/index.ts` (a leaf module the
 * preload bundle imports directly, so the main-process module graph
 * stays out of the sandboxed preload).
 *
 * Cross-process domain types live in src/types.ts.
 *
 * Naming: `domain:action` — four entity prefixes:
 *   - `project:` / `projects:` — linked workspace records (CRUD; plural for list)
 *   - `chat:` / `chats:`       — persisted conversation records on disk
 *   - `agent:`                 — Claude Agent SDK runtime: send, event stream,
 *                                permission gating
 *   - `prompt:`                — bundled starter prompts with `{{project}}`
 *                                substitution
 * Singular for single-record actions (`chat:create`, `project:remove`),
 * plural for list actions (`chats:list`, `projects:list`). Mirror this on
 * the renderer side: `window.api.agent.send`, `window.api.chat.create`,
 * `window.api.chats.list`, etc.
 *
 * Adding a channel:
 *   1. Add the wire name to `IpcChannels` in `channels/names.ts`.
 *   2. Create src/main/channels/<name>.ts that exports a `defineChannel`
 *      object with `name: IpcChannels.<key>` (see channels/utils/define-channel.ts).
 *   3. Import it here and add it to the `channels` array.
 *   4. Expose it on `window.api` in src/preload/preload.ts using IpcChannels.*.
 *
 * `registerIpcHandlers` iterates the array once and binds each channel — no
 * per-channel `ipcMain.handle` lines to maintain.
 *
 * Push channels (main → renderer via webContents.send, e.g. `agent:onEvent`)
 * also live under `channels/` but use `defineEvent` instead of `defineChannel`,
 * and are imported directly by their producer (e.g. AgentService) rather than
 * registered here — they have no router-side wiring.
 */

import { ipcMain } from 'electron';

import { agentCancel } from './channels/agent-cancel';
import { agentRespondPermission } from './channels/agent-respond-permission';
import { agentSend } from './channels/agent-send';
import { authLogout } from './channels/auth-logout';
import { authStartLogin } from './channels/auth-start-login';
import { authStatus } from './channels/auth-status';
import { authStatusRefresh } from './channels/auth-status-refresh';
import { chatCreate } from './channels/chat-create';
import { chatLoad } from './channels/chat-load';
import { chatRemove } from './channels/chat-remove';
import { chatRename } from './channels/chat-rename';
import { chatsList } from './channels/chats-list';
import { chatsRecent } from './channels/chats-recent';
import { checksCreate } from './channels/checks-create';
import { checksDelete } from './channels/checks-delete';
import { checksList } from './channels/checks-list';
import { checksRead } from './channels/checks-read';
import { checksResetDefaults } from './channels/checks-reset-defaults';
import { checksUnwatch } from './channels/checks-unwatch';
import { checksWatch } from './channels/checks-watch';
import { checksWrite } from './channels/checks-write';
import { coachRewrite } from './channels/coach-rewrite';
import { coachScan } from './channels/coach-scan';
import { coachScore } from './channels/coach-score';
import { coachStructure } from './channels/coach-structure';
import { doneListAll } from './channels/done-list-all';
import { doneListProject } from './channels/done-list-project';
import { draftsCheck } from './channels/drafts-check';
import { draftsExport } from './channels/drafts-export';
import { draftsHistoryList } from './channels/drafts-history-list';
import { draftsHistoryRead } from './channels/drafts-history-read';
import { draftsHistoryRestore } from './channels/drafts-history-restore';
import { draftsHistorySnapshot } from './channels/drafts-history-snapshot';
import { draftsListAll } from './channels/drafts-list-all';
import { draftsListProject } from './channels/drafts-list-project';
import { draftsMarkDone } from './channels/drafts-mark-done';
import { draftsPickImage } from './channels/drafts-pick-image';
import { draftsSaveImage } from './channels/drafts-save-image';
import { importResolveUrl } from './channels/import-resolve-url';
import { languageAidExplain } from './channels/language-aid-explain';
import { notesCreate } from './channels/notes-create';
import { notesRead } from './channels/notes-read';
import { notesRename } from './channels/notes-rename';
import { notesUnwatch } from './channels/notes-unwatch';
import { notesWatch } from './channels/notes-watch';
import { notesWrite } from './channels/notes-write';
import { projectCreate } from './channels/project-create';
import { projectCreateFolder } from './channels/project-create-folder';
import { projectCreateNew } from './channels/project-create-new';
import { projectDefaultParentDir } from './channels/project-default-parent-dir';
import { projectListFiles } from './channels/project-list-files';
import { projectPickPath } from './channels/project-pick-path';
import { projectReadFile } from './channels/project-read-file';
import { projectWriteFile } from './channels/project-write-file';
import { projectRemove } from './channels/project-remove';
import { projectTouch } from './channels/project-touch';
import { projectUpdate } from './channels/project-update';
import { projectSearchFiles } from './channels/project-search-files';
import { projectStatFile } from './channels/project-stat-file';
import { projectUiPrefsGet } from './channels/project-ui-prefs-get';
import { projectUiPrefsSet } from './channels/project-ui-prefs-set';
import { projectsList } from './channels/projects-list';
import { promptGet } from './channels/prompt-get';
import { resourcesDelete } from './channels/resources-delete';
import { resourcesRename } from './channels/resources-rename';
import { resourcesMarkThumbFailed } from './channels/resources-mark-thumb-failed';
import { resourcesMove } from './channels/resources-move';
import { resourcesSaveThumb } from './channels/resources-save-thumb';
import { settingsGet } from './channels/settings-get';
import { settingsSet } from './channels/settings-set';
import { shellOpenExternal } from './channels/shell-open-external';
import { sourcesImportDroppedFiles } from './channels/sources-import-dropped-files';
import { sourcesImportFile } from './channels/sources-import-file';
import { uiPrefsGet } from './channels/ui-prefs-get';
import { uiPrefsSet } from './channels/ui-prefs-set';
import { wordpressCancelOauth } from './channels/wordpress-cancel-oauth';
import { wordpressConnectAppPassword } from './channels/wordpress-connect-app-password';
import { wordpressConnectOauth } from './channels/wordpress-connect-oauth';
import { wordpressDisconnect } from './channels/wordpress-disconnect';
import { wordpressDisconnectAccount } from './channels/wordpress-disconnect-account';
import { wordpressImportProject } from './channels/wordpress-import-project';
import { wordpressList } from './channels/wordpress-list';
import { wordpressPublish } from './channels/wordpress-publish';
import { wordpressTest } from './channels/wordpress-test';

const channels = [
	agentCancel,
	agentRespondPermission,
	agentSend,
	authLogout,
	authStartLogin,
	authStatus,
	authStatusRefresh,
	chatCreate,
	chatLoad,
	chatRemove,
	chatRename,
	chatsList,
	chatsRecent,
	checksCreate,
	checksDelete,
	checksList,
	checksRead,
	checksResetDefaults,
	checksUnwatch,
	checksWatch,
	checksWrite,
	coachRewrite,
	coachScan,
	coachScore,
	coachStructure,
	doneListAll,
	doneListProject,
	draftsCheck,
	draftsExport,
	draftsHistoryList,
	draftsHistoryRead,
	draftsHistoryRestore,
	draftsHistorySnapshot,
	draftsListAll,
	draftsListProject,
	draftsMarkDone,
	draftsPickImage,
	draftsSaveImage,
	importResolveUrl,
	languageAidExplain,
	notesCreate,
	notesRead,
	notesRename,
	notesUnwatch,
	notesWatch,
	notesWrite,
	projectCreate,
	projectCreateFolder,
	projectCreateNew,
	projectDefaultParentDir,
	projectListFiles,
	projectPickPath,
	projectReadFile,
	projectWriteFile,
	projectRemove,
	projectTouch,
	projectUpdate,
	projectSearchFiles,
	projectStatFile,
	projectUiPrefsGet,
	projectUiPrefsSet,
	projectsList,
	promptGet,
	resourcesDelete,
	resourcesRename,
	resourcesMarkThumbFailed,
	resourcesMove,
	resourcesSaveThumb,
	settingsGet,
	settingsSet,
	shellOpenExternal,
	sourcesImportDroppedFiles,
	sourcesImportFile,
	uiPrefsGet,
	uiPrefsSet,
	wordpressCancelOauth,
	wordpressConnectAppPassword,
	wordpressConnectOauth,
	wordpressDisconnect,
	wordpressDisconnectAccount,
	wordpressImportProject,
	wordpressList,
	wordpressPublish,
	wordpressTest,
] as const;

export function registerIpcHandlers(): void {
	for ( const channel of channels ) {
		ipcMain.handle( channel.name, channel.invoke );
	}
}
