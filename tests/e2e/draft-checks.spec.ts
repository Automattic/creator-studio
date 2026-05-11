import { test, expect, _electron as electron } from '@playwright/test';

import { seedLinkedProjects } from '../helpers/linked-projects';
import { gotoDrafts } from '../helpers/nav';

const SEED_BODY = [
	'# Welcome',
	'',
	'The waves was touching the shore in order to test the prose.',
	'',
].join( '\n' );

const SEED_FILES = {
	'drafts/sample.md': `---\ntitle: Sample\n---\n\n${ SEED_BODY }`,
};

test.describe( 'draft editor: checks', () => {
	test.describe.configure( { timeout: 60_000 } );

	test( 'run → highlight → activate → apply', async () => {
		const fixture = seedLinkedProjects( 1, SEED_FILES );

		// STUDIO_WRITE_CHECKS_FIXTURE tells the main handler to bypass the
		// network and stamp deterministic per-kind issues onto the body.
		// Keeps the spec offline and free of token cost.
		const app = await electron.launch( {
			executablePath: process.env.APP_EXECUTABLE,
			env: {
				...process.env,
				STUDIO_WRITE_USER_DATA_DIR: fixture.userDataDir,
				STUDIO_WRITE_CHECKS_FIXTURE: '1',
				ANTHROPIC_API_KEY: 'sk-ant-not-used',
			},
		} );
		const win = await app.firstWindow();

		await gotoDrafts( win );
		await win
			.locator( '[data-testid="draft-row-seed-0-sample.md"]' )
			.click();
		await expect(
			win.locator( '[data-testid=screen-draft-editor]' )
		).toBeVisible();

		// Open the Checks tab, run, see grouped results.
		await win.locator( '[data-testid=draft-sidebar-tab-checks]' ).click();
		await expect(
			win.locator( '[data-testid=draft-checks-panel]' )
		).toBeVisible();
		await win.locator( '[data-testid=draft-checks-run]' ).click();

		// The fixture snippet for passive-voice ("was touched") isn't in the
		// seed body, so passive returns 0 — only grammar + brevity light up.
		await expect( win.locator( '.cm-check-issue' ) ).toHaveCount( 2 );
		const grammarGroup = win.locator(
			'section[data-check-kind="grammar-spelling"]'
		);
		const brevityGroup = win.locator(
			'section[data-check-kind="brevity"]'
		);
		await expect( grammarGroup ).toBeVisible();
		await expect( brevityGroup ).toBeVisible();

		// Click the first grammar row → editor scrolls, row + highlight
		// gain the active marker.
		const grammarRow = grammarGroup
			.locator( '.draft-checks-result' )
			.first();
		await grammarRow.locator( 'button' ).click();
		await expect( grammarRow ).toHaveAttribute( 'data-active', 'true' );
		await expect(
			win.locator( '.cm-check-issue.cm-check-issue-active' )
		).toHaveCount( 1 );

		// Popover opens with Apply / Dismiss.
		const popover = win.locator( '[data-testid=check-issue-popover]' );
		await expect( popover ).toBeVisible();

		// Apply rewrites the doc, drops the issue, leaves the brevity one.
		await win.locator( '[data-testid=check-issue-popover-apply]' ).click();
		await expect( popover ).toHaveCount( 0 );
		const cmText = await win.locator( '.cm-content' ).innerText();
		expect( cmText ).toContain( 'waves were touching' );
		expect( cmText ).not.toContain( 'waves was touching' );
		await expect( win.locator( '.cm-check-issue' ) ).toHaveCount( 1 );

		// Manual edit clears the remaining issue.
		await win.locator( '.cm-content' ).click();
		await win.keyboard.press( 'End' );
		await win.keyboard.type( ' done.' );
		await expect( win.locator( '.cm-check-issue' ) ).toHaveCount( 0 );

		await app.close();
		fixture.cleanup();
	} );
} );
