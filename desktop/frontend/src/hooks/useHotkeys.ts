import { useEffect, useRef } from 'react';

/** Handlers keyed by combo, e.g. `'mod+k'` — mod is ⌘ on macOS, Ctrl elsewhere. */
export type HotkeyMap = Record<string, () => void>;

function comboOf(e: KeyboardEvent): string {
  const mod = e.metaKey || e.ctrlKey ? 'mod+' : '';
  const shift = e.shiftKey ? 'shift+' : '';
  return `${mod}${shift}${e.key.toLowerCase()}`;
}

/** Window-level shortcuts; the map may be recreated on every render. */
export function useHotkeys(map: HotkeyMap) {
  const mapRef = useRef(map);
  mapRef.current = map;

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const handler = mapRef.current[comboOf(e)];
      if (!handler) return;
      e.preventDefault();
      handler();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);
}
