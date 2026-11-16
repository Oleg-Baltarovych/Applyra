import type { Contract } from '@applyra/contracts';
import { run } from '../../platform/prisma/transaction';
import { alphaRepository } from './alpha.repository';
export type AlphaContract = Contract;
export const alphaService = { list: () => run(async () => alphaRepository.list()) };
