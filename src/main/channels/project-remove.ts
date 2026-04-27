import { z } from 'zod';

import { removeProject } from '../services/project-remove';
import { defineChannel } from './utils/define-channel';
import { IpcChannels } from './names';

export const projectRemove = defineChannel( {
	name: IpcChannels.projectRemove,
	input: z.object( {
		id: z.string().min( 1 ),
	} ),
	handle: ( { id } ) => removeProject( id ),
} );
