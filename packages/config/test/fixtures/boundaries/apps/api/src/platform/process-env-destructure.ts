// Violation: destructures the process environment outside platform/config.
const { env } = process;
export const port = env.PORT;
