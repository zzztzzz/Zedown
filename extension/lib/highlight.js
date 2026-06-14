/* highlight.js — self-contained, dependency-free syntax highlighter.
   Exposes globalThis.mdHighlight(code, lang) -> safe HTML string.
   Wraps tokens in <span class="tok-X"> where X is one of:
   kw,str,num,com,fn,builtin,attr,tag,prop,punct,op,var.
   ALL text is HTML-escaped. Unknown/empty lang -> escaped code unchanged.
   Classic script: attaches to globalThis so SW (importScripts) + pages work. */
(function () {
  function esc(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }
  function span(cls, text) {
    return '<span class="tok-' + cls + '">' + esc(text) + '</span>';
  }

  // Language alias resolution → canonical key.
  const ALIASES = {
    js: 'js', javascript: 'js', jsx: 'js', mjs: 'js', cjs: 'js',
    ts: 'ts', typescript: 'ts', tsx: 'ts',
    json: 'json', json5: 'json',
    html: 'html', xml: 'html', htm: 'html', svg: 'html', vue: 'html',
    css: 'css', scss: 'css', less: 'css',
    bash: 'bash', sh: 'bash', shell: 'bash', zsh: 'bash', console: 'bash',
    python: 'python', py: 'python', python3: 'python',
    http: 'http',
    md: 'md', markdown: 'md', mdown: 'md',
    sql: 'sql', mysql: 'sql', postgres: 'sql', postgresql: 'sql', sqlite: 'sql',
  };

  // ---- generic regex-rule tokenizer ----
  // rules: ordered [{re, cls}|{re, fn(match)->html}]. First match at pos wins.
  // Any text not consumed by a rule is escaped verbatim.
  function tokenize(code, rules) {
    let out = '';
    let i = 0;
    const n = code.length;
    outer:
    while (i < n) {
      for (let r = 0; r < rules.length; r++) {
        const rule = rules[r];
        rule.re.lastIndex = i;
        const m = rule.re.exec(code);
        if (m && m.index === i && m[0].length > 0) {
          if (rule.fn) out += rule.fn(m);
          else out += span(rule.cls, m[0]);
          i += m[0].length;
          continue outer;
        }
      }
      out += esc(code[i]);
      i++;
    }
    return out;
  }

  function words(arr) {
    return new RegExp('\\b(?:' + arr.join('|') + ')\\b', 'y');
  }

  // ---------------- JS / TS ----------------
  const JS_KW = ['break','case','catch','class','const','continue','debugger',
    'default','delete','do','else','export','extends','finally','for','function',
    'if','import','in','instanceof','new','return','super','switch','this','throw',
    'try','typeof','var','void','while','with','yield','let','static','async','await',
    'of','get','set'];
  const TS_KW = JS_KW.concat(['interface','type','enum','implements','public','private',
    'protected','readonly','abstract','namespace','declare','as','is','keyof','infer',
    'satisfies','override','module']);
  const JS_LIT = ['true','false','null','undefined','NaN','Infinity'];
  const JS_BUILTIN = ['console','Math','JSON','Object','Array','String','Number',
    'Boolean','Symbol','Promise','Map','Set','WeakMap','WeakSet','Date','RegExp',
    'Error','document','window','globalThis','Reflect','Proxy','BigInt','parseInt',
    'parseFloat','isNaN','setTimeout','setInterval','require'];

  function jsRules(kw) {
    return [
      { re: /\/\/[^\n]*/y, cls: 'com' },
      { re: /\/\*[\s\S]*?\*\//y, cls: 'com' },
      { re: /`(?:\\[\s\S]|\$\{[^}]*\}|[^`\\])*`/y, cls: 'str' },
      { re: /"(?:\\.|[^"\\\n])*"/y, cls: 'str' },
      { re: /'(?:\\.|[^'\\\n])*'/y, cls: 'str' },
      { re: /\b0[xX][0-9a-fA-F]+\b|\b\d+(?:\.\d+)?(?:[eE][+-]?\d+)?n?\b/y, cls: 'num' },
      { re: words(JS_LIT), cls: 'builtin' },
      { re: words(kw), cls: 'kw' },
      { re: words(JS_BUILTIN), cls: 'builtin' },
      { re: /[A-Za-z_$][\w$]*(?=\s*\()/y, cls: 'fn' },
      { re: /[A-Za-z_$][\w$]*/y, cls: 'var' },
      { re: /[+\-*/%=<>!&|^~?:]+/y, cls: 'op' },
      { re: /[{}()[\];,.]/y, cls: 'punct' },
      { re: /\s+/y, fn: function (m) { return esc(m[0]); } },
    ];
  }

  // ---------------- JSON ----------------
  const JSON_RULES = [
    { re: /\/\/[^\n]*/y, cls: 'com' },
    { re: /"(?:\\.|[^"\\])*"(?=\s*:)/y, cls: 'prop' },
    { re: /"(?:\\.|[^"\\])*"/y, cls: 'str' },
    { re: /-?\b\d+(?:\.\d+)?(?:[eE][+-]?\d+)?\b/y, cls: 'num' },
    { re: /\b(?:true|false|null)\b/y, cls: 'builtin' },
    { re: /[{}[\]:,]/y, cls: 'punct' },
    { re: /\s+/y, fn: function (m) { return esc(m[0]); } },
  ];

  // ---------------- HTML / XML ----------------
  function htmlHighlight(code) {
    // Handle tags, attributes, comments; escape everything else.
    let out = '';
    let i = 0;
    const n = code.length;
    const tagRe = /<\/?[A-Za-z][\w:-]*|<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<!DOCTYPE[^>]*>|>|\/>/y;
    const attrRe = /([A-Za-z_:][\w:.-]*)(\s*=\s*)("(?:[^"]*)"|'(?:[^']*)'|[^\s">]+)?/y;
    let inTag = false;
    while (i < n) {
      if (!inTag) {
        const lt = code.indexOf('<', i);
        if (lt === -1) { out += esc(code.slice(i)); break; }
        if (lt > i) out += esc(code.slice(i, lt));
        i = lt;
        tagRe.lastIndex = i;
        const m = tagRe.exec(code);
        if (m && m.index === i) {
          if (m[0].slice(0, 4) === '<!--' || m[0].slice(0, 2) === '<!') {
            out += span('com', m[0]);
            i += m[0].length;
            continue;
          }
          out += span('punct', m[0].slice(0, m[0][1] === '/' ? 2 : 1))
            + span('tag', m[0].replace(/^<\/?/, ''));
          i += m[0].length;
          inTag = true;
          continue;
        }
        out += esc('<');
        i++;
      } else {
        // inside a tag: consume attrs until > or />
        const ws = /\s+/y; ws.lastIndex = i;
        const wm = ws.exec(code);
        if (wm && wm.index === i) { out += esc(wm[0]); i += wm[0].length; continue; }
        if (code[i] === '>' || (code[i] === '/' && code[i + 1] === '>')) {
          const tok = code[i] === '>' ? '>' : '/>';
          out += span('punct', tok);
          i += tok.length;
          inTag = false;
          continue;
        }
        attrRe.lastIndex = i;
        const am = attrRe.exec(code);
        if (am && am.index === i && am[0].length) {
          out += span('attr', am[1]);
          if (am[2]) out += span('op', am[2]);
          if (am[3]) out += span('str', am[3]);
          i += am[0].length;
          continue;
        }
        out += esc(code[i]);
        i++;
      }
    }
    return out;
  }

  // ---------------- CSS ----------------
  const CSS_RULES = [
    { re: /\/\*[\s\S]*?\*\//y, cls: 'com' },
    { re: /@[\w-]+/y, cls: 'kw' },
    { re: /"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/y, cls: 'str' },
    { re: /#[0-9a-fA-F]{3,8}\b/y, cls: 'num' },
    { re: /-?\b\d+(?:\.\d+)?(?:px|em|rem|%|vh|vw|s|ms|deg|fr|ch|ex|pt|cm|mm|vmin|vmax)?\b/y, cls: 'num' },
    { re: /[.#][A-Za-z_][\w-]*/y, cls: 'fn' },
    { re: /&|::?[A-Za-z-]+/y, cls: 'builtin' },
    { re: /([A-Za-z-][\w-]*)(?=\s*:)/y, cls: 'prop' },
    { re: /[A-Za-z_-][\w-]*(?=\s*\()/y, cls: 'fn' },
    { re: /[A-Za-z_-][\w-]*/y, cls: 'var' },
    { re: /[{}();:,]/y, cls: 'punct' },
    { re: /[>+~*=]/y, cls: 'op' },
    { re: /\s+/y, fn: function (m) { return esc(m[0]); } },
  ];

  // ---------------- bash / sh ----------------
  const BASH_KW = ['if','then','else','elif','fi','for','while','do','done','case',
    'esac','in','function','select','until','return','break','continue','local',
    'export','source','alias','set','unset','declare','readonly','shift','exit'];
  const BASH_BUILTIN = ['echo','cd','ls','pwd','cat','grep','sed','awk','curl','wget',
    'rm','cp','mv','mkdir','touch','chmod','chown','sudo','git','npm','node','npx',
    'yarn','docker','kill','ps','find','tar','make','python','pip','printf','read',
    'test','env','which'];
  const BASH_RULES = [
    { re: /#[^\n]*/y, cls: 'com' },
    { re: /"(?:\\.|\$\{[^}]*\}|\$\w+|[^"\\])*"/y, cls: 'str' },
    { re: /'[^']*'/y, cls: 'str' },
    { re: /\$\{[^}]*\}|\$\w+|\$[#@*?!$0-9]/y, cls: 'var' },
    { re: /\b\d+\b/y, cls: 'num' },
    { re: words(BASH_KW), cls: 'kw' },
    { re: words(BASH_BUILTIN), cls: 'builtin' },
    { re: /(?:^|(?<=\n))\s*[\w./-]+/y, cls: 'fn' },
    { re: /--?[A-Za-z][\w-]*/y, cls: 'attr' },
    { re: /[|&;<>()]+/y, cls: 'op' },
    { re: /[\w./@-]+/y, cls: 'var' },
    { re: /\s+/y, fn: function (m) { return esc(m[0]); } },
  ];

  // ---------------- python ----------------
  const PY_KW = ['False','None','True','and','as','assert','async','await','break',
    'class','continue','def','del','elif','else','except','finally','for','from',
    'global','if','import','in','is','lambda','nonlocal','not','or','pass','raise',
    'return','try','while','with','yield','match','case'];
  const PY_BUILTIN = ['print','len','range','int','str','float','bool','list','dict',
    'set','tuple','type','isinstance','enumerate','zip','map','filter','open','input',
    'sum','min','max','abs','round','sorted','reversed','super','self','cls','format',
    'object','Exception','staticmethod','classmethod','property'];
  const PY_RULES = [
    { re: /#[^\n]*/y, cls: 'com' },
    { re: /[rbfRBF]{0,2}"""[\s\S]*?"""|[rbfRBF]{0,2}'''[\s\S]*?'''/y, cls: 'str' },
    { re: /[rbfRBF]{0,2}"(?:\\.|[^"\\\n])*"|[rbfRBF]{0,2}'(?:\\.|[^'\\\n])*'/y, cls: 'str' },
    { re: /\b0[xX][0-9a-fA-F]+\b|\b\d+(?:\.\d+)?(?:[eE][+-]?\d+)?j?\b/y, cls: 'num' },
    { re: /@[A-Za-z_]\w*/y, cls: 'attr' },
    { re: words(PY_KW), cls: 'kw' },
    { re: words(PY_BUILTIN), cls: 'builtin' },
    { re: /[A-Za-z_]\w*(?=\s*\()/y, cls: 'fn' },
    { re: /[A-Za-z_]\w*/y, cls: 'var' },
    { re: /[+\-*/%=<>!&|^~:]+/y, cls: 'op' },
    { re: /[{}()[\];,.]/y, cls: 'punct' },
    { re: /\s+/y, fn: function (m) { return esc(m[0]); } },
  ];

  // ---------------- http ----------------
  function httpHighlight(code) {
    const lines = code.split('\n');
    let out = '';
    for (let li = 0; li < lines.length; li++) {
      const line = lines[li];
      let done = false;
      // request line: METHOD path HTTP/x
      const req = /^(GET|POST|PUT|DELETE|PATCH|HEAD|OPTIONS|TRACE|CONNECT)(\s+)(\S+)(\s+)(HTTP\/[\d.]+)\s*$/.exec(line);
      if (req) {
        out += span('kw', req[1]) + esc(req[2]) + span('fn', req[3])
          + esc(req[4]) + span('builtin', req[5]);
        done = true;
      }
      // status line
      if (!done) {
        const st = /^(HTTP\/[\d.]+)(\s+)(\d{3})(.*)$/.exec(line);
        if (st) {
          out += span('builtin', st[1]) + esc(st[2]) + span('num', st[3]) + esc(st[4]);
          done = true;
        }
      }
      // header line: Name: value
      if (!done) {
        const hdr = /^([A-Za-z][\w-]*)(:\s*)(.*)$/.exec(line);
        if (hdr) {
          out += span('attr', hdr[1]) + span('punct', hdr[2]) + span('str', hdr[3]);
          done = true;
        }
      }
      if (!done) out += esc(line);
      if (li < lines.length - 1) out += '\n';
    }
    return out;
  }

  // ---------------- markdown ----------------
  function mdHighlightLang(code) {
    const lines = code.split('\n');
    let out = '';
    for (let li = 0; li < lines.length; li++) {
      let line = lines[li];
      let m;
      if ((m = /^(#{1,6}\s.*)$/.exec(line))) {
        out += span('kw', m[1]);
      } else if ((m = /^(\s*([-*+]|\d+\.)\s)(.*)$/.exec(line))) {
        out += span('op', m[1]) + inlineMd(m[3]);
      } else if ((m = /^(\s*>.*)$/.exec(line))) {
        out += span('com', m[1]);
      } else if (/^\s*```/.test(line)) {
        out += span('punct', line);
      } else if (/^\s*([-*_])\s*(\1\s*){2,}\s*$/.test(line)) {
        out += span('punct', line);
      } else {
        out += inlineMd(line);
      }
      if (li < lines.length - 1) out += '\n';
    }
    return out;
  }
  function inlineMd(text) {
    return tokenize(text, [
      { re: /\*\*(?:[^*]|\*(?!\*))+\*\*|__[^_]+__/y, cls: 'kw' },
      { re: /\*[^*\n]+\*|_[^_\n]+_/y, cls: 'builtin' },
      { re: /`[^`\n]+`/y, cls: 'str' },
      { re: /\[[^\]]*\]\([^)]*\)/y, cls: 'fn' },
      { re: /\s+/y, fn: function (m) { return esc(m[0]); } },
      { re: /[^\s*_`[]+/y, fn: function (m) { return esc(m[0]); } },
    ]);
  }

  // ---------------- sql ----------------
  const SQL_KW = ['SELECT','FROM','WHERE','INSERT','INTO','VALUES','UPDATE','SET',
    'DELETE','CREATE','TABLE','ALTER','DROP','INDEX','VIEW','JOIN','INNER','LEFT',
    'RIGHT','FULL','OUTER','ON','AS','AND','OR','NOT','NULL','IS','IN','LIKE',
    'BETWEEN','GROUP','BY','ORDER','HAVING','LIMIT','OFFSET','DISTINCT','UNION',
    'ALL','PRIMARY','KEY','FOREIGN','REFERENCES','DEFAULT','UNIQUE','CONSTRAINT',
    'CASE','WHEN','THEN','ELSE','END','EXISTS','COUNT','SUM','AVG','MIN','MAX',
    'INT','INTEGER','VARCHAR','TEXT','BOOLEAN','DATE','TIMESTAMP','SERIAL','BIGINT',
    'ASC','DESC','WITH','RETURNING','IF','ADD','COLUMN','AUTO_INCREMENT'];
  const SQL_RE = new RegExp('\\b(?:' + SQL_KW.join('|') + ')\\b', 'iy');
  const SQL_RULES = [
    { re: /--[^\n]*/y, cls: 'com' },
    { re: /\/\*[\s\S]*?\*\//y, cls: 'com' },
    { re: /'(?:''|[^'])*'/y, cls: 'str' },
    { re: /"(?:[^"])*"|`(?:[^`])*`/y, cls: 'var' },
    { re: /\b\d+(?:\.\d+)?\b/y, cls: 'num' },
    { re: SQL_RE, cls: 'kw' },
    { re: /[A-Za-z_][\w]*(?=\s*\()/y, cls: 'fn' },
    { re: /[A-Za-z_][\w.]*/y, cls: 'var' },
    { re: /[*=<>!+\-/%|]+/y, cls: 'op' },
    { re: /[(),;.]/y, cls: 'punct' },
    { re: /\s+/y, fn: function (m) { return esc(m[0]); } },
  ];

  function mdHighlight(code, lang) {
    code = code == null ? '' : String(code);
    const key = ALIASES[String(lang || '').trim().toLowerCase()];
    if (!key) return esc(code);
    try {
      switch (key) {
        case 'js':     return tokenize(code, jsRules(JS_KW));
        case 'ts':     return tokenize(code, jsRules(TS_KW));
        case 'json':   return tokenize(code, JSON_RULES);
        case 'html':   return htmlHighlight(code);
        case 'css':    return tokenize(code, CSS_RULES);
        case 'bash':   return tokenize(code, BASH_RULES);
        case 'python': return tokenize(code, PY_RULES);
        case 'http':   return httpHighlight(code);
        case 'md':     return mdHighlightLang(code);
        case 'sql':    return tokenize(code, SQL_RULES);
        default:       return esc(code);
      }
    } catch (e) {
      return esc(code);
    }
  }

  globalThis.mdHighlight = mdHighlight;
})();
