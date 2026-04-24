/**
 * IPC channel-name constants. The "URLs" of the IPC layer.
 *
 * Channels (invoke + push) and any schemas exclusive to a single channel
 * live in src/main/ipc/channels/<name>.ts via `defineChannel` / `defineEvent`.
 * Cross-process domain types live in src/types.ts.
 */

export const IpcChannels = {
	chatOnEvent: 'chat:onEvent',
	chatSend: 'chat:send',
	chatsCreate: 'chats:create',
	chatsList: 'chats:list',
	chatsLoad: 'chats:load',
	foldersAdd: 'folders:add',
	foldersList: 'folders:list',
	foldersRemove: 'folders:remove',
	permissionRespond: 'permission:respond',
	promptsGet: 'prompts:get',
} as const;
