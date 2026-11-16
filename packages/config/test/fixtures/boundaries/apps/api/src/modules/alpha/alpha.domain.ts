import { randomUUID } from 'node:crypto';
import type { Contract } from '@applyra/contracts';
import type { Clock } from '../../platform/clock';
export type DomainContract = Contract;
export const isOverdue = (clock: Clock, due: Date): boolean => clock.now() > due;
export const newId = (): string => randomUUID();
