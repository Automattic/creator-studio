import type { IpcMainInvokeEvent } from 'electron';

import { resolveBundledPromptPath } from '../agentService';
import { getFolder } from '../folderService';
import { PromptsGetRequest } from '../ipc';
import { loadPromptWithFolder } from '../prompts';

export function promptsGet( _event: IpcMainInvokeEvent, payload: unknown ) {
	const { name, folderId } = PromptsGetRequest.parse( payload );
	const folder = getFolder( folderId );
	if ( ! folder ) {
		throw new Error( `Folder ${ folderId } is not linked.` );
	}
	return loadPromptWithFolder(
		resolveBundledPromptPath( `${ name }.md` ),
		folder.path
	);
}
