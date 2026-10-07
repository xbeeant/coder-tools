import { useCallback, useEffect, useState } from 'react';

const FAV_KEY = 'coder-tools:favorites';
const RECENT_KEY = 'coder-tools:recent';

function read(key: string): string[] {
  try {
    const raw = localStorage.getItem(key);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

function write(key: string, value: string[]) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // storage 不可用时静默失败，不影响主流程
  }
}

export function useFavorites() {
  const [favorites, setFavorites] = useState<string[]>(() => Array.from(new Set(read(FAV_KEY))));

  useEffect(() => {
    write(FAV_KEY, favorites);
  }, [favorites]);

  const toggleFav = useCallback((id: string) => {
    setFavorites((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }, []);

  return { favorites, toggleFav };
}

export function useRecent() {
  const [recent, setRecent] = useState<string[]>(() => Array.from(new Set(read(RECENT_KEY))));

  useEffect(() => {
    write(RECENT_KEY, recent);
  }, [recent]);

  const addRecent = useCallback((id: string) => {
    setRecent((prev) => [id, ...prev.filter((item) => item !== id)]);
  }, []);

  const clearRecent = useCallback(() => {
    setRecent([]);
  }, []);

  return { recent, addRecent, clearRecent };
}

const THEME_KEY = 'coder-tools:theme';

export type Theme = 'light' | 'dark';

function initialTheme(): Theme {
  try {
    const stored = localStorage.getItem(THEME_KEY);
    if (stored === 'light' || stored === 'dark') return stored;
  } catch {
    // ignore
  }
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(initialTheme);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch {
      // ignore
    }
  }, [theme]);

  const toggle = useCallback(() => {
    setTheme((t) => (t === 'dark' ? 'light' : 'dark'));
  }, []);

  return { theme, toggle };
}
