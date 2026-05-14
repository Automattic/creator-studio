import { NoteFileChanged } from '../../types';
import { defineEvent } from './utils/define-channel';
import { IpcChannels } from '.';

export const notesOnFileChanged = defineEvent( {
	name: IpcChannels.notesOnFileChanged,
	payload: NoteFileChanged,
} );
