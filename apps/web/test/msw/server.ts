// MSW lives only under test/ (ESLint bans `msw` in src/**). Tests add their handlers via server.use(...).
import { setupServer } from 'msw/node';

export const server = setupServer();
