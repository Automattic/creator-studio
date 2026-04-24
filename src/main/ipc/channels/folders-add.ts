import { BrowserWindow } from 'electron';
import { z } from 'zod';

import { IpcChannels } from '..';
import { addFolder } from '../../services/folder';
import { defineChannel } from './utils/define-channel';

export const foldersAdd = defineChannel( {
	name: IpcChannels.foldersAdd,
	input: z.void(),
	handle: ( _input, event ) => {
		const window = BrowserWindow.fromWebContents( event.sender );
		return addFolder( window );
	},
} );
