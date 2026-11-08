import { describe, expect, test } from 'bun:test';
import { type Dataset, parseCsv, runLocalQuery, SQL_SUPPORTED_RANGE } from '../app/lib/local-query';

const USERS: Dataset = {
  users: [
    { id: 1, name: '张三', age: 28, city: '北京', active: true },
    { id: 2, name: '李四', age: 35, city: '上海', active: false },
    { id: 3, name: '王五', age: 22, city: '北京', active: true },
    { id: 4, name: '张小六', age: 41, city: '深圳', active: true },
    { id: 5, name: 'Alice', age: 30, city: '杭州', active: false },
  ],
};

const STAFF: Dataset = {
  员工: [
    { 姓名: '赵敏', 部门: '研发', 工龄: 3 },
    { 姓名: '周芷若', 部门: '市场', 工龄: 5 },
    { 姓名: '小昭', 部门: '研发', 工龄: 2 },
  ],
};

describe('runLocalQuery：SELECT / WHERE / ORDER BY / LIMIT', () => {
  test('SELECT * 返回全部列与行，列顺序稳定', () => {
    const result = runLocalQuery(USERS, 'SELECT * FROM users');
    expect(result.error).toBeNull();
    expect(result.columns).toEqual(['id', 'name', 'age', 'city', 'active']);
    expect(result.rows).toHaveLength(5);
    expect(result.rows[0]).toEqual([1, '张三', 28, '北京', true]);
  });

  test('列别名、ORDER BY DESC 与 LIMIT', () => {
    const result = runLocalQuery(USERS, 'SELECT name AS 姓名, age FROM users ORDER BY age DESC LIMIT 2');
    expect(result.error).toBeNull();
    expect(result.columns).toEqual(['姓名', 'age']);
    expect(result.rows).toEqual([
      ['张小六', 41],
      ['李四', 35],
    ]);
  });

  test('WHERE 数值条件、ORDER BY ASC、LIMIT 与 OFFSET', () => {
    const result = runLocalQuery(
      USERS,
      'SELECT name, age FROM users WHERE age >= 28 ORDER BY age ASC LIMIT 2 OFFSET 1',
    );
    expect(result.error).toBeNull();
    expect(result.rows).toEqual([
      ['Alice', 30],
      ['李四', 35],
    ]);
  });

  test('WHERE 括号与 AND / OR 优先级', () => {
    const result = runLocalQuery(USERS, "SELECT name FROM users WHERE (city = '北京' OR city = '上海') AND age > 25");
    expect(result.error).toBeNull();
    expect(result.rows).toEqual([['张三'], ['李四']]);
  });

  test('标识符不区分大小写，ORDER BY 可用列别名', () => {
    const result = runLocalQuery(USERS, 'SELECT name AS n FROM USERS ORDER BY n DESC LIMIT 2');
    expect(result.error).toBeNull();
    expect(result.columns).toEqual(['n']);
    expect(result.rows).toEqual([['王五'], ['李四']]);
  });
});

