import fs from 'node:fs';
import path from 'node:path';

import { test, expect, _electron as electron } from '@playwright/test';

import { seedLinkedProjects } from '../helpers/linked-projects';

// The bug being guarded: a permission-request event for chat A would surface
// in the UI even after the user switched to chat B in the same project, which
// also blocked B's composer. We assert the prompt is scoped to the chat that
// triggered it.
//
// We dispatch a synthetic `agent:onEvent` via the main process instead of
// driving the agent for real. The real agent path costs an API call and
// depends on the LLM choosing to invoke a non-allow-listed tool — both
// flakier than what's needed to cover a renderer-side filter.
test.describe( 'permission prompt: chat scoping', () => {
	test( 'prompt only shows in the chat that triggered it', async () => {
		const fixture = seedLinkedProjects( 1 );
		const project = fixture.projects[ 0 ];

		const storeDir = path.join( project.path, '.studio-write' );
		const chatsDir = path.join( storeDir, 'chats' );
		fs.mkdirSync( chatsDir, { recursive: true } );
		fs.writeFileSync(
			path.join( storeDir, 'chats.json' ),
			JSON.stringify( {
				chats: [
					{
						id: 'chat-a',
						sessionId: null,
						createdAt: 1,
						lastMessageAt: 2,
					},
					{
						id: 'chat-b',
						sessionId: null,
						createdAt: 3,
						lastMessageAt: 4,
					},
				],
			} ),
			'utf-8'
		);
		// Seed a user message in each chat so the transcript renders something
		// distinguishable when switching tabs.
		fs.writeFileSync(
			path.join( chatsDir, 'chat-a.jsonl' ),
			JSON.stringify( {
				kind: 'user',
				id: 'ua',
				text: 'hello A',
				at: 1,
			} ) + '\n',
			'utf-8'
		);
		fs.writeFileSync(
			path.join( chatsDir, 'chat-b.jsonl' ),
			JSON.stringify( {
				kind: 'user',
				id: 'ub',
				text: 'hello B',
				at: 1,
			} ) + '\n',
			'utf-8'
		);

		const app = await electron.launch( {
			executablePath: process.env.APP_EXECUTABLE,
			env: {
				...process.env,
				STUDIO_WRITE_USER_DATA_DIR: fixture.userDataDir,
			},
		} );
		const win = await app.firstWindow();

		const tabA = win.locator( '[data-testid=chat-tab-chat-a]' );
		const tabB = win.locator( '[data-testid=chat-tab-chat-b]' );
		await expect( tabA ).toBeVisible();
		await expect( tabB ).toBeVisible();

		// Activate chat A.
		await tabA.click();
		await expect( tabA ).toHaveAttribute( 'data-active', 'true' );

		// Push a synthetic permission-request event scoped to chat A. Going
		// through main keeps us honest about what the renderer sees on the
		// real wire.
		await app.evaluate(
			( { BrowserWindow }, payload ) => {
				const wins = BrowserWindow.getAllWindows();
				wins[ 0 ].webContents.send( 'agent:onEvent', payload );
			},
			{
				kind: 'permission-request',
				projectId: project.id,
				chatId: 'chat-a',
				requestId: 'req-from-a',
				toolName: 'Bash',
				input: { command: 'ps aux' },
			}
		);

		const prompt = win.locator( '[data-testid=permission-prompt]' );
		await expect( prompt ).toBeVisible();

		// Switch to chat B — the prompt belongs to A and must hide.
		await tabB.click();
		await expect( tabB ).toHaveAttribute( 'data-active', 'true' );
		await expect( prompt ).toHaveCount( 0 );
		// And the composer in B must not be blocked by A's pending decision.
		await expect( win.locator( '[data-testid=chat-input]' ) ).toBeEnabled();

		// Switching back to A restores the prompt — it was hidden, not dropped.
		await tabA.click();
		await expect( tabA ).toHaveAttribute( 'data-active', 'true' );
		await expect( prompt ).toBeVisible();

		await app.close();
		fixture.cleanup();
	} );
} );
