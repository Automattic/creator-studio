import { z } from 'zod';

import { defineChannel } from './utils/define-channel';
import { runCoachReview } from './utils/coach';
import { IpcChannels } from '.';

export const coachReview = defineChannel( {
	name: IpcChannels.coachReview,
	input: z.object( {
		projectId: z.string().min( 1 ),
		body: z.string(),
	} ),
	handle: ( { projectId, body } ) => runCoachReview( { projectId, body } ),
} );
