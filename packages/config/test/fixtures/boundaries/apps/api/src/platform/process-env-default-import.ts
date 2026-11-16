// Violation: default import of node:process outside platform/config.
import proc from 'node:process';

export const port = proc.env.PORT;
