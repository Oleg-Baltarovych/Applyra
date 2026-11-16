import { v7 } from 'uuid';

/** App-side UUID v7 (time-ordered) — the id format of every table, auth tables included (ADR 007, 012). */
export const newId = (): string => v7();
