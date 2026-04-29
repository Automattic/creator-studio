import React from 'react';

export function DraftsScreen(): React.ReactElement {
	return (
		<section
			className="drafts-screen"
			data-testid="screen-drafts"
			aria-label="Drafts"
		>
			<header className="drafts-screen-header">
				<h1 className="drafts-screen-title">Drafts</h1>
			</header>
			<p className="drafts-screen-placeholder">Coming together…</p>
		</section>
	);
}
