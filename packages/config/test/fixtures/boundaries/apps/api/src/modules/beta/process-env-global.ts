// Violation: reaches the process environment through globalThis outside platform/config.
export const port = globalThis.process.env.PORT;
