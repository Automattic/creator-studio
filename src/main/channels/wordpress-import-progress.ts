import { defineEvent } from './utils/define-channel';
import { WordpressImportProgress } from '../../types';
import { IpcChannels } from '.';

export const wordpressImportProgress = defineEvent< WordpressImportProgress >( {
	name: IpcChannels.wordpressImportProgress,
	payload: WordpressImportProgress,
} );
