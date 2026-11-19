// Foreign keys of user-owned factories have no sensible default: the test names the owner (A owns, B is foreign).
// `build` leaves them empty; `create` refuses to persist until the test passes them as overrides.
export function requireId(value: string, field: string, factory: string): string {
  if (value === '') throw new Error(`${factory}.create: pass ${field} in the overrides`);
  return value;
}
