import { BrowserWindow } from 'electron';
import { z } from 'zod';

import { IpcChannels } from '..';
import { pickFolderPath } from '../../services/folder';
import { defineChannel } from './utils/define-channel';

export const foldersPickPath = defineChannel( {
	name: IpcChannels.foldersPickPath,
	input: z.void(),
	handle: ( _input, event ) => {
		const window = BrowserWindow.fromWebContents( event.sender );
		return pickFolderPath( window );
	},
} );
