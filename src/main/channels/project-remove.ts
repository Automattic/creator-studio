import { z } from 'zod';

import { IpcChannels } from '../ipc';
import { removeProject } from '../services/project-remove';
import { defineChannel } from './utils/define-channel';

export const projectRemove = defineChannel( {
	name: IpcChannels.projectRemove,
	input: z.object( {
		id: z.string().min( 1 ),
	} ),
	handle: ( { id } ) => removeProject( id ),
} );
