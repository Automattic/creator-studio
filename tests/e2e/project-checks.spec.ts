import fs from 'node:fs';
import path from 'node:path';

import { test, expect, _electron as electron } from '@playwright/test';

import { seedLinkedProjects } from '../helpers/linked-projects';

// Three minimal checks files seeded into <project>/checks/. We don't run
// them in this suite — these tests only cover the CRUD surface exposed in
// project view, where no draft body exists to run against.
const SEED_FILES = {
	'checks/grammar-spelling.md':
		'---\ntitle: Grammar and spelling\nenabled: true\n---\n\nFlag clear errors in spelling and grammar.\n',
	'checks/brevity.md':
		'---\ntitle: Brevity\nenabled: true\n---\n\nFlag wording that can be shortened without changing meaning.\n',
	'checks/passive-voice.md':
		'---\ntitle: Passive voice\nenabled: false\n---\n\nFlag passive constructions where an active rewrite is clearer.\n',
};

test.describe( 'project view: checks panel', () => {
	test( 'row click + edit icon both open the check in the middle panel (no checkbox)', async () => {
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

		await expect(
			win.locator( '[data-testid=screen-project]' )
		).toBeVisible();

		// Open the Checks tab from project view (no draft involved).
		const checksTab = win.locator(
			'[data-testid=draft-sidebar-tab-checks]'
		);
		await expect( checksTab ).toBeEnabled();
		await checksTab.click();

		const panel = win.locator( '[data-testid=draft-checks-panel]' );
		await expect( panel ).toBeVisible();

		// All three seeded checks render as clickable rows. The per-row
		// checkbox is gone (there's no draft body to run against), but the
		// edit icon stays — both it and a row click open the check in the
		// middle panel.
		await expect(
			win.locator( '[data-testid=draft-checks-row]' )
		).toHaveCount( 3 );
		await expect(
			win.locator( '[data-testid=draft-checks-row] input[type=checkbox]' )
		).toHaveCount( 0 );
		await expect(
			win.locator( '[data-testid=draft-checks-row-edit]' )
		).toHaveCount( 3 );

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

		// The edit icon also opens the check in the middle panel — and while a
		// check is already open in the middle, clicking edit on a different
		// row should swap the middle window to that other check (not open
		// anything in the sidebar).
		await win.locator( '[data-testid=draft-sidebar-tab-checks]' ).click();
		await win
			.locator(
				'[data-testid=draft-checks-row][data-rel-path="grammar-spelling.md"] [data-testid=draft-checks-row-edit]'
			)
			.click();
		await expect(
			win.locator( '[data-testid=screen-draft-editor]' )
		).toBeVisible();
		await expect(
			win.locator( '.draft-editor-file-name', {
				hasText: 'grammar-spelling.md',
			} )
		).toBeVisible();

		// While a check is open in the middle, the right sidebar mirrors
		// project view: chat + checks tabs only (no outline / share), and
		// the checks panel itself drops the Run button + per-row checkbox.
		await expect(
			win.locator( '[data-testid=draft-sidebar-tab-outline]' )
		).toHaveCount( 0 );
		await expect(
			win.locator( '[data-testid=draft-sidebar-tab-share]' )
		).toHaveCount( 0 );
		await win.locator( '[data-testid=draft-sidebar-tab-checks]' ).click();
		await expect(
			win.locator( '[data-testid=draft-checks-run]' )
		).toHaveCount( 0 );
		await expect(
			win.locator( '[data-testid=draft-checks-row] input[type=checkbox]' )
		).toHaveCount( 0 );

		await win
			.locator(
				'[data-testid=draft-checks-row][data-rel-path="passive-voice.md"] [data-testid=draft-checks-row-edit]'
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

		await app.close();
		fixture.cleanup();
	} );
} );
