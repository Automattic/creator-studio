import { AgentEvent } from '../../types';
import { defineEvent } from './utils/define-channel';
import { IpcChannels } from '.';

export const agentOnEvent = defineEvent( {
	name: IpcChannels.agentOnEvent,
	payload: AgentEvent,
} );
