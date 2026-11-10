/*
 * Coder Tools · 大文本后台处理内核
 *
 * 这是一个 classic worker：不加载外部脚本、不引用任何外部变量，也不把字符串
 * 当作代码执行。因此它可以作为普通静态资源随包发布，运行时由页面基址解析
 * 位置，完全不依赖打包器对 worker 路径的重写。
 *
 * 为什么不用 module worker / blob worker：
 *   - Web 版部署基址不固定（/ 或 /mirror/coder-tools/ 且带 #/tool/x hash），
 *     打包器生成的 worker chunk 地址若写成 /assets/... 会在子路径下 404；
 *   - Chrome 扩展 MV3 的 worker-src 只允许 self / none / wasm-unsafe-eval，
 *     不允许 blob:，且禁止把字符串当作代码执行。
 *   同源静态脚本是双端唯一都成立的形式。
 *
 * 协议：
 *   入 { id, task?, text, indent, minify, options? }
 *     task 缺省按 json 处理，保证旧调用与旧载荷兼容。
 *     task = json   | code | markup | lines | stats | codec
 *     indent 为 0..8 的空格数，-1 表示制表符。
 *     codec 用 options.mode，lines 用 trim / trimAll / removeEmpty /
 *     dedupe / sort / reverse，code 用 options.dialect = 'sql'。
 *   出 { id, ok, output?, error?, elapsedMs }
 *
 * 全部任务是字符串级单遍处理：不构建对象树、不做语法校验、不加载第三方
 * 解析器。小文件仍走主线程原有的完整语义链路，这里只服务大文件的降级路径。
 */
