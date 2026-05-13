import { z } from 'zod';

import { defineEvent } from './utils/define-channel';
import { IpcChannels } from '.';

// Main → renderer ping fired when a clipping thumbnail finishes downloading
// in the background. The renderer treats it as "the listFiles response you
// got a moment ago may now be stale — refresh the affected project". We
// don't pass the thumb path: a full re-list is cheaper than threading
// per-file patches through the React tree, and it keeps folder summaries
// (childThumbPaths, latestChildMtime) consistent too.
export const resourcesThumbReady = defineEvent( {
	name: IpcChannels.resourcesThumbReady,
	payload: z.object( {
		projectId: z.string(),
	} ),
} );
