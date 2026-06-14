/* themes.js — three visual directions for the Markdown extension.
   window.MD_THEMES: array of {id,label,desc} for the picker.
   window.MD_TOKENS[id]: tokens used for chrome (inline styles).
   window.MD_PROSE_CSS: CSS string styling rendered markdown (.prose) per theme. */
(function () {
  const THEMES = [
    { id: 'paper',    label: 'Paper',    desc: '暖调纸感 · 衬线标题 · 陶土橙' },
    { id: 'midnight', label: 'Midnight', desc: '深色开发者 · 等宽点缀 · 薄荷绿' },
    { id: 'indigo',   label: 'Indigo',   desc: '清爽 SaaS · 圆角 · 靛蓝' },
  ];

  const TOKENS = {
    paper: {
      app: '#ece7db', surface: '#fbf8f1', surface2: '#f3eee3',
      border: '#e2dac9', borderStrong: '#d4cab4',
      text: '#2b2722', muted: '#8a8275', faint: '#aaa294',
      accent: 'oklch(0.62 0.13 48)', accentText: '#fff',
      accentSoft: 'oklch(0.95 0.04 60)',
      codeBg: '#f1ebdd', codeText: '#7a4a2e',
      fontUI: "'Public Sans', system-ui, sans-serif",
      fontHead: "'Spectral', Georgia, serif",
      fontMono: "'JetBrains Mono', ui-monospace, monospace",
      radius: 9, shadow: '0 1px 2px rgba(60,50,30,.06)',
    },
    midnight: {
      app: '#06080c', surface: '#11161d', surface2: '#0c1117',
      border: '#222b36', borderStrong: '#2f3a48',
      text: '#e6edf3', muted: '#7d8896', faint: '#56616f',
      accent: 'oklch(0.78 0.16 158)', accentText: '#06140c',
      accentSoft: 'oklch(0.3 0.06 158)',
      codeBg: '#0a0e13', codeText: '#7ee2b8',
      fontUI: "'Public Sans', system-ui, sans-serif",
      fontHead: "'JetBrains Mono', ui-monospace, monospace",
      fontMono: "'JetBrains Mono', ui-monospace, monospace",
      radius: 7, shadow: '0 1px 2px rgba(0,0,0,.4)',
    },
    indigo: {
      app: '#eef0f4', surface: '#ffffff', surface2: '#f6f7f9',
      border: '#e6e8ee', borderStrong: '#d4d8e2',
      text: '#1a1d24', muted: '#6b7280', faint: '#9aa1ad',
      accent: 'oklch(0.55 0.18 277)', accentText: '#fff',
      accentSoft: 'oklch(0.95 0.03 277)',
      codeBg: '#f4f5f9', codeText: '#5b46c9',
      fontUI: "'Public Sans', system-ui, sans-serif",
      fontHead: "'Public Sans', system-ui, sans-serif",
      fontMono: "'JetBrains Mono', ui-monospace, monospace",
      radius: 12, shadow: '0 1px 3px rgba(30,40,80,.08)',
    },
  };

  // syntax-token palettes per theme (for <span class="tok-X"> from highlight.js).
  const TOK = {
    paper: {
      kw: '#9c4221', str: '#6b7a2e', num: '#9a6a1a', com: '#a39684',
      fn: '#1d6b8a', builtin: '#8a5a2b', attr: '#7a5cae', tag: '#9c4221',
      prop: '#1d6b8a', op: '#8a8275', var: '#3a352e',
    },
    midnight: {
      kw: '#7ee2b8', str: '#a6e22e', num: '#fd9353', com: '#5b6673',
      fn: '#67d4ff', builtin: '#c792ea', attr: '#ffcb6b', tag: '#7ee2b8',
      prop: '#67d4ff', op: '#89ddff', var: '#e6edf3',
    },
    indigo: {
      kw: '#5b46c9', str: '#0a8554', num: '#b3590a', com: '#9aa1ad',
      fn: '#1f6feb', builtin: '#8250df', attr: '#953800', tag: '#5b46c9',
      prop: '#1f6feb', op: '#6b7280', var: '#1a1d24',
    },
  };

  // prose styles per theme — applied to elements with class theme-<id> .prose
  function prose(id) {
    const t = TOKENS[id];
    const k = TOK[id];
    const s = '.theme-' + id + ' .prose';
    return `
${s}{color:${t.text};font-family:${t.fontUI};line-height:1.7;font-size:15px;word-wrap:break-word;}
${s} h1,${s} h2,${s} h3,${s} h4{font-family:${t.fontHead};color:${t.text};line-height:1.25;margin:1.4em 0 .55em;font-weight:600;}
${s} h1{font-size:1.85em;margin-top:0;${id==='midnight'?'letter-spacing:-.01em;':''}}
${s} h2{font-size:1.4em;padding-bottom:.28em;border-bottom:1px solid ${t.border};}
${s} h3{font-size:1.16em;}
${s} h4{font-size:1em;color:${t.muted};}
${s} p{margin:.7em 0;}
${s} a{color:${t.accent};text-decoration:none;border-bottom:1px solid color-mix(in oklch, ${t.accent} 35%, transparent);}
${s} a:hover{border-bottom-color:${t.accent};}
${s} strong{font-weight:700;color:${t.text};}
${s} ul,${s} ol{margin:.6em 0;padding-left:1.5em;}
${s} li{margin:.28em 0;}
${s} li.task{list-style:none;margin-left:-1.3em;}
${s} li.task input{margin-right:.5em;accent-color:${t.accent};}
${s} blockquote{margin:.9em 0;padding:.5em 1em;border-left:3px solid ${t.accent};background:${t.accentSoft};color:${t.muted};border-radius:0 ${t.radius/2}px ${t.radius/2}px 0;}
${s} blockquote p{margin:.3em 0;}
${s} code{font-family:${t.fontMono};font-size:.86em;background:${t.codeBg};color:${t.codeText};padding:.12em .4em;border-radius:5px;}
${s} pre{background:${t.codeBg};border:1px solid ${t.border};border-radius:${t.radius}px;padding:14px 16px;overflow:auto;margin:.9em 0;position:relative;}
${s} pre code{background:none;color:${t.text};padding:0;font-size:.82em;line-height:1.6;}
${s} pre code[data-lang]::before{content:attr(data-lang);position:absolute;top:8px;right:12px;font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:${t.faint};}
${s} hr{border:none;border-top:1px solid ${t.border};margin:1.6em 0;}
${s} img{max-width:100%;border-radius:${t.radius}px;}
${s} table{border-collapse:collapse;width:100%;margin:1em 0;font-size:.9em;}
${s} th,${s} td{border:1px solid ${t.border};padding:7px 11px;text-align:left;}
${s} th{background:${t.surface2};font-weight:600;}
${s} tbody tr:nth-child(even){background:color-mix(in oklch, ${t.surface2} 50%, transparent);}
${s} .tok-kw{color:${k.kw};}
${s} .tok-str{color:${k.str};}
${s} .tok-num{color:${k.num};}
${s} .tok-com{color:${k.com};font-style:italic;}
${s} .tok-fn{color:${k.fn};}
${s} .tok-builtin{color:${k.builtin};}
${s} .tok-attr{color:${k.attr};}
${s} .tok-tag{color:${k.tag};}
${s} .tok-prop{color:${k.prop};}
${s} .tok-op{color:${k.op};}
${s} .tok-var{color:${k.var};}
${s} .tok-punct{color:${t.muted};}
${s} pre{position:relative;}
${s} .md-copy-btn{position:absolute;top:7px;right:8px;z-index:2;font:inherit;font-size:11px;line-height:1;padding:4px 8px;border-radius:6px;border:1px solid ${t.border};background:${t.surface};color:${t.muted};cursor:pointer;opacity:0;transition:opacity .15s,color .15s,border-color .15s;}
${s} pre:hover .md-copy-btn{opacity:1;}
${s} .md-copy-btn:hover{color:${t.text};border-color:${t.borderStrong};}
${s} .md-copy-btn.copied{color:${t.accent};border-color:${t.accent};}
${s} pre code[data-lang]::before{right:64px;}
${s} .footnotes{font-size:.85em;color:${t.muted};margin-top:2em;}
${s} .footnotes hr{margin:1em 0;border-top:1px solid ${t.border};}
${s} .footnotes ol{padding-left:1.4em;}
${s} .footnotes li{margin:.3em 0;}
${s} .footnotes li:target{background:${t.accentSoft};border-radius:${t.radius/2}px;}
${s} .fn-ref{font-size:.75em;line-height:0;}
${s} .fn-ref a{color:${t.accent};text-decoration:none;border:none;padding:0 1px;}
${s} .fn-back{margin-left:.4em;color:${t.accent};text-decoration:none;border:none;}
${s} h1,${s} h2,${s} h3{scroll-margin-top:1em;}
${s} .md-anchor{margin-left:.4em;color:${t.faint};text-decoration:none;border:none;font-weight:400;opacity:0;transition:opacity .15s,color .15s;}
${s} h1:hover .md-anchor,${s} h2:hover .md-anchor,${s} h3:hover .md-anchor{opacity:1;}
${s} .md-anchor:hover{color:${t.accent};}
${s} .md-math-display{overflow-x:auto;margin:1em 0;text-align:center;}
${s} .md-mermaid{margin:1em 0;text-align:center;}
${s} .md-mermaid svg{max-width:100%;height:auto;}
${s} .md-mermaid-src{display:block;background:${t.codeBg};border:1px solid ${t.border};border-radius:${t.radius}px;padding:14px 16px;overflow:auto;text-align:left;font-family:${t.fontMono};font-size:.82em;color:${t.text};white-space:pre;}
${s} .md-mermaid[data-rendered] .md-mermaid-src{display:none;}
${s} .md-mermaid-error{border:1px solid color-mix(in oklch, ${t.accent} 45%, ${t.border});border-radius:${t.radius}px;}
${s} .md-mermaid-error .md-mermaid-src{border-color:transparent;}
`;
  }

  // Publish on globalThis (== window on pages) so SW-safe consumers like
  // export.js resolve the contract's globalThis.MD_* names literally.
  globalThis.MD_THEMES = THEMES;
  globalThis.MD_TOKENS = TOKENS;
  globalThis.MD_PROSE_CSS = THEMES.map(function (t) { return prose(t.id); }).join('\n');

  // Auto-inject the prose stylesheet once per document so every surface that
  // loads themes.js renders markdown correctly without extra wiring.
  if (typeof document !== 'undefined' && !document.getElementById('md-prose-css')) {
    var s = document.createElement('style');
    s.id = 'md-prose-css';
    s.textContent = window.MD_PROSE_CSS;
    (document.head || document.documentElement).appendChild(s);
  }
})();
