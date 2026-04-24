import type { IpcMainInvokeEvent } from 'electron';

import { removeFolder } from '../folderService';
import { FoldersRemoveRequest } from '../ipc';

export function foldersRemove(
	_event: IpcMainInvokeEvent,
	payload: unknown
): void {
	const { id } = FoldersRemoveRequest.parse( payload );
	removeFolder( id );
}