describe('runLocalQuery：数值与字符串比较、LIKE、中文列值', () => {
  test('字符串 = / != / <> 与中文值', () => {
    expect(runLocalQuery(USERS, "SELECT name FROM users WHERE city = '北京'").rows).toEqual([['张三'], ['王五']]);
    expect(runLocalQuery(USERS, "SELECT name FROM users WHERE name != '张三'").rows).toHaveLength(4);
    expect(runLocalQuery(USERS, "SELECT name FROM users WHERE city <> '北京'").rows).toHaveLength(3);
  });

  test('数值比较（> < >= <=）与反向操作数', () => {
    expect(runLocalQuery(USERS, 'SELECT name FROM users WHERE age > 30').rows).toEqual([['李四'], ['张小六']]);
    expect(runLocalQuery(USERS, 'SELECT name FROM users WHERE age <= 22').rows).toEqual([['王五']]);
    expect(runLocalQuery(USERS, 'SELECT name FROM users WHERE 30 < age').rows).toEqual([['李四'], ['张小六']]);
  });

  test('LIKE：中文前缀、% 与 _ 通配符、不区分大小写', () => {
    expect(runLocalQuery(USERS, "SELECT name FROM users WHERE name LIKE '张%'").rows).toEqual([['张三'], ['张小六']]);
    expect(runLocalQuery(USERS, "SELECT name FROM users WHERE name LIKE '张_'").rows).toEqual([['张三']]);
    expect(runLocalQuery(USERS, "SELECT name FROM users WHERE name LIKE 'a%'").rows).toEqual([['Alice']]);
    expect(runLocalQuery(USERS, "SELECT city FROM users WHERE city LIKE '%京%'").rows).toEqual([['北京'], ['北京']]);
  });

  test('中文列名、中文值与中文数据集名', () => {
    const result = runLocalQuery(STAFF, "SELECT 姓名 AS 名字, 工龄 FROM 员工 WHERE 部门 = '研发' ORDER BY 工龄 DESC");
    expect(result.error).toBeNull();
    expect(result.columns).toEqual(['名字', '工龄']);
    expect(result.rows).toEqual([
      ['赵敏', 3],
      ['小昭', 2],
    ]);
  });

  test('数值型字符串按数值比较', () => {
    const textData: Dataset = { rows: [{ code: '10' }, { code: '9' }, { code: '100' }] };
    expect(runLocalQuery(textData, "SELECT code FROM rows WHERE code > '9'").rows).toEqual([['10'], ['100']]);
  });
});

describe('runLocalQuery：COUNT(*) 与空结果', () => {
  test('COUNT(*) 默认列名、别名、WHERE 过滤与空数据集', () => {
    const all = runLocalQuery(USERS, 'SELECT COUNT(*) FROM users');
    expect(all.error).toBeNull();
    expect(all.columns).toEqual(['COUNT(*)']);
    expect(all.rows).toEqual([[5]]);

    const filtered = runLocalQuery(USERS, 'SELECT COUNT(*) AS 总数 FROM users WHERE age >= 30');
    expect(filtered.columns).toEqual(['总数']);
    expect(filtered.rows).toEqual([[3]]);

    const empty = runLocalQuery({ emptySet: [] }, 'SELECT COUNT(*) FROM emptySet');
    expect(empty.error).toBeNull();
    expect(empty.rows).toEqual([[0]]);
  });

  test('COUNT(*) 不能与普通列混用', () => {
    const result = runLocalQuery(USERS, 'SELECT COUNT(*), name FROM users');
    expect(result.error).not.toBeNull();
    expect(result.error).toContain('COUNT');
    expect(result.rows).toHaveLength(0);
  });

  test('合法查询命中 0 行时仍返回列名且 error 为 null', () => {
    const result = runLocalQuery(USERS, 'SELECT id, name FROM users WHERE age > 999');
    expect(result.error).toBeNull();
    expect(result.columns).toEqual(['id', 'name']);
    expect(result.rows).toHaveLength(0);
  });
});

