// Violation: computed access to the process environment outside platform/config.
export const port = process['env'].PORT;
