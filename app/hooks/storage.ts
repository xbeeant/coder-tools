import { useCallback, useEffect, useState } from 'react';

const FAV_KEY = 'coder-tools:favorites';
const RECENT_KEY = 'coder-tools:recent';
const SETTINGS_KEY = 'coder-tools:settings';
const LEGACY_THEME_KEY = 'coder-tools:theme';
const SIDEBAR_OPEN_KEY = 'coder-tools:sidebar-open';
const LAST_TOOL_KEY = 'coder-tools:last-tool';

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

// ── 偏好设置 ──────────────────────────────────────────────────────

export type ThemeMode = 'light' | 'dark' | 'system';

export interface AppSettings {
  /** system 表示跟随操作系统外观 */
  theme: ThemeMode;
  /** 自动保存 / 恢复各工具的文本输入 */
  autoSaveInputs: boolean;
  /** 下次打开时回到上次使用的工具 */
  restoreLastTool: boolean;
  /** 记住侧边栏展开状态 */
  rememberSidebar: boolean;
}

export const DEFAULT_SETTINGS: AppSettings = {
  theme: 'system',
  autoSaveInputs: true,
  restoreLastTool: true,
  rememberSidebar: true,
};

function isThemeMode(value: unknown): value is ThemeMode {
  return value === 'light' || value === 'dark' || value === 'system';
}

export function readSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<AppSettings>;
      return {
        theme: isThemeMode(parsed.theme) ? parsed.theme : DEFAULT_SETTINGS.theme,
        autoSaveInputs:
          typeof parsed.autoSaveInputs === 'boolean' ? parsed.autoSaveInputs : DEFAULT_SETTINGS.autoSaveInputs,
        restoreLastTool:
          typeof parsed.restoreLastTool === 'boolean' ? parsed.restoreLastTool : DEFAULT_SETTINGS.restoreLastTool,
        rememberSidebar:
          typeof parsed.rememberSidebar === 'boolean' ? parsed.rememberSidebar : DEFAULT_SETTINGS.rememberSidebar,
      };
    }
    // 兼容旧版本单独存放的 coder-tools:theme 键
    const legacy = localStorage.getItem(LEGACY_THEME_KEY);
    if (legacy === 'light' || legacy === 'dark') return { ...DEFAULT_SETTINGS, theme: legacy };
  } catch {
    // 读取失败时用默认值
  }
  return { ...DEFAULT_SETTINGS };
}

function writeSettings(settings: AppSettings): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // ignore
  }
}

export function useSettings() {
  const [settings, setSettings] = useState<AppSettings>(readSettings);

  const update = useCallback((patch: Partial<AppSettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      writeSettings(next);
      return next;
    });
  }, []);

  const reset = useCallback(() => {
    const next = { ...DEFAULT_SETTINGS };
    writeSettings(next);
    setSettings(next);
  }, []);

  return { settings, update, reset };
}

// ── 主题 ──────────────────────────────────────────────────────────

function systemPrefersDark(): boolean {
  try {
    return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
  } catch {
    return false;
  }
}

/** 把设置里的主题模式解析成实际生效的 light / dark，并同步到 documentElement。 */
export function useResolvedTheme(mode: ThemeMode): 'light' | 'dark' {
  const [systemDark, setSystemDark] = useState(systemPrefersDark);

  useEffect(() => {
    const query = window.matchMedia?.('(prefers-color-scheme: dark)');
    if (!query) return;
    const sync = (event: MediaQueryListEvent) => setSystemDark(event.matches);
    query.addEventListener('change', sync);
    return () => query.removeEventListener('change', sync);
  }, []);

  const theme: 'light' | 'dark' = mode === 'system' ? (systemDark ? 'dark' : 'light') : mode;

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
  }, [theme]);

  return theme;
}

// ── 会话状态 ──────────────────────────────────────────────────────

export function readSidebarOpen(fallback = true): boolean {
  try {
    const raw = localStorage.getItem(SIDEBAR_OPEN_KEY);
    return raw === null ? fallback : raw === 'true';
  } catch {
    return fallback;
  }
}

export function writeSidebarOpen(open: boolean): void {
  try {
    localStorage.setItem(SIDEBAR_OPEN_KEY, String(open));
  } catch {
    // ignore
  }
}

export function readLastTool(): string | null {
  try {
    return localStorage.getItem(LAST_TOOL_KEY);
  } catch {
    return null;
  }
}

export function writeLastTool(id: string): void {
  try {
    localStorage.setItem(LAST_TOOL_KEY, id);
  } catch {
    // ignore
  }
}
