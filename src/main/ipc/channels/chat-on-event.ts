import { IpcChannels } from '..';
import { defineEvent } from '../define-channel';
import { AgentEvent } from '../../../types';

export const chatOnEvent = defineEvent( {
	name: IpcChannels.chatOnEvent,
	payload: AgentEvent,
} );
