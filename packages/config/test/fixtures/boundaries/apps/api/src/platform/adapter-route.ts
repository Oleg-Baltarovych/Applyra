// A route registered on the HTTP adapter bypasses Nest guards and the IDOR route table (M0-07b).
declare const app: { getHttpAdapter(): { get(path: string, handler: () => void): void } };

app.getHttpAdapter().get('/raw', () => undefined);