describe('runLocalQuery：非法 SQL 中文降级与能力边界', () => {
  test('空 SQL 与不完整语句给出中文错误且不抛异常', () => {
    expect(() => runLocalQuery(USERS, '')).not.toThrow();
    const empty = runLocalQuery(USERS, '');
    expect(empty.error).not.toBeNull();
    expect(empty.columns).toHaveLength(0);
    expect(empty.rows).toHaveLength(0);

    const incomplete = runLocalQuery(USERS, 'SELECT * FROM');
    expect(incomplete.error).not.toBeNull();
    expect(incomplete.error).toContain('SELECT');
  });

  test('JOIN / 子查询 / 多表 / 事务给出明确中文边界提示', () => {
    const cases: [string, string][] = [
      ['SELECT * FROM users JOIN orders ON users.id = orders.id', 'JOIN'],
      ['SELECT * FROM (SELECT * FROM users) t', '子查询'],
      ['SELECT * FROM users, orders', '多表'],
      ['BEGIN; SELECT * FROM users; COMMIT;', '事务'],
    ];
    for (const [sql, keyword] of cases) {
      expect(() => runLocalQuery(USERS, sql)).not.toThrow();
      const result = runLocalQuery(USERS, sql);
      expect(result.error).not.toBeNull();
      expect(result.error).toContain(keyword);
      expect(result.error).toContain('单表 SELECT');
      expect(result.columns).toHaveLength(0);
      expect(result.rows).toHaveLength(0);
    }
    expect(SQL_SUPPORTED_RANGE).toContain('JOIN');
  });

  test('写入 / DDL / GROUP BY / DISTINCT 被拒绝', () => {
    const cases = [
      'DELETE FROM users',
      'DROP TABLE users',
      'SELECT * FROM users GROUP BY city',
      'SELECT DISTINCT name FROM users',
    ];
    for (const sql of cases) {
      const result = runLocalQuery(USERS, sql);
      expect(result.error).not.toBeNull();
      expect(result.rows).toHaveLength(0);
    }
  });

  test('未知数据集、未知列、非法 LIMIT、引号与括号错误均有中文原因', () => {
    const unknownTable = runLocalQuery(USERS, 'SELECT * FROM ghost');
    expect(unknownTable.error).toContain('不存在');
    expect(unknownTable.error).toContain('users');

    expect(runLocalQuery(USERS, 'SELECT agee FROM users').error).toContain('不存在');
    expect(runLocalQuery(USERS, 'SELECT * FROM users LIMIT -1').error).not.toBeNull();
    expect(runLocalQuery(USERS, 'SELECT * FROM users WHERE name = "张三"').error).toContain('单引号');
    expect(runLocalQuery(USERS, 'SELECT * FROM users WHERE (age > 20').error).not.toBeNull();
    expect(runLocalQuery(USERS, 'SELECT * FROM users WHERE age >').error).not.toBeNull();
  });

  test('非法数据集入参不抛异常', () => {
    expect(() => runLocalQuery(null as unknown as Dataset, 'SELECT * FROM users')).not.toThrow();
    const result = runLocalQuery(null as unknown as Dataset, 'SELECT * FROM users');
    expect(result.error).not.toBeNull();
    expect(result.error).toContain('数据集');
  });
});

describe('parseCsv：引号、转义与行尾', () => {
  test('引号字段内的逗号与转义双引号', () => {
    const csv = 'id,name,note\r\n1,"张,三","他说""你好"""\r\n2,李四,普通\r\n';
    const result = parseCsv(csv);
    expect(result.error).toBeNull();
    expect(result.columns).toEqual(['id', 'name', 'note']);
    expect(result.rows).toEqual([
      ['1', '张,三', '他说"你好"'],
      ['2', '李四', '普通'],
    ]);
  });

  test('引号字段内 CRLF 保留，行尾 CRLF 作为换行', () => {
    const result = parseCsv('a,b\r\n1,"第一行\r\n第二行"\r\n');
    expect(result.error).toBeNull();
    expect(result.rows).toEqual([['1', '第一行\r\n第二行']]);
  });

  test('BOM、空表头自动命名与重复表头去重', () => {
    const result = parseCsv('\ufeff,name,name\r\n1,张三,李四\r\n');
    expect(result.error).toBeNull();
    expect(result.columns).toEqual(['列1', 'name', 'name_2']);
    expect(result.rows).toEqual([['1', '张三', '李四']]);
  });

  test('空字段、行宽补齐与尾随空行', () => {
    const result = parseCsv('a,b,c\n1,,3\n\n');
    expect(result.error).toBeNull();
    expect(result.rows).toEqual([['1', '', '3']]);
  });

  test('仅表头时返回 0 行且 error 为 null', () => {
    const result = parseCsv('a,b,c');
    expect(result.error).toBeNull();
    expect(result.columns).toEqual(['a', 'b', 'c']);
    expect(result.rows).toHaveLength(0);
  });

  test('空文本与未闭合引号返回中文错误且不抛异常', () => {
    expect(() => parseCsv('')).not.toThrow();
    expect(parseCsv('').error).not.toBeNull();
    const broken = parseCsv('a,b\n1,"未闭合');
    expect(broken.error).toContain('未闭合');
    expect(broken.columns).toHaveLength(0);
  });

  test('引号字段后的多余字符给出原因', () => {
    const result = parseCsv('a,b\n1,"x"y');
    expect(result.error).toContain('多余字符');
  });
});
