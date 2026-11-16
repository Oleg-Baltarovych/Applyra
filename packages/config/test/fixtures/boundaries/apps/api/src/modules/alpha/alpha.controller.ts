import { alphaService } from './alpha.service';
export const alphaController = { list: () => alphaService.list() };
