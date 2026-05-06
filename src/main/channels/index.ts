/**
 * IPC channel-name registry.
 *
 * This file is intentionally a leaf module: it has no imports. Channel
 * files (`channels/<name>.ts`) and the preload script both import from
 * here. Two reasons it can't live in `main/ipc.ts`:
 *
 *  1. `ipc.ts` imports every channel module to register handlers. If
 *     channel files imported `IpcChannels` back from `ipc.ts`, the
 *     `const IpcChannels = { ... }` line would be in the TDZ when
 *     channel modules evaluate first → `Cannot access 'IpcChannels'
 *     before initialization`.
 *  2. The preload bundle imports `IpcChannels`. If it lived alongside
 *     the channel-module imports in `ipc.ts`, Vite would have to keep
 *     those imports alive in the preload bundle, dragging the entire
 *     main-process service graph (and Node built-ins like `node:crypto`)
 *     into a sandboxed preload that can't load them.
 *
 * Wire-format names are kept in sync with the `name:` literal in each
 * channel file. Naming conventions (singular vs. plural, domain
 * prefixes) are documented in `src/main/README.md` and `ipc.ts`.
 */
export const IpcChannels = {
	agentCancel: 'agent:cancel',
	agentOnEvent: 'agent:onEvent',
	agentRespondPermission: 'agent:respondPermission',
	agentSend: 'agent:send',
	chatCreate: 'chat:create',
	chatEnsureForDraft: 'chat:ensureForDraft',
	chatLoad: 'chat:load',
	chatRemove: 'chat:remove',
	chatRename: 'chat:rename',
	chatsList: 'chats:list',
	chatsRecent: 'chats:recent',
	draftsCreate: 'drafts:create',
	draftsExport: 'drafts:export',
	draftsListAll: 'drafts:listAll',
	draftsListProject: 'drafts:listProject',
	draftsMarkDone: 'drafts:markDone',
	draftsOnFileChanged: 'drafts:onFileChanged',
	draftsPickImage: 'drafts:pickImage',
	draftsRead: 'drafts:read',
	draftsRename: 'drafts:rename',
	draftsSaveImage: 'drafts:saveImage',
	draftsUnwatch: 'drafts:unwatch',
	draftsWatch: 'drafts:watch',
	draftsWrite: 'drafts:write',
	importResolveUrl: 'import:resolveUrl',
	projectCreate: 'project:create',
	projectListFiles: 'project:listFiles',
	projectPickPath: 'project:pickPath',
	projectReadFile: 'project:readFile',
	projectSearchFiles: 'project:searchFiles',
	projectStatFile: 'project:statFile',
	projectRemove: 'project:remove',
	projectUiPrefsGet: 'project:uiPrefs:get',
	projectUiPrefsSet: 'project:uiPrefs:set',
	projectsList: 'projects:list',
	promptGet: 'prompt:get',
	resourcesDelete: 'resources:delete',
	resourcesMarkThumbFailed: 'resources:markThumbFailed',
	resourcesSaveThumb: 'resources:saveThumb',
	settingsGet: 'settings:get',
	settingsSet: 'settings:set',
	shellOpenExternal: 'shell:openExternal',
	uiPrefsGet: 'ui-prefs:get',
	uiPrefsSet: 'ui-prefs:set',
} as const;
