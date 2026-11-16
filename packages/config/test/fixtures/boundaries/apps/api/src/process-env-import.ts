// Violation: imports the process environment outside platform/config.
import { env } from 'node:process';

export const port = env.PORT;
