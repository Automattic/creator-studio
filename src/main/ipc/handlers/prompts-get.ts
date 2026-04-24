import type { IpcMainInvokeEvent } from 'electron';

import { PromptsGetRequest } from '..';
import { loadPromptWithFolder } from '../../prompts';
import { resolveBundledPromptPath } from '../../services/agent';
import { getFolder } from '../../services/folder';

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
