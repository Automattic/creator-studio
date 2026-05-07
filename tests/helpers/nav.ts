import { expect, type Page } from '@playwright/test';

export async function gotoDrafts( win: Page ): Promise< void > {
	// The View all button only becomes pointer-clickable on :hover of the
	// section. Synthesizing the hover plus a real click is racy in CDP-driven
	// tests, so dispatch the click directly — the hover reveal itself is
	// covered by a dedicated test in projects.spec.ts.
	await win
		.locator( '[data-testid=sidebar-recent-view-all]' )
		.dispatchEvent( 'click' );
	await expect( win.locator( '[data-testid=screen-drafts]' ) ).toBeVisible();
}

export async function gotoDone( win: Page ): Promise< void > {
	await gotoDrafts( win );
	await win.locator( '[data-testid=library-tab-done]' ).click();
	await expect( win.locator( '[data-testid=screen-done]' ) ).toBeVisible();
}
