import { z } from 'zod';

import { defineChannel } from './utils/define-channel';
import { runDraftChecks } from './utils/draft-checks';
import { IpcChannels } from '.';

export const draftsCheck = defineChannel( {
	name: IpcChannels.draftsCheck,
	input: z.object( {
		projectId: z.string().min( 1 ),
		body: z.string(),
	} ),
	handle: ( { projectId, body } ) => runDraftChecks( { projectId, body } ),
} );
