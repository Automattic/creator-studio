import { z } from 'zod';

import { defineChannel } from './utils/define-channel';
import { runCoachScan } from './utils/coach';
import { IpcChannels } from '.';

export const coachScan = defineChannel( {
	name: IpcChannels.coachScan,
	input: z.object( {
		projectId: z.string().min( 1 ),
		body: z.string(),
	} ),
	handle: ( { projectId, body } ) => runCoachScan( { projectId, body } ),
} );
