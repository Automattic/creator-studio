import fs from 'node:fs';
import path from 'node:path';

import { test, expect, _electron as electron } from '@playwright/test';

import { seedLinkedProjects } from '../helpers/linked-projects';
import { gotoProject } from '../helpers/nav';

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
	test( 'checks tab is editable from project view without an open draft', async () => {
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

		// All three seeded checks render with their titles + enabled state.
		await expect(
			win.locator( '[data-testid=draft-checks-row]' )
		).toHaveCount( 3 );
		await expect(
			win.locator(
				'[data-testid=draft-checks-row][data-rel-path="brevity.md"] input[type=checkbox]'
			)
		).toBeChecked();
		await expect(
			win.locator(
				'[data-testid=draft-checks-row][data-rel-path="passive-voice.md"] input[type=checkbox]'
			)
		).not.toBeChecked();

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

		// Toggling a check off persists round-trip through the writer + the
		// folder watcher. After re-listing, the checkbox should be off.
		const brevityCheckbox = win.locator(
			'[data-testid=draft-checks-row][data-rel-path="brevity.md"] input[type=checkbox]'
		);
		await brevityCheckbox.click();
		await expect( brevityCheckbox ).not.toBeChecked();
		const onDisk = fs.readFileSync(
			path.join( project.path, 'checks', 'brevity.md' ),
			'utf-8'
		);
		expect( onDisk ).toMatch( /enabled:\s*false/ );

		// Edit opens the inline file editor for the check, with a back button
		// that returns us to the list.
		await win
			.locator(
				'[data-testid=draft-checks-row][data-rel-path="brevity.md"] [data-testid=draft-checks-row-edit]'
			)
			.click();
		await expect(
			win.locator( '[data-testid=draft-checks-editor-wrap]' )
		).toBeVisible();
		await win.locator( '[data-testid=draft-checks-editor-back]' ).click();
		await expect(
			win.locator( '[data-testid=draft-checks-editor-wrap]' )
		).toHaveCount( 0 );

		// + creates a new check and immediately opens it in the editor for
		// renaming/editing. The file lands on disk as untitled-check.md.
		await win.locator( '[data-testid=draft-checks-new]' ).click();
		await expect(
			win.locator( '[data-testid=draft-checks-editor-wrap]' )
		).toBeVisible();
		expect(
			fs.existsSync(
				path.join( project.path, 'checks', 'untitled-check.md' )
			)
		).toBe( true );
		await win.locator( '[data-testid=draft-checks-editor-back]' ).click();
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
