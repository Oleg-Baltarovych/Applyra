// Plain `pg` access for schema/privilege assertions in integration tests (no Prisma: these tests check what the
// database itself enforces).
import { Client, type DatabaseError } from 'pg';

export async function withPg<T>(url: string, run: (client: Client) => Promise<T>): Promise<T> {
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    return await run(client);
  } finally {
    await client.end();
  }
}

/** Resolves to the SQLSTATE of the error `promise` rejects with (fails the test if it resolves). */
export async function sqlState(promise: Promise<unknown>): Promise<string | undefined> {
  try {
    await promise;
  } catch (error) {
    return (error as Partial<DatabaseError>).code; // pg rejects with DatabaseError (SQLSTATE in `code`)
  }
  throw new Error('expected the statement to fail');
}
