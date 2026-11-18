// Rule 10: shared components must not depend on features.
import { Page } from '../features/alpha';

export const Leak = (): string => Page();
