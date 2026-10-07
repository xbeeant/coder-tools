/** HTML 实体编解码：覆盖 HTML5 常用命名实体与数字实体。 */

const NAMED: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  copy: '©',
  reg: '®',
  trade: '™',
  hellip: '…',
  mdash: '—',
  ndash: '–',
  lsquo: '‘',
  rsquo: '’',
  ldquo: '“',
  rdquo: '”',
  bull: '•',
  middot: '·',
  deg: '°',
  plusmn: '±',
  times: '×',
  divide: '÷',
  laquo: '«',
  raquo: '»',
  sect: '§',
  para: '¶',
  dagger: '†',
  Dagger: '‡',
  permil: '‰',
  prime: '′',
  Prime: '″',
  euro: '€',
  pound: '£',
  yen: '¥',
  cent: '¢',
  curren: '¤',
  iexcl: '¡',
  iquest: '¿',
  szlig: 'ß',
  agrave: 'à',
  aacute: 'á',
  acirc: 'â',
  atilde: 'ã',
  auml: 'ä',
  aring: 'å',
  aelig: 'æ',
  ccedil: 'ç',
  egrave: 'è',
  eacute: 'é',
  ecirc: 'ê',
  euml: 'ë',
  igrave: 'ì',
  iacute: 'í',
  icirc: 'î',
  iuml: 'ï',
  ntilde: 'ñ',
  ograve: 'ò',
  oacute: 'ó',
  ocirc: 'ô',
  otilde: 'õ',
  ouml: 'ö',
  oslash: 'ø',
  ugrave: 'ù',
  uacute: 'ú',
  ucirc: 'û',
  uuml: 'ü',
  yacute: 'ý',
  yuml: 'ÿ',
  sup1: '¹',
  sup2: '²',
  sup3: '³',
  micro: 'µ',
  frac12: '½',
  frac14: '¼',
  frac34: '¾',
  larr: '←',
  uarr: '↑',
  rarr: '→',
  darr: '↓',
  harr: '↔',
  infin: '∞',
  ne: '≠',
  le: '≤',
  ge: '≥',
  minus: '−',
  radic: '√',
  sum: '∑',
  prod: '∏',
  int: '∫',
  part: '∂',
  alpha: 'α',
  beta: 'β',
  gamma: 'γ',
  delta: 'δ',
  pi: 'π',
  sigma: 'σ',
  omega: 'ω',
  mu: 'μ',
  lambda: 'λ',
  theta: 'θ',
  phi: 'φ',
  ensp: ' ',
  emsp: ' ',
  thinsp: ' ',
  shy: '­',
  check: '✓',
  cross: '✗',
  star: '☆',
  hearts: '♥',
  clubs: '♣',
  spades: '♠',
  diams: '♦',
  loz: '◊',
  lceil: '⌈',
  rceil: '⌉',
  lfloor: '⌊',
  rfloor: '⌋',
  rang: '〉',
  oline: '‾',
  frasl: '⁄',
  weierp: '℘',
  image: 'ℑ',
  real: 'ℜ',
  alefsym: 'ℵ',
  nabla: '∇',
  isin: '∈',
  notin: '∉',
  cap: '∩',
  cup: '∪',
  sube: '⊂',
  supe: '⊃',
  sube2: '⊆',
  supe2: '⊇',
  oplus: '⊕',
  otimes: '⊗',
  perp: '⊥',
  sdot: '⋅',
  ang: '∠',
  there4: '∴',
  because: '∵',
};

// 反查表：字符 -> 命名实体。取字典序最小的键，保证同一字符输出稳定。
const NAMED_BY_CHAR: Record<string, string> = {};
for (const [name, char] of Object.entries(NAMED)) {
  const existing = NAMED_BY_CHAR[char];
  if (existing === undefined || name.length < existing.length) NAMED_BY_CHAR[char] = name;
}

const ENTITY_RE = /&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]*);/gi;

export function encodeHtmlEntities(input: string): string {
  let out = '';
  for (const char of input) {
    const code = char.codePointAt(0) as number;
    if (code === 0x26) out += '&amp;';
    else if (code === 0x3c) out += '&lt;';
    else if (code === 0x3e) out += '&gt;';
    else if (code === 0x22) out += '&quot;';
    else if (code === 0x27) out += '&#39;';
    else {
      const named = NAMED_BY_CHAR[char];
      out += named !== undefined ? `&${named};` : char;
    }
  }
  return out;
}

export function decodeHtmlEntities(input: string): string {
  return input.replace(ENTITY_RE, (match, body: string) => {
    if (body.startsWith('#x') || body.startsWith('#X')) {
      const code = Number.parseInt(body.slice(2), 16);
      return Number.isFinite(code) ? safeFromCodePoint(code, match) : match;
    }
    if (body.startsWith('#')) {
      const code = Number.parseInt(body.slice(1), 10);
      return Number.isFinite(code) ? safeFromCodePoint(code, match) : match;
    }
    const named = NAMED[body] ?? NAMED[body.toLowerCase()];
    return named ?? match;
  });
}

function safeFromCodePoint(code: number, fallback: string): string {
  if (code === 0 || code > 0x10ffff || (code >= 0xd800 && code <= 0xdfff)) return fallback;
  return String.fromCodePoint(code);
}

export type HtmlEntityMode = 'named' | 'numeric' | 'hex';

export function encodeHtmlEntitiesAs(input: string, mode: HtmlEntityMode): string {
  return Array.from(input, (char) => {
    const code = char.codePointAt(0) as number;
    if (mode === 'numeric') return `&#${code};`;
    if (mode === 'hex') return `&#x${code.toString(16)};`;
    const named = NAMED_BY_CHAR[char];
    return named !== undefined ? `&${named};` : char;
  }).join('');
}

export function escapeHtmlAttributes(input: string): string {
  return encodeHtmlEntities(input).replace(/"/g, '&quot;');
}
