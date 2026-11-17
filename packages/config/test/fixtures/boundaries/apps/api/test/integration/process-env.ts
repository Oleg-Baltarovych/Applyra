// Violation: a test reading the process environment directly (use testEnv() / runner-env.ts).
export const url = process.env.DATABASE_URL;
