// Violation: require('node:process') outside platform/config (also a no-require-imports finding).
const proc = require('node:process');

export const port: unknown = proc.env.PORT;
