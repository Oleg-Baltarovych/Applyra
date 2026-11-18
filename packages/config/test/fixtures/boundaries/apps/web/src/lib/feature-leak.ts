// Rule 10: lib must not depend on features.
import { Page } from '../features/alpha';

export const leak = Page;
