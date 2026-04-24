import { AgentEvent, IpcChannels } from '..';
import { defineEvent } from '../define-channel';

export const chatOnEvent = defineEvent( {
	name: IpcChannels.chatOnEvent,
	payload: AgentEvent,
} );
