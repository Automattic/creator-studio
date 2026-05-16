import { z } from 'zod';

import { defineChannel } from './utils/define-channel';
import {
	moveDraftToDone,
	type MoveDraftToDoneResult,
} from './utils/move-draft-to-done';
import { getProject } from './utils/project-get';
import { IpcChannels } from '.';

export type DraftMarkDoneResult = MoveDraftToDoneResult;

// Move a draft from <project>/drafts/<rel> to <project>/done/<rel>. The done
// counterpart's directory tree is created on demand; on a name collision we
// auto-suffix `-2`, `-3`, … rather than refusing — the action is a one-click
// Mark as done, and forcing the user to rename mid-flight would be hostile.
//
// DraftAttachment entries in chat jsonl files are intentionally NOT remapped:
// they describe a draft whose `folder` is implicitly `'drafts'`, and once the
// file has moved to `'done'` they no longer match. Future work can either
// follow the move (set folder='done' on remap) or surface the orphan in the
// chat UI.
export const draftsMarkDone = defineChannel( {
	name: IpcChannels.draftsMarkDone,
	input: z.object( {
		projectId: z.string().min( 1 ),
		relPath: z.string().min( 1 ),
	} ),
	handle: ( { projectId, relPath } ): DraftMarkDoneResult => {
		const project = getProject( projectId );
		if ( ! project ) {
			return { ok: false, reason: 'not-found' };
		}
		return moveDraftToDone( project.path, relPath );
	},
} );
