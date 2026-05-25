import { z } from 'zod';

import { defineChannel } from './utils/define-channel';
import { runLanguageAid } from './utils/language-aid';
import { IpcChannels } from '.';

export const languageAidExplain = defineChannel( {
	name: IpcChannels.languageAidExplain,
	input: z.object( {
		projectId: z.string().min( 1 ),
		word: z.string().min( 1 ),
		sentence: z.string(),
		paragraph: z.string().optional(),
	} ),
	handle: ( { projectId, word, sentence, paragraph } ) =>
		runLanguageAid( { projectId, word, sentence, paragraph } ),
} );
