import { DraftFileChanged } from '../../types';
import { defineEvent } from './utils/define-channel';
import { IpcChannels } from '.';

export const draftsOnFileChanged = defineEvent( {
	name: IpcChannels.draftsOnFileChanged,
	payload: DraftFileChanged,
} );
