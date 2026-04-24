import type { WebContents } from 'electron';

import { AgentService } from './agentService';

const services = new Map< number, Map< string, AgentService > >();

export function getOrCreateAgentService(
	contents: WebContents,
	folderId: string
): AgentService {
	let perFolder = services.get( contents.id );
	if ( ! perFolder ) {
		perFolder = new Map();
		services.set( contents.id, perFolder );
		contents.once( 'destroyed', () => services.delete( contents.id ) );
	}
	let service = perFolder.get( folderId );
	if ( ! service ) {
		service = new AgentService( contents, folderId );
		perFolder.set( folderId, service );
	}
	return service;
}

export function getAgentService(
	contents: WebContents,
	folderId: string
): AgentService | undefined {
	return services.get( contents.id )?.get( folderId );
}
