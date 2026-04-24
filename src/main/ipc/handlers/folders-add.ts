import { BrowserWindow, type IpcMainInvokeEvent } from 'electron';

import { addFolder } from '../../folderService';

export async function foldersAdd( event: IpcMainInvokeEvent ) {
	const window = BrowserWindow.fromWebContents( event.sender );
	return await addFolder( window );
}
