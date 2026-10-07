/** 密码强度评估：字符集熵值、字典命中与暴力破解耗时估算。 */

/** 按 zxcvbn 量级的常见破解速率（次/秒）。 */
const ATTACK_RATES = {
  onlineThrottled: 100,
  onlineNoThrottle: 10_000,
  offlineSlowHash: 1e4,
  offlineFastHash: 1e10,
} as const;

export type AttackKind = keyof typeof ATTACK_RATES;

const DICTIONARIES: { name: string; words: string[] }[] = [
  {
    name: '常见密码',
    words: [
      'password',
      '123456',
      '12345678',
      'qwerty',
      'abc123',
      'monkey',
      'letmein',
      'dragon',
      '111111',
      'baseball',
      'iloveyou',
      'trustno1',
      'sunshine',
      'master',
      'welcome',
      'shadow',
      'ashley',
      'football',
      'jesus',
      'michael',
      'ninja',
      'mustang',
      'password1',
      'admin',
    ],
  },
  {
    name: '键盘走位',
    words: ['qwerty', 'asdfgh', 'zxcvbn', 'qweasd', '1qaz2wsx', 'qazwsx', 'asdfghjkl', 'poiuyt'],
  },
  {
    name: '常见英文单词',
    words: [
      'apple',
      'banana',
      'orange',
      'purple',
      'silver',
      'golden',
      'winter',
      'summer',
      'spring',
      'autumn',
      'flower',
      'garden',
      'monkey',
      'tiger',
      'rabbit',
      'dragon',
      'rocket',
      'planet',
      'coffee',
      'cookie',
      'guitar',
      'hammer',
      'mirror',
      'shadow',
    ],
  },
];

export interface CharClassInfo {
  label: string;
  regex: RegExp;
  size: number;
  poolSize: number;
}

