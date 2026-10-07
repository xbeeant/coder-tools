/** 命名风格互转：先归一化为词元序列，再按目标风格拼接。 */

const SEPARATORS = /[\s\-_./\\:,;|()[\]{}"'`+*=<>!?@#$%^&~]+/u;

const ACRONYM_BOUNDARY = /([A-Z]+)([A-Z][a-z])/g;
const WORD_BOUNDARY = /([a-z\d])([A-Z])/g;

/** 归一化为词元：先按驼峰/缩写边界切分，再按分隔符与字母-数字边界切分。 */
export function splitWords(input: string): string[] {
  const normalized = input
    .replace(ACRONYM_BOUNDARY, '$1 $2')
    .replace(WORD_BOUNDARY, '$1 $2')
    .replace(/([a-zA-Z])(\d)/g, '$1 $2')
    .replace(/(\d)([a-zA-Z])/g, '$1 $2');

  return normalized
    .split(SEPARATORS)
    .flatMap((chunk) => chunk.split(SEPARATORS))
    .filter((word) => word.length > 0);
}

function capitalize(word: string): string {
  if (word.length === 0) return word;
  return word[0].toUpperCase() + word.slice(1).toLowerCase();
}

export type CaseStyle =
  | 'camel'
  | 'pascal'
  | 'snake'
  | 'constant'
  | 'kebab'
  | 'dot'
  | 'path'
  | 'space'
  | 'title'
  | 'sentence'
  | 'train'
  | 'alternating'
  | 'inverse'
  | 'upper'
  | 'lower';

export const CASE_STYLES: { value: CaseStyle; label: string; example: string }[] = [
  { value: 'camel', label: 'camelCase', example: 'userProfileName' },
  { value: 'pascal', label: 'PascalCase', example: 'UserProfileName' },
  { value: 'snake', label: 'snake_case', example: 'user_profile_name' },
  { value: 'constant', label: 'CONSTANT_CASE', example: 'USER_PROFILE_NAME' },
  { value: 'kebab', label: 'kebab-case', example: 'user-profile-name' },
  { value: 'dot', label: 'dot.case', example: 'user.profile.name' },
  { value: 'path', label: 'path/case', example: 'user/profile/name' },
  { value: 'space', label: 'space case', example: 'user profile name' },
  { value: 'title', label: 'Title Case', example: 'User Profile Name' },
  { value: 'sentence', label: 'Sentence case', example: 'User profile name' },
  { value: 'train', label: 'Train-Case', example: 'User-Profile-Name' },
  { value: 'alternating', label: 'aLtErNaTiNg', example: 'aLtErNaTiNg' },
  { value: 'inverse', label: 'iNVERSE cASE', example: 'iNVERSE cASE' },
  { value: 'upper', label: 'UPPERCASE', example: 'USER PROFILE NAME' },
  { value: 'lower', label: 'lowercase', example: 'user profile name' },
];

export function convertCase(input: string, style: CaseStyle): string {
  const words = splitWords(input);
  if (words.length === 0) return '';

  switch (style) {
    case 'camel':
      return words.map((word, i) => (i === 0 ? word.toLowerCase() : capitalize(word))).join('');
    case 'pascal':
      return words.map(capitalize).join('');
    case 'snake':
      return words.map((w) => w.toLowerCase()).join('_');
    case 'constant':
      return words.map((w) => w.toUpperCase()).join('_');
    case 'kebab':
      return words.map((w) => w.toLowerCase()).join('-');
    case 'dot':
      return words.map((w) => w.toLowerCase()).join('.');
    case 'path':
      return words.map((w) => w.toLowerCase()).join('/');
    case 'space':
      return words.map((w) => w.toLowerCase()).join(' ');
    case 'title':
      return words.map(capitalize).join(' ');
    case 'sentence':
      return words.map((word, i) => (i === 0 ? capitalize(word.toLowerCase()) : word.toLowerCase())).join(' ');
    case 'train':
      return words.map(capitalize).join('-');
    case 'alternating':
      return words.map((word, i) => (i % 2 === 0 ? word.toLowerCase() : word.toUpperCase())).join('');
    case 'upper':
      return words.join(' ').toUpperCase();
    case 'lower':
      return words.join(' ').toLowerCase();
    case 'inverse':
      return Array.from(words.join(' '))
        .map((char) => (char === char.toLowerCase() ? char.toUpperCase() : char.toLowerCase()))
        .join('');
  }
}

/** 一次输出全部常见风格，方便对照。 */
export function convertAll(input: string): { style: CaseStyle; label: string; value: string }[] {
  return CASE_STYLES.map(({ value, label }) => ({ style: value, label, value: convertCase(input, value) }));
}
