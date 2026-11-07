/**
 * Bun 内置 test runner 的最小类型声明。
 *
 * 项目没有安装 @types/bun，也不想为几个纯函数测试引入新依赖；
 * bun test 运行时会提供 bun:test 模块，这里只声明实际用到的 API。
 */
declare module 'bun:test' {
  export interface Matchers {
    toBe(expected: unknown): void;
    toEqual(expected: unknown): void;
    toBeTruthy(): void;
    toBeFalsy(): void;
    toBeNull(): void;
    toBeUndefined(): void;
    toBeGreaterThan(expected: number): void;
    toBeLessThan(expected: number): void;
    toContain(expected: unknown): void;
    toHaveLength(expected: number): void;
    toMatch(expected: string | RegExp): void;
    toThrow(expected?: string | RegExp): void;
    not: Matchers;
  }

  export function expect<T>(actual: T): Matchers;
  export function describe(name: string, fn: () => void): void;
  export function test(name: string, fn: () => void | Promise<void>): void;
  export function it(name: string, fn: () => void | Promise<void>): void;
  export function beforeEach(fn: () => void): void;
  export function afterEach(fn: () => void): void;
}
