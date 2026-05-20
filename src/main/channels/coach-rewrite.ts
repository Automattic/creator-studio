import { z } from 'zod';

import { defineChannel } from './utils/define-channel';
import { runCoachRewrite } from './utils/coach';
import { CoachRewriteAction, CoachTone } from '../../types';
import { IpcChannels } from '.';

export const coachRewrite = defineChannel( {
	name: IpcChannels.coachRewrite,
	input: z.object( {
		projectId: z.string().min( 1 ),
		selection: z.string(),
		context: z.string(),
		action: CoachRewriteAction,
		tone: CoachTone,
	} ),
	handle: ( { projectId, selection, context, action, tone } ) =>
		runCoachRewrite( { projectId, selection, context, action, tone } ),
} );
