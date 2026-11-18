import { CircleAlert } from 'lucide-react';
import { Button } from './ui/button';
import { describeError } from './error-message';

type Props = {
  error: unknown;
  onRetry?: () => void;
  /** 1 when the error replaces the whole page, 2 inside the shell (which owns the page heading context). */
  headingLevel?: 1 | 2;
};

/** Error state (10 §7.1): message by `code`, Retry, request id for the bug report. */
export function ErrorState({ error, onRetry, headingLevel = 2 }: Props) {
  const { title, message, requestId } = describeError(error);
  const Heading = headingLevel === 1 ? 'h1' : 'h2';
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-3 py-16 text-center">
      <CircleAlert aria-hidden="true" className="size-10 text-destructive" />
      <div role="alert" className="flex flex-col gap-3">
        <Heading className="text-lg font-semibold">{title}</Heading>
        <p className="text-muted-foreground">{message}</p>
      </div>
      {onRetry && (
        <Button variant="outline" onClick={onRetry}>
          Retry
        </Button>
      )}
      {requestId && <p className="text-xs text-muted-foreground">Request ID: {requestId}</p>}
    </div>
  );
}
