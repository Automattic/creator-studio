import { z } from 'zod';

import { defineChannel } from './utils/define-channel';
import { runCoachStructure } from './utils/coach';
import { IpcChannels } from '.';

export const coachStructure = defineChannel( {
	name: IpcChannels.coachStructure,
	input: z.object( {
		projectId: z.string().min( 1 ),
		body: z.string(),
	} ),
	handle: ( { projectId, body } ) => runCoachStructure( { projectId, body } ),
} );
