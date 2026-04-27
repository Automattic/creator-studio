import { BrowserWindow } from 'electron';
import { z } from 'zod';

import { pickProjectPath } from '../services/project-pick-path';
import { defineChannel } from './utils/define-channel';
import { IpcChannels } from '.';

export const projectPickPath = defineChannel( {
	name: IpcChannels.projectPickPath,
	input: z.void(),
	handle: ( _input, event ) => {
		const window = BrowserWindow.fromWebContents( event.sender );
		return pickProjectPath( window );
	},
} );
