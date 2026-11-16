// Violation: reads the process environment outside platform/config.
export const secret = process.env.BETTER_AUTH_SECRET;
