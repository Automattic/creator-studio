import { z } from 'zod';

import { defineChannel } from './utils/define-channel';
import { takeSnapshot, type TakeSnapshotResult } from './utils/draft-history';
import { IpcChannels } from '.';

export const draftsHistorySnapshot = defineChannel( {
	name: IpcChannels.draftsHistorySnapshot,
	input: z.object( {
		projectId: z.string().min( 1 ),
		relPath: z.string().min( 1 ),
		folder: z.enum( [ 'drafts', 'done', 'sources', 'checks' ] ),
		source: z.enum( [ 'agent', 'manual', 'idle', 'pre-restore' ] ),
	} ),
	handle: ( { projectId, relPath, folder, source } ): TakeSnapshotResult => {
		return takeSnapshot( projectId, folder, relPath, source );
	},
} );
