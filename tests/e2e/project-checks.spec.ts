import fs from 'node:fs';
import path from 'node:path';

import {
	test,
	expect,
	_electron as electron,
	type Page,
} from '@playwright/test';

import { seedLinkedProjects } from '../helpers/linked-projects';
import { gotoProject } from '../helpers/nav';

// Three minimal checks files seeded into <project>/checks/. `autoRename:
// false` pins each filename: this suite opens checks in the editor, and
// without the pin a title that doesn't match the filename (e.g. "Grammar
// and spelling" vs grammar-spelling.md) auto-renames on title blur,
// churning the panel mid-test.
const SEED_FILES = {
	'checks/grammar-spelling.md':
		'---\ntitle: Grammar and spelling\nenabled: true\nautoRename: false\n---\n\nFlag clear errors in spelling and grammar.\n',
	'checks/brevity.md':
		'---\ntitle: Brevity\nenabled: true\nautoRename: false\n---\n\nFlag wording that can be shortened without changing meaning.\n',
	'checks/passive-voice.md':
		'---\ntitle: Passive voice\nenabled: false\nautoRename: false\n---\n\nFlag passive constructions where an active rewrite is clearer.\n',
};

// The draft sidebar persists its open/tab state across screens, so the checks
// panel may already be open. Clicking the rail tab while it is the active
// panel toggles the whole sidebar shut — so click only when it isn't active,
// then confirm the panel is on screen.
async function ensureChecksPanelOpen( win: Page ): Promise< void > {
	const rail = win.locator( '[data-testid=draft-sidebar-tab-checks]' );
	if ( ( await rail.getAttribute( 'data-active' ) ) !== 'true' ) {
		await rail.click();
	}
	await expect(
		win.locator( '[data-testid=draft-checks-panel]' )
	).toBeVisible();
}