(function () {
  'use strict';

  function isSpace(code) {
    return code === 32 || code === 9 || code === 10 || code === 13 || code === 12 || code === 11 || code === 160;
  }

  function indentUnit(indent) {
    return indent === -1 ? '\t' : indent > 0 ? new Array(indent + 1).join(' ') : '';
  }

  function isWordChar(ch) {
    if (!ch) return false;
    var c = ch.charCodeAt(0);
    return (
      (c >= 48 && c <= 57) ||
      (c >= 65 && c <= 90) ||
      (c >= 97 && c <= 122) ||
      c === 95 ||
      c === 36 ||
      c > 127
    );
  }

  function makeSink(unit, minify) {
    var parts = [];
    var buf = '';
    var depth = 0;
    var pendingBreak = false;

    function pad() {
      return unit === '' ? '' : new Array(depth + 1).join(unit);
    }
    function flush() {
      if (buf !== '') {
        parts.push(buf);
        buf = '';
      }
    }
    return {
      emit: function (value) {
        if (pendingBreak) {
          flush();
          parts.push('\n' + pad());
          pendingBreak = false;
        }
        buf += value;
      },
      lineBreak: function () {
        if (minify) return;
        flush();
        pendingBreak = true;
      },
      open: function () {
        // 超深嵌套不再放大缩进字符串，避免畸形输入把内存吃满。
        if (depth < 200) depth += 1;
      },
      close: function () {
        if (depth > 0) depth -= 1;
      },
      finish: function () {
        flush();
        return parts.join('');
      },
    };
  }

  /** JSON / JSON5 结构重排：括号、逗号、冒号处换行，字符串与注释原样保留。 */
  function formatStream(text, indent, minify) {
    var len = text.length;
    var sink = makeSink(indentUnit(indent), minify);
    var i = 0;
    var quote = 0;
    var escaped = false;

    while (i < len) {
      var ch = text.charAt(i);
      var code = text.charCodeAt(i);

      if (quote !== 0) {
        sink.emit(ch);
        if (escaped) escaped = false;
        else if (ch === '\\') escaped = true;
        else if (code === quote) quote = 0;
        i += 1;
        continue;
      }

      if (code === 34 || code === 39) {
        quote = code;
        sink.emit(ch);
        i += 1;
        continue;
      }

      // 单行注释：保留到行尾，后面强制换行，避免吞掉下一行代码。
      if (ch === '/' && i + 1 < len && text.charAt(i + 1) === '/') {
        var lineEnd = i + 2;
        while (lineEnd < len && text.charCodeAt(lineEnd) !== 10 && text.charCodeAt(lineEnd) !== 13) lineEnd += 1;
        sink.emit(text.slice(i, lineEnd));
        i = lineEnd;
        sink.lineBreak();
        continue;
      }

      // 块注释：整体保留，不解析内部空白。
      if (ch === '/' && i + 1 < len && text.charAt(i + 1) === '*') {
        var close = text.indexOf('*/', i + 2);
        var blockEnd = close === -1 ? len : close + 2;
        sink.emit(text.slice(i, blockEnd));
        i = blockEnd;
        continue;
      }

      if (isSpace(code)) {
        i += 1;
        continue;
      }

      if (ch === '{' || ch === '[') {
        sink.emit(ch);
        sink.open();
        sink.lineBreak();
        i += 1;
        continue;
      }
      if (ch === '}' || ch === ']') {
        sink.close();
        sink.lineBreak();
        sink.emit(ch);
        i += 1;
        continue;
      }
      if (ch === ',') {
        sink.emit(ch);
        sink.lineBreak();
        i += 1;
        continue;
      }
      if (ch === ':') {
        sink.emit(ch);
        if (!minify) sink.emit(' ');
        i += 1;
        continue;
      }

      sink.emit(ch);
      i += 1;
    }

    return sink.finish();
  }

  /**
   * JS / CSS / SQL 的结构重排：括号、分号、逗号处换行，字符串与注释原样保留。
   * 不做关键字级排版、不解析正则字面量；SQL 方言额外识别 -- 行注释。
   */
  function formatCode(text, indent, minify, options) {
    var len = text.length;
    var sink = makeSink(indentUnit(indent), minify);
    var sql = options.dialect === 'sql';
    var i = 0;
    var quote = 0;
    var escaped = false;
    var mode = 0; // 0 正常，1 行注释，2 块注释

    while (i < len) {
      var ch = text.charAt(i);
      var code = text.charCodeAt(i);
      var next = i + 1 < len ? text.charAt(i + 1) : '';

      if (mode === 1) {
        if (code === 10 || code === 13) {
          mode = 0;
          sink.lineBreak();
        } else if (!minify) {
          sink.emit(ch);
        }
        i += 1;
        continue;
      }
      if (mode === 2) {
        if (ch === '*' && next === '/') {
          mode = 0;
          i += 2;
          if (!minify) sink.emit('*/');
        } else {
          if (!minify) sink.emit(ch);
          i += 1;
        }
        continue;
      }
      if (quote !== 0) {
        sink.emit(ch);
        if (escaped) escaped = false;
        else if (ch === '\\') escaped = true;
        else if (ch.charCodeAt(0) === quote) quote = 0;
        i += 1;
        continue;
      }
      // 注释标记本身必须保留，否则美化会把 `a // c` 变成 `a c`，
      // 更糟的是行注释会把后面的代码一起吞掉。压缩模式才丢弃整段注释。
      if (ch === '/' && next === '/') {
        mode = 1;
        i += 2;
        if (!minify) sink.emit('//');
        continue;
      }
      if (ch === '/' && next === '*') {
        mode = 2;
        i += 2;
        if (!minify) sink.emit('/*');
        continue;
      }
      if (sql && ch === '-' && next === '-') {
        mode = 1;
        i += 2;
        if (!minify) sink.emit('--');
        continue;
      }
      if (ch === '"' || ch === "'" || ch === '`') {
        quote = ch.charCodeAt(0);
        sink.emit(ch);
        i += 1;
        continue;
      }
      if (isSpace(code)) {
        // 代码不能像 JSON 那样丢掉所有空白：相邻标识符之间必须留一个空格，
        // 否则 `SELECT a FROM b` 会被粘成 `SELECTaFROMb`。美化模式保留一个
        // 空格，压缩模式只在两个标识符之间保留；结构符号后的空白由换行接管。
        var cursor = i;
        while (cursor < len && isSpace(text.charCodeAt(cursor))) cursor += 1;
        var before = i > 0 ? text.charAt(i - 1) : '';
        var after = cursor < len ? text.charAt(cursor) : '';
        var structural =
          before === '{' ||
          before === '[' ||
          before === '(' ||
          before === ',' ||
          before === ';' ||
          before === ':';
        if (!structural && (!minify || (isWordChar(before) && isWordChar(after)))) sink.emit(' ');
        i = cursor;
        continue;
      }
      if (ch === '{' || ch === '[' || ch === '(') {
        sink.emit(ch);
        sink.open();
        sink.lineBreak();
        i += 1;
        continue;
      }
      if (ch === '}' || ch === ']' || ch === ')') {
        sink.close();
        sink.lineBreak();
        sink.emit(ch);
        i += 1;
        continue;
      }
      if (ch === ';') {
        sink.emit(ch);
        sink.lineBreak();
        i += 1;
        continue;
      }
      if (ch === ',') {
        sink.emit(ch);
        sink.lineBreak();
        i += 1;
        continue;
      }
      sink.emit(ch);
      i += 1;
    }

    return sink.finish();
  }

  /**
   * HTML / XML 的标签级缩进。文本节点首尾空白会被规整，压缩模式折叠连续空白；
   * 不解析 DTD、不校验嵌套，pre / textarea 内的空白以小文件完整解析为准。
   */
  function formatMarkup(text, indent, minify) {
    var len = text.length;
    var sink = makeSink(indentUnit(indent), minify);
    var i = 0;
    var voidTags = /^<(br|hr|img|input|meta|link|area|base|col|embed|source|track|wbr|param)\b/i;

    while (i < len) {
      if (text.charAt(i) !== '<') {
        var end = text.indexOf('<', i);
        if (end === -1) end = len;
        var chunk = text.slice(i, end);
        if (minify) chunk = chunk.replace(/\s+/g, ' ');
        else chunk = chunk.replace(/^\s+|\s+$/g, '');
        if (chunk !== '' && chunk !== ' ') sink.emit(chunk);
        i = end;
        continue;
      }

      var start = i;
      var tag = '';
      var isComment = text.slice(i, i + 4) === '<!--';
      var isCdata = text.slice(i, i + 9) === '<![CDATA[';
      var closeAt = -1;
      if (isComment) closeAt = text.indexOf('-->', i + 4);
      else if (isCdata) closeAt = text.indexOf(']]>', i + 9);
      else {
        var j = i + 1;
        var quote = 0;
        while (j < len) {
          var c = text.charAt(j);
          if (quote !== 0) {
            if (c === quote) quote = 0;
          } else if (c === '"' || c === "'") quote = c;
          else if (c === '>') break;
          j += 1;
        }
        closeAt = j < len ? j : -1;
      }
      if (closeAt === -1) {
        tag = text.slice(start);
        i = len;
      } else if (isComment) {
        tag = text.slice(start, closeAt + 3);
        i = closeAt + 3;
      } else if (isCdata) {
        tag = text.slice(start, closeAt + 3);
        i = closeAt + 3;
      } else {
        tag = text.slice(start, closeAt + 1);
        i = closeAt + 1;
      }

      var isClose = /^<\//.test(tag);
      var isDecl = /^<[!?]/.test(tag) || isComment || isCdata;
      var isSelf = /\/>$/.test(tag) || voidTags.test(tag);
      if (isClose) sink.close();
      // 只在标签前换行；标签后再换行会把 <a>1</a> 拆成三段。
      if (!isDecl) sink.lineBreak();
      sink.emit(tag);
      if (!isClose && !isDecl && !isSelf) sink.open();
    }

    return sink.finish();
  }

  /** 行级规整：去行尾空白、去空行、去重、排序、反转。统一换行符为 LF。 */
  function processLines(text, options) {
    var lines = text.replace(/\r\n?/g, '\n').split('\n');
    var seen = options.dedupe ? Object.create(null) : null;
    var out = [];
    for (var i = 0; i < lines.length; i += 1) {
      var line = lines[i];
      if (options.trimAll) line = line.replace(/^\s+|\s+$/g, '');
      else if (options.trim) line = line.replace(/[ \t]+$/, '');
      if (options.removeEmpty && line === '') continue;
      if (seen !== null) {
        if (Object.prototype.hasOwnProperty.call(seen, line)) continue;
        seen[line] = true;
      }
      out.push(line);
    }
    if (options.sort) out.sort();
    if (options.reverse) out.reverse();
    return out.join('\n');
  }

  /** 文本统计：单遍扫描，词表上限 5000 个不同词，避免大文件内存放大。 */
  function textStats(text) {
    var len = text.length;
    var lines = 1;
    var words = 0;
    var nonSpace = 0;
    var inWord = false;
    var word = '';
    var table = Object.create(null);
    var tableSize = 0;
    var MAX_WORDS = 5000;

    function pushWord(value) {
      words += 1;
      if (tableSize >= MAX_WORDS || value.length > 64) return;
      if (Object.prototype.hasOwnProperty.call(table, value)) table[value] += 1;
      else {
        table[value] = 1;
        tableSize += 1;
      }
    }

    for (var i = 0; i < len; i += 1) {
      var ch = text.charAt(i);
      var code = text.charCodeAt(i);
      if (code === 10) lines += 1;
      if (isSpace(code)) {
        if (inWord) {
          pushWord(word);
          word = '';
          inWord = false;
        }
        continue;
      }
      nonSpace += 1;
      inWord = true;
      if (word.length <= 64) word += ch;
    }
    if (inWord) pushWord(word);

    var top = [];
    for (var key in table) {
      if (Object.prototype.hasOwnProperty.call(table, key)) top.push({ word: key, count: table[key] });
    }
    top.sort(function (a, b) {
      return b.count - a.count;
    });
    var bytes = -1;
    try {
      bytes = new TextEncoder().encode(text).length;
    } catch (error) {
      bytes = -1;
    }
    return JSON.stringify({
      chars: len,
      lines: lines,
      words: words,
      bytes: bytes,
      nonWhitespaceChars: nonSpace,
      distinctWords: tableSize,
      topWords: top.slice(0, 20),
    });
  }

  var HTML_ENTITIES = {
    amp: '&',
    lt: '<',
    gt: '>',
    quot: '"',
    apos: "'",
    nbsp: ' ',
  };

  function encodeEntities(text, mode) {
    var named = mode === 'encode-all';
    var map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
    var out = '';
    for (var i = 0; i < text.length; i += 1) {
      var ch = text.charAt(i);
      if (Object.prototype.hasOwnProperty.call(map, ch)) out += map[ch];
      else if (named && ch.charCodeAt(0) > 127) out += '&#' + ch.charCodeAt(0) + ';';
      else out += ch;
    }
    return out;
  }

  function decodeEntities(text) {
    return text.replace(/&(#x[0-9a-fA-F]+|#[0-9]+|[a-zA-Z]+);/g, function (all, entity) {
      var lower = entity.toLowerCase();
      if (Object.prototype.hasOwnProperty.call(HTML_ENTITIES, lower)) return HTML_ENTITIES[lower];
      if (entity.charAt(0) === '#') {
        var codePoint =
          entity.charAt(1) === 'x' || entity.charAt(1) === 'X'
            ? parseInt(entity.slice(2), 16)
            : parseInt(entity.slice(1), 10);
        if (Number.isFinite(codePoint) && codePoint >= 0 && codePoint <= 0x10ffff) {
          return String.fromCodePoint(codePoint);
        }
      }
      return all;
    });
  }

  /** 纯字符串编解码：Base64（UTF-8 安全）、HTML 实体、URL 百分号编码。 */
  function runCodec(text, mode) {
    if (mode === 'base64-encode') {
      var bytes = new TextEncoder().encode(text);
      var binary = '';
      for (var i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
      return btoa(binary);
    }
    if (mode === 'base64-decode') {
      var raw = atob(text.replace(/\s+/g, ''));
      var buffer = new Uint8Array(raw.length);
      for (var j = 0; j < raw.length; j += 1) buffer[j] = raw.charCodeAt(j);
      return new TextDecoder().decode(buffer);
    }
    if (mode === 'html-encode') return encodeEntities(text, 'basic');
    if (mode === 'html-encode-all') return encodeEntities(text, 'encode-all');
    if (mode === 'html-decode') return decodeEntities(text);
    if (mode === 'url-encode') return encodeURIComponent(text);
    if (mode === 'url-decode') return decodeURIComponent(text);
    throw new Error('未知编解码模式：' + mode);
  }

  function dispatch(text, indent, minify, task, options) {
    if (task === 'json') return formatStream(text, indent, minify);
    if (task === 'code') return formatCode(text, indent, minify, options);
    if (task === 'markup') return formatMarkup(text, indent, minify);
    if (task === 'lines') return processLines(text, options);
    if (task === 'stats') return textStats(text);
    if (task === 'codec') return runCodec(text, options.mode || 'base64-encode');
    throw new Error('未知后台任务：' + task);
  }

  self.onmessage = function (event) {
    var data = event.data || {};
    var id = data.id;
    var started = Date.now();
    try {
      var text = typeof data.text === 'string' ? data.text : String(data.text || '');
      var indent = Number(data.indent);
      if (!Number.isFinite(indent)) indent = 2;
      var task = typeof data.task === 'string' ? data.task : 'json';
      var options = data.options && typeof data.options === 'object' ? data.options : {};
      var output = dispatch(text, indent, Boolean(data.minify), task, options);
      self.postMessage({ id: id, ok: true, output: output, elapsedMs: Date.now() - started });
    } catch (error) {
      self.postMessage({
        id: id,
        ok: false,
        error: error && error.message ? error.message : String(error),
        elapsedMs: Date.now() - started,
      });
    }
  };
})();
