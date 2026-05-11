import { z } from 'zod';

import { defineChannel } from './utils/define-channel';
import { runDraftChecks } from './utils/draft-checks';
import { IpcChannels } from '.';
import { DraftCheckKind } from '../../types';

export const draftsCheck = defineChannel( {
	name: IpcChannels.draftsCheck,
	input: z.object( {
		projectId: z.string().min( 1 ),
		body: z.string(),
		checks: z.array( DraftCheckKind ).min( 1 ).max( 3 ),
	} ),
	handle: ( { projectId, body, checks } ) =>
		runDraftChecks( { projectId, body, checks } ),
} );