test.describe( 'project view: checks panel', () => {
	test( 'row click opens the check in the middle panel (no checkbox, no edit icon)', async () => {
		const fixture = seedLinkedProjects( 1, SEED_FILES );
		const [ project ] = fixture.projects;

		const app = await electron.launch( {
			executablePath: process.env.APP_EXECUTABLE,
			env: {
				...process.env,
				STUDIO_WRITE_USER_DATA_DIR: fixture.userDataDir,
			},
		} );
		const win = await app.firstWindow();

		await gotoProject( win, project.id );

		// Open the Checks tab from project view (no draft involved).
		const checksTab = win.locator(
			'[data-testid=draft-sidebar-tab-checks]'
		);
		await expect( checksTab ).toBeEnabled();
		await checksTab.click();

		const panel = win.locator( '[data-testid=draft-checks-panel]' );
		await expect( panel ).toBeVisible();

		// All three seeded checks render as clickable rows. The per-row
		// checkbox is gone (there's no draft body to run against), and the
		// edit icon is gone too — clicking the row is the edit affordance.
		await expect(
			win.locator( '[data-testid=draft-checks-row]' )
		).toHaveCount( 3 );
		await expect(
			win.locator( '[data-testid=draft-checks-row] input[type=checkbox]' )
		).toHaveCount( 0 );
		await expect(
			win.locator( '[data-testid=draft-checks-row-edit]' )
		).toHaveCount( 0 );

		// No "Run" button: project view has no draft body to run against.
		await expect(
			win.locator( '[data-testid=draft-checks-run]' )
		).toHaveCount( 0 );

		// New + reset-defaults header actions are present.
		await expect(
			win.locator( '[data-testid=draft-checks-new]' )
		).toBeVisible();
		await expect(
			win.locator( '[data-testid=draft-checks-menu]' )
		).toBeVisible();

		// Click the row → opens the check in the middle panel (DraftEditorScreen).
		// The folder badge identifies it as a check, and "back" returns to the
		// project view.
		await win
			.locator(
				'[data-testid=draft-checks-row][data-rel-path="brevity.md"] [data-testid=draft-checks-row-open]'
			)
			.click();
		await expect(
			win.locator( '[data-testid=screen-draft-editor]' )
		).toBeVisible();
		await expect(
			win.locator( '.draft-editor-folder-badge[data-folder=checks]' )
		).toBeVisible();
		await win.locator( '[data-testid=draft-editor-back]' ).click();
		await expect(
			win.locator( '[data-testid=screen-project]' )
		).toBeVisible();

		// While a check is open in the middle, the right sidebar mirrors
		// project view: chat + checks tabs only (no outline / share), and
		// the checks panel itself drops the Run button + per-row checkbox +
		// edit icon (the row click is the edit affordance).
		await ensureChecksPanelOpen( win );
		await expect(
			win.locator( '[data-testid=draft-sidebar-tab-outline]' )
		).toHaveCount( 0 );
		await expect(
			win.locator( '[data-testid=draft-sidebar-tab-share]' )
		).toHaveCount( 0 );
		await expect(
			win.locator( '[data-testid=draft-checks-run]' )
		).toHaveCount( 0 );
		await expect(
			win.locator( '[data-testid=draft-checks-row] input[type=checkbox]' )
		).toHaveCount( 0 );
		await expect(
			win.locator( '[data-testid=draft-checks-row-edit]' )
		).toHaveCount( 0 );

		// Clicking a different check in the sidebar swaps the middle window
		// (no inline editor in the sidebar).
		await win
			.locator(
				'[data-testid=draft-checks-row][data-rel-path="grammar-spelling.md"] [data-testid=draft-checks-row-open]'
			)
			.click();
		await expect(
			win.locator( '.draft-editor-file-name', {
				hasText: 'grammar-spelling.md',
			} )
		).toBeVisible();
		await win
			.locator(
				'[data-testid=draft-checks-row][data-rel-path="passive-voice.md"] [data-testid=draft-checks-row-open]'
			)
			.click();
		await expect(
			win.locator( '.draft-editor-file-name', {
				hasText: 'passive-voice.md',
			} )
		).toBeVisible();
		await win.locator( '[data-testid=draft-editor-back]' ).click();
		await expect(
			win.locator( '[data-testid=screen-project]' )
		).toBeVisible();

		// The sidebar persists its open/tab state across the editor
		// round-trip, so make sure the checks panel is open before using its
		// header actions.
		await ensureChecksPanelOpen( win );

		// + creates a new check and immediately opens it in the middle panel.
		// The file lands on disk as untitled-check.md.
		await win.locator( '[data-testid=draft-checks-new]' ).click();
		await expect(
			win.locator( '[data-testid=screen-draft-editor]' )
		).toBeVisible();
		expect(
			fs.existsSync(
				path.join( project.path, 'checks', 'untitled-check.md' )
			)
		).toBe( true );
		await win.locator( '[data-testid=draft-editor-back]' ).click();
		// Make sure the checks panel is open after the editor round-trip.
		await ensureChecksPanelOpen( win );
		await expect(
			win.locator( '[data-testid=draft-checks-row]' )
		).toHaveCount( 4 );

		// Delete the new untitled check via the trash icon + confirm dialog.
		await win
			.locator(
				'[data-testid=draft-checks-row][data-rel-path="untitled-check.md"] [data-testid=draft-checks-row-delete]'
			)
			.click();
		await expect(
			win.locator( '[data-testid=draft-checks-delete-dialog]' )
		).toBeVisible();
		await win
			.locator( '[data-testid=draft-checks-delete-confirm]' )
			.click();
		await expect(
			win.locator( '[data-testid=draft-checks-row]' )
		).toHaveCount( 3 );
		expect(
			fs.existsSync(
				path.join( project.path, 'checks', 'untitled-check.md' )
			)
		).toBe( false );

		// Trash on the check that's currently open in the middle should also
		// bail back to project view (same as the three-dot menu's Delete), and
		// land us with the Checks panel still open. Create a fresh check so we
		// have a deletable target, then trash it from the sidebar.
		await win.locator( '[data-testid=draft-checks-new]' ).click();
		await expect(
			win.locator( '[data-testid=screen-draft-editor]' )
		).toBeVisible();
		await win
			.locator(
				'[data-testid=draft-checks-row][data-rel-path="untitled-check.md"] [data-testid=draft-checks-row-delete]'
			)
			.click();
		await win
			.locator( '[data-testid=draft-checks-delete-confirm]' )
			.click();
		await expect(
			win.locator( '[data-testid=screen-project]' )
		).toBeVisible();
		await expect(
			win.locator( '[data-testid=draft-sidebar]' )
		).toHaveAttribute( 'data-open', 'true' );
		await expect(
			win.locator( '[data-testid=draft-sidebar-body]' )
		).toHaveAttribute( 'data-tab', 'checks' );
		expect(
			fs.existsSync(
				path.join( project.path, 'checks', 'untitled-check.md' )
			)
		).toBe( false );

		await app.close();
		fixture.cleanup();
	} );
} );
