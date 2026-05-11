import { test, expect, _electron as electron } from '@playwright/test';

import { seedLinkedProjects } from '../helpers/linked-projects';
import { gotoDrafts } from '../helpers/nav';

// Body engineered to trip at least one check across the three kinds:
//   - "directoy" (spelling)
//   - "in order to" (brevity)
//   - "was launched by the team" (passive with a clear active rewrite)
// Loose assertions on output — the model can vary which it flags, but
// it should virtually always return at least one for this body.
const SEED_BODY = [
	'# Welcome',
	'',
	'A directoy of resources, made in order to help the reader.',
	'',
	'The waves was touching the shore.',
	'',
	'The project was launched by the team last month.',
	'',
].join( '\n' );

const SEED_FILES = {
	'drafts/sample.md': `---\ntitle: Sample\n---\n\n${ SEED_BODY }`,
};

test.describe( 'draft editor: checks', () => {
	test.describe.configure( { retries: 2, timeout: 180_000 } );

	test( 'run → highlight → row click → apply against real API', async () => {
		const apiKey = process.env.ANTHROPIC_API_KEY;
		if ( ! apiKey ) {
			throw new Error(
				'ANTHROPIC_API_KEY is not set. Export it in your shell or add it to ' +
					'.env in the repo root, then re-run `npm test`. This suite makes ' +
					'real calls to the Claude API and cannot run without a key.'
			);
		}

		const fixture = seedLinkedProjects( 1, SEED_FILES );
		const app = await electron.launch( {
			executablePath: process.env.APP_EXECUTABLE,
			env: {
				...process.env,
				ANTHROPIC_API_KEY: apiKey,
				STUDIO_WRITE_USER_DATA_DIR: fixture.userDataDir,
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

		await win.locator( '[data-testid=draft-sidebar-tab-checks]' ).click();
		await expect(
			win.locator( '[data-testid=draft-checks-panel]' )
		).toBeVisible();

		const runButton = win.locator( '[data-testid=draft-checks-run]' );
		await expect( runButton ).toBeEnabled();
		await runButton.click();

		// Button reverts to 'Run checks' (not 'Checking…') once all checks
		// resolve, regardless of how many issues each returned.
		await expect( runButton ).toHaveText( 'Run checks', {
			timeout: 90_000,
		} );

		// Loose: at least one highlight + at least one panel row. We don't
		// assert which kind — the model can flag any of the three.
		const highlights = win.locator( '.cm-check-issue' );
		await expect( highlights.first() ).toBeVisible();
		const highlightCount = await highlights.count();
		expect( highlightCount ).toBeGreaterThanOrEqual( 1 );

		const rows = win.locator( '.draft-checks-result' );
		await expect( rows.first() ).toBeVisible();
		const rowCount = await rows.count();
		expect( rowCount ).toBeGreaterThanOrEqual( 1 );
		// `highlightCount` can exceed `rowCount` because CM6 may split a
		// single Decoration.mark across line boundaries; one issue → one
		// row, but possibly several `.cm-check-issue` spans.
		expect( highlightCount ).toBeGreaterThanOrEqual( rowCount );

		// Click the first row → popover opens, no selection menu.
		const firstRow = rows.first();
		await firstRow.locator( 'button' ).click();
		await expect( firstRow ).toHaveAttribute( 'data-active', 'true' );

		const popover = win.locator( '[data-testid=check-issue-popover]' );
		await expect( popover ).toBeVisible();
		await expect(
			win.locator( '[data-testid=selection-menu]' )
		).toHaveCount( 0 );

		// Snapshot the row's replacement so we can verify the doc applied it.
		const replacement =
			( await firstRow
				.locator( '.draft-checks-result-replacement' )
				.textContent() ) ?? '';

		await win.locator( '[data-testid=check-issue-popover-apply]' ).click();
		await expect( popover ).toHaveCount( 0 );
		const cmText = await win.locator( '.cm-content' ).innerText();
		if ( replacement.length > 0 ) {
			expect( cmText ).toContain( replacement );
		}
		// Highlight count strictly drops — at least the applied issue
		// vanishes; overlapping issues on the same range drop too.
		const after = await highlights.count();
		expect( after ).toBeLessThan( highlightCount );

		await app.close();
		fixture.cleanup();
	} );
} );
