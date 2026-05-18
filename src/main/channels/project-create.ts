import { randomUUID } from 'node:crypto';
import path from 'node:path';

import { z } from 'zod';

import { seedDefaultChecksIfEmpty } from './utils/checks-seed';
import { defineChannel } from './utils/define-channel';
import { readStore, writeStore } from './utils/project-store';
import { IpcChannels } from '.';
import type { Project } from '../../types';

const Input = z.object( {
	path: z.string().min( 1 ),
	name: z.string().min( 1 ),
	goal: z.string().optional(),
} );

// Always writes a new record. Two projects on the same path are allowed
// (different name + goal). The renderer is responsible for the duplicate UX.
export const projectCreate = defineChannel( {
	name: IpcChannels.projectCreate,
	input: Input,
	handle: ( input ) => {
		const seeded = seedDefaultChecksIfEmpty( input.path );
		if ( ! seeded.ok ) {
			// Non-fatal: project is still usable, user can hit "Reset defaults"
			// in the checks panel to recover.
			// eslint-disable-next-line no-console
			console.warn(
				`projectCreate: failed to seed default checks at ${
					input.path
				} (${ 'reason' in seeded ? seeded.reason : 'unknown' })`
			);
		}

		const store = readStore();
		const project: Project = {
			id: randomUUID(),
			path: input.path,
			label: path.basename( input.path ),
			name: input.name,
			goal: input.goal,
		};
		store.projects.push( project );
		writeStore( store );
		return project;
	},
} );
