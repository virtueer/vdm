import { useCallback, useEffect, useState } from 'react';
import { applyTheme, resolveInitialTheme, type Theme } from '@/lib/theme';

export interface ThemeState {
  theme: Theme;
  toggleTheme: () => void;
}

/** Light/dark switch; the initial class is set by the inline boot script. */
export function useTheme(): ThemeState {
  const [theme, setTheme] = useState<Theme>(resolveInitialTheme);

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme((current) => (current === 'dark' ? 'light' : 'dark'));
  }, []);

  return { theme, toggleTheme };
}
