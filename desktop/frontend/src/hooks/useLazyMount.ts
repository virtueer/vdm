import { useEffect, useState } from 'react';

/**
 * Keeps a lazily-loaded overlay mounted once it has been opened, so reopening
 * costs nothing and the close transition still runs.
 */
export function useLazyMount(isOpen: boolean): boolean {
  const [mounted, setMounted] = useState(isOpen);

  useEffect(() => {
    if (isOpen) setMounted(true);
  }, [isOpen]);

  return mounted;
}
