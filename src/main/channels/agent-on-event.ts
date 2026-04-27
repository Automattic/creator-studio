import { IpcChannels } from '../ipc';
import { AgentEvent } from '../../types';
import { defineEvent } from './utils/define-channel';

export const agentOnEvent = defineEvent( {
	name: IpcChannels.agentOnEvent,
	payload: AgentEvent,
} );
