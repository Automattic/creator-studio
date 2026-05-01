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
import { chatCreate } from './channels/chat-create';
import { chatLoad } from './channels/chat-load';
import { chatRemove } from './channels/chat-remove';
import { chatRename } from './channels/chat-rename';
import { chatsList } from './channels/chats-list';
import { chatsRecent } from './channels/chats-recent';
import { draftsListAll } from './channels/drafts-list-all';
import { draftsRead } from './channels/drafts-read';
import { draftsSaveImage } from './channels/drafts-save-image';
import { draftsWrite } from './channels/drafts-write';
import { projectCreate } from './channels/project-create';
import { projectListFiles } from './channels/project-list-files';
import { projectPickPath } from './channels/project-pick-path';
import { projectReadFile } from './channels/project-read-file';
import { projectRemove } from './channels/project-remove';
import { projectSearchFiles } from './channels/project-search-files';
import { projectUiPrefsGet } from './channels/project-ui-prefs-get';
import { projectUiPrefsSet } from './channels/project-ui-prefs-set';
import { projectsList } from './channels/projects-list';
import { promptGet } from './channels/prompt-get';
import { uiPrefsGet } from './channels/ui-prefs-get';
import { uiPrefsSet } from './channels/ui-prefs-set';

const channels = [
	agentCancel,
	agentRespondPermission,
	agentSend,
	chatCreate,
	chatLoad,
	chatRemove,
	chatRename,
	chatsList,
	chatsRecent,
	draftsListAll,
	draftsRead,
	draftsSaveImage,
	draftsWrite,
	projectCreate,
	projectListFiles,
	projectPickPath,
	projectReadFile,
	projectRemove,
	projectSearchFiles,
	projectUiPrefsGet,
	projectUiPrefsSet,
	projectsList,
	promptGet,
	uiPrefsGet,
	uiPrefsSet,
] as const;

export function registerIpcHandlers(): void {
	for ( const channel of channels ) {
		ipcMain.handle( channel.name, channel.invoke );
	}
}
