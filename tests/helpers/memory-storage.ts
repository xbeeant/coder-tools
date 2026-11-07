/**
 * 测试用的最小 localStorage 替身。
 * 通过 Object.defineProperty 挂到 globalThis，绕开 DOM 里 localStorage 的只读声明。
 */
export class MemoryStorage {
  private readonly map = new Map<string, string>();
  /** 设为 true 时模拟浏览器抛出的配额错误。 */
  throwOnSet = false;

  get length(): number {
    return this.map.size;
  }

  key(index: number): string | null {
    return Array.from(this.map.keys())[index] ?? null;
  }

  getItem(key: string): string | null {
    return this.map.get(String(key)) ?? null;
  }

  setItem(key: string, value: string): void {
    if (this.throwOnSet) {
      const error = new Error('exceeded the quota');
      error.name = 'QuotaExceededError';
      throw error;
    }
    this.map.set(String(key), String(value));
  }

  removeItem(key: string): void {
    this.map.delete(String(key));
  }

  clear(): void {
    this.map.clear();
  }
}

export function installStorage(): MemoryStorage {
  const storage = new MemoryStorage();
  Object.defineProperty(globalThis, 'localStorage', {
    value: storage,
    configurable: true,
    writable: true,
  });
  return storage;
}
