import React from 'react';

type Props = {
	projectId: string;
	relPath: string;
};

// Placeholder until the chat panel gets wired up to the agent. Props are
// listed (and not destructured) so the call site stays stable when the
// real implementation lands.
export function DraftChatPanel( props: Props ): React.ReactElement {
	void props;
	return (
		<div
			className="draft-sidebar-empty"
			data-testid="draft-chat-panel"
			data-state="placeholder"
		>
			Chat coming soon.
		</div>
	);
}
