import type { ChatMeta } from '../../types';

export function computeChatLabels( chats: ChatMeta[] ): Map< string, string > {
	const labels = new Map< string, string >();
	const untitledTotal = chats.filter( ( c ) => ! c.title ).length;
	let untitledSeen = 0;
	for ( const c of chats ) {
		if ( c.title ) {
			labels.set( c.id, c.title );
			continue;
		}
		untitledSeen += 1;
		labels.set(
			c.id,
			untitledTotal === 1 ? 'Untitled' : `Untitled ${ untitledSeen }`
		);
	}
	return labels;
}
