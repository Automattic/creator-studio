import { IpcChannels } from '../ipc';
import { AgentEvent } from '../../types';
import { defineEvent } from './utils/define-channel';

export const chatOnEvent = defineEvent( {
	name: IpcChannels.chatOnEvent,
	payload: AgentEvent,
} );
