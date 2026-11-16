// Violation: namespace import of process outside platform/config.
import * as proc from 'process';

export const port = proc.env.PORT;
