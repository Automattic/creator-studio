import { z } from 'zod';

import { defineChannel } from './utils/define-channel';
import { runCoachScore } from './utils/coach';
import { IpcChannels } from '.';

export const coachScore = defineChannel( {
	name: IpcChannels.coachScore,
	input: z.object( {
		projectId: z.string().min( 1 ),
		body: z.string(),
	} ),
	handle: ( { projectId, body } ) => runCoachScore( { projectId, body } ),
} );
