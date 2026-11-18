// Clean: the typed client is the only fetch caller.
export const raw = (): Promise<Response> => fetch('/x');
