import { prisma } from './prisma.service';
export type Tx = { readonly __brand: 'Tx' };
export const run = <T>(fn: (tx: Tx) => Promise<T>): Promise<T> => {
  void prisma;
  return fn({ __brand: 'Tx' });
};