export const CHAR_CLASSES: CharClassInfo[] = [
  { label: '小写字母', regex: /[a-z]/, size: 26, poolSize: 26 },
  { label: '大写字母', regex: /[A-Z]/, size: 26, poolSize: 26 },
  { label: '数字', regex: /[0-9]/, size: 10, poolSize: 10 },
  { label: 'ASCII 符号', regex: /[!-/:-@[-`{-~]/, size: 32, poolSize: 32 },
  // biome-ignore lint/suspicious/noControlCharactersInRegex: 非 ASCII 判定需要显式匹配控制字符区间
  { label: '非 ASCII 字符', regex: /[^\x00-\x7f]/, size: 100, poolSize: 100 },
];

/** 常见特殊符号集：zxcvbn 的标准符号表。 */
const SPECIAL_SYMBOLS = '!@#$%^&*()_+-=[]{}|;\':",./<>?\\`~';

export function analyzePassword(password: string) {
  const classes = CHAR_CLASSES.filter((c) => c.regex.test(password));
  const poolSize = classes.reduce((sum, c) => sum + c.poolSize, 0);

  // 基础熵 = 长度 × log2(字符集大小)
  const baseEntropy = password.length === 0 || poolSize === 0 ? 0 : password.length * Math.log2(poolSize);

  // 重复字符惩罚：相同字符重复出现不增加等效长度
  const unique = new Set(password);
  const repetitionPenalty = password.length > 0 ? unique.size / password.length : 1;

  // 顺序惩罚：像 "abcdef" 或 "123456" 这类序列
  const sequencePenalty = hasSequence(password) ? 0.75 : 1;

  // 字典匹配
  const lower = password.toLowerCase();
  const matches: { dictionary: string; word: string; span: [number, number] }[] = [];
  for (const dict of DICTIONARIES) {
    for (const word of dict.words) {
      let from = 0;
      for (;;) {
        const at = lower.indexOf(word, from);
        if (at === -1) break;
        matches.push({ dictionary: dict.name, word, span: [at, at + word.length] });
        from = at + 1;
      }
    }
  }
  // 长词优先，避免 "monkey" 同时被较短词典命中
  matches.sort((a, b) => b.word.length - a.word.length);
  const usedSpans: [number, number][] = [];
  const significantMatches = matches.filter((m) => {
    if (usedSpans.some(([s, e]) => m.span[0] < e && m.span[1] > s)) return false;
    usedSpans.push(m.span);
    return true;
  });

  // 字典命中的熵按 log2(词典规模) 计，并按覆盖长度加权
  let dictionaryPenalty = 0;
  for (const m of significantMatches) {
    const size = DICTIONARIES.find((d) => d.name === m.dictionary)?.words.length ?? 100;
    dictionaryPenalty += m.word.length * Math.log2(size);
  }

  const entropy = Math.max(0, baseEntropy * repetitionPenalty * sequencePenalty - dictionaryPenalty);

  const guesses = 2 ** entropy;
  const crackTimes = (Object.keys(ATTACK_RATES) as AttackKind[]).map((kind) => ({
    kind,
    seconds: guesses / ATTACK_RATES[kind],
  }));

  const level = scoreLevel(entropy, significantMatches.length);
  const suggestions = buildSuggestions(password, { classes, sequencePenalty, matches: significantMatches, entropy });

  return {
    entropy,
    guesses,
    level,
    poolSize,
    length: password.length,
    uniqueCount: unique.size,
    classes,
    matches: significantMatches,
    sequence: hasSequence(password),
    crackTimes,
    suggestions,
  };
}

export type StrengthLevel = 'very-weak' | 'weak' | 'fair' | 'strong' | 'very-strong';

export const LEVEL_LABELS: Record<StrengthLevel, string> = {
  'very-weak': '极弱',
  weak: '弱',
  fair: '中等',
  strong: '强',
  'very-strong': '很强',
};

export const LEVEL_COLORS: Record<StrengthLevel, string> = {
  'very-weak': 'bg-red-500',
  weak: 'bg-orange-500',
  fair: 'bg-amber-500',
  strong: 'bg-lime-500',
  'very-strong': 'bg-emerald-500',
};

function scoreLevel(entropy: number, matchCount: number): StrengthLevel {
  if (entropy < 28) return 'very-weak';
  if (entropy < 36) return matchCount > 0 ? 'weak' : 'fair';
  if (entropy < 60) return 'strong';
  if (entropy < 128) return 'very-strong';
  return 'very-strong';
}

function hasSequence(text: string): boolean {
  if (text.length < 4) return false;
  const codes = [...text].map((c) => c.charCodeAt(0));
  let ascending = true;
  let descending = true;
  for (let i = 1; i < codes.length; i++) {
    const diff = codes[i] - codes[i - 1];
    if (diff !== 1) ascending = false;
    if (diff !== -1) descending = false;
  }
  return ascending || descending;
}

function buildSuggestions(
  password: string,
  ctx: { classes: CharClassInfo[]; sequencePenalty: number; matches: { word: string }[]; entropy: number },
): string[] {
  const out: string[] = [];
  if (password.length === 0) return out;
  if (password.length < 12) out.push('长度至少 12 位，密码长度是最有效的提升手段');
  if (!ctx.classes.some((c) => c.label === '数字')) out.push('加入数字');
  if (!ctx.classes.some((c) => c.label === '大写字母')) out.push('加入大写字母');
  if (ctx.classes.length >= 2 && !password.includes(SPECIAL_SYMBOLS)) out.push('加入特殊符号');
  if (ctx.sequencePenalty < 1) out.push('避免连续字符序列，例如 abcdef 或 123456');
  if (ctx.matches.length > 0) out.push(`包含词典词「${ctx.matches[0].word}」，避免使用常见密码`);
  if (ctx.entropy < 60) out.push('建议改用密码管理器生成并保存随机密码');
  return out;
}

export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return '瞬间';
  const units: [number, string][] = [
    [1, '秒'],
    [60, '分钟'],
    [3600, '小时'],
    [86400, '天'],
    [86400 * 30, '个月'],
    [86400 * 365, '年'],
    [86400 * 365 * 100, '世纪'],
  ];
  for (let i = 0; i < units.length; i++) {
    const [size, label] = units[i];
    const next = units[i + 1]?.[0];
    if (next === undefined || seconds < next) {
      const value = seconds / size;
      if (value < 0.01) return `${(seconds).toExponential(2)} 秒`;
      return `${value >= 100 ? Math.round(value) : value.toFixed(1)} ${label}`;
    }
  }
  return `${(seconds / (86400 * 365 * 100)).toFixed(1)} 世纪`;
}

export const ATTACK_LABELS: Record<AttackKind, string> = {
  onlineThrottled: '在线撞库（限速 100 次/秒）',
  onlineNoThrottle: '在线无限制（1 万次/秒）',
  offlineSlowHash: '离线慢哈希（1 万次/秒）',
  offlineFastHash: '离线快哈希（100 亿次/秒）',
};
