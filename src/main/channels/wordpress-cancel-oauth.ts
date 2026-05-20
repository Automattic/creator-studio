import { z } from 'zod';

import { defineChannel } from './utils/define-channel';
import { abortCurrentOauth } from './wordpress-connect-oauth';
import { IpcChannels } from '.';

const Input = z.object( {} ).optional();

export const wordpressCancelOauth = defineChannel( {
	name: IpcChannels.wordpressCancelOauth,
	input: Input,
	handle: (): { ok: true } => {
		abortCurrentOauth();
		return { ok: true };
	},
} );
