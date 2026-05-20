import { z } from 'zod';

import { defineEvent } from './utils/define-channel';
import { IpcChannels } from '.';

const payload = z.object( {
	projectId: z.string().min( 1 ),
	folder: z.enum( [ 'drafts', 'done', 'sources', 'checks' ] ),
	relPath: z.string().min( 1 ),
	snapshot: z.object( {
		id: z.string().min( 1 ),
		takenAt: z.number(),
		source: z.enum( [ 'agent', 'manual', 'idle', 'pre-restore' ] ),
	} ),
} );

export type DraftHistoryChangedEvent = z.infer< typeof payload >;

export const draftsHistoryOnChanged = defineEvent< DraftHistoryChangedEvent >( {
	name: IpcChannels.draftsHistoryOnChanged,
	payload,
} );
