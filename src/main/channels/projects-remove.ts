import { z } from 'zod';

import { IpcChannels } from '../ipc';
import { removeProject } from '../services/project';
import { defineChannel } from './utils/define-channel';

export const projectsRemove = defineChannel( {
	name: IpcChannels.projectsRemove,
	input: z.object( {
		id: z.string().min( 1 ),
	} ),
	handle: ( { id } ) => removeProject( id ),
} );
