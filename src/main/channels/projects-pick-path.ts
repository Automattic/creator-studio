import { BrowserWindow } from 'electron';
import { z } from 'zod';

import { IpcChannels } from '../ipc';
import { pickProjectPath } from '../services/project';
import { defineChannel } from './utils/define-channel';

export const projectsPickPath = defineChannel( {
	name: IpcChannels.projectsPickPath,
	input: z.void(),
	handle: ( _input, event ) => {
		const window = BrowserWindow.fromWebContents( event.sender );
		return pickProjectPath( window );
	},
} );
