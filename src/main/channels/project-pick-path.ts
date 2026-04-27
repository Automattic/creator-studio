import { BrowserWindow, dialog } from 'electron';
import { z } from 'zod';

import { defineChannel } from './utils/define-channel';
import { IpcChannels } from '.';

export const projectPickPath = defineChannel( {
	name: IpcChannels.projectPickPath,
	input: z.void(),
	handle: async ( _input, event ) => {
		const parent = BrowserWindow.fromWebContents( event.sender );
		const result = parent
			? await dialog.showOpenDialog( parent, {
					properties: [ 'openDirectory', 'createDirectory' ],
			  } )
			: await dialog.showOpenDialog( {
					properties: [ 'openDirectory', 'createDirectory' ],
			  } );
		if ( result.canceled || result.filePaths.length === 0 ) {
			return null;
		}
		return result.filePaths[ 0 ];
	},
} );
