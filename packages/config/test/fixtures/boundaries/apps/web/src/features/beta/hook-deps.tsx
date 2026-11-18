// react-hooks/exhaustive-deps: `id` is read in the effect but missing from the dependency list.
import { useEffect } from 'react';

export function Probe({ id }: { id: string }) {
  useEffect(() => {
    document.title = id;
  }, []);
  return null;
}
