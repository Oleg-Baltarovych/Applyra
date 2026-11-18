import { act, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { DelayedSkeleton } from './DelayedSkeleton';

afterEach(() => vi.useRealTimers());

it('appears only after 150 ms (no flash on fast loads, 10 §7.1)', () => {
  vi.useFakeTimers();
  render(<DelayedSkeleton />);
  act(() => vi.advanceTimersByTime(149));
  expect(screen.queryByRole('status', { name: 'Loading' })).not.toBeInTheDocument();
  act(() => vi.advanceTimersByTime(1));
  expect(screen.getByRole('status', { name: 'Loading' })).toBeInTheDocument();
});
