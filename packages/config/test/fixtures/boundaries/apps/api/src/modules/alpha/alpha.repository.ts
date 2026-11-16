import { PrismaClient } from '@prisma/client';
export const alphaRepository = { list: () => new PrismaClient() };
