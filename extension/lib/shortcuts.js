/* lib/shortcuts.js — keyboard-shortcut registry, persistence & rebinding UI.
   Framework-free port of the V3 Shortcuts design.

   window.MDShortcuts.create() -> controller {
     bindings(), matchAction(e), setBinding(id,combo), resetOne(id),
     resetAll(), conflicts(), reserved(combo), subscribe(cb)
   }
   window.MD_comboFromEvent(e) -> 'Mod+Shift+K' | null
   window.MD_fmtCombo(combo)   -> display string (⌘/Ctrl aware)
   window.MDShortcutsPanel(t, controller, onClose) -> DOM element (modal).

   Overrides persist in localStorage['mdkit:keys'] as { id: combo }. */
(function () {
  'use strict';
  var isMac = /Mac|iPhone|iPad|iPod/.test(navigator.platform || navigator.userAgent || '');
  var STORE = 'mdkit:keys';

  var DEFAULTS = [
    { id: 'bold',        label: '加粗',            combo: 'Mod+B',           cat: '格式' },
    { id: 'italic',      label: '斜体',            combo: 'Mod+I',           cat: '格式' },
    { id: 'code',        label: '行内代码',         combo: 'Mod+`',           cat: '格式' },
    { id: 'link',        label: '插入链接',         combo: 'Mod+Shift+K',     cat: '格式' },
    { id: 'heading',     label: '标题',            combo: 'Mod+Shift+H',     cat: '段落' },
    { id: 'list',        label: '无序列表',         combo: 'Mod+Shift+L',     cat: '段落' },
    { id: 'task',        label: '待办项',           combo: 'Mod+Shift+X',     cat: '段落' },
    { id: 'quote',       label: '引用',            combo: 'Mod+Shift+.',     cat: '段落' },
    { id: 'save',        label: '保存',            combo: 'Mod+S',           cat: '通用' },
    { id: 'toggleSplit', label: '编辑 / 分屏 切换',  combo: 'Mod+\\',          cat: '通用' },
    { id: 'reading',     label: '进入阅读模式',      combo: 'Mod+Shift+Enter', cat: '通用' },
    { id: 'shortcuts',   label: '打开快捷键设置',     combo: 'Mod+/',           cat: '通用' },
  ];

  // Combos Chrome itself tends to claim — warn (don't block) on rebind.
  var RESERVED = {
    'Mod+T': 1, 'Mod+N': 1, 'Mod+W': 1, 'Mod+Shift+T': 1, 'Mod+Shift+N': 1, 'Mod+Shift+W': 1,
    'Mod+L': 1, 'Mod+H': 1, 'Mod+J': 1, 'Mod+Shift+J': 1, 'Mod+D': 1, 'Mod+Shift+B': 1,
    'Mod+R': 1, 'Mod+Shift+R': 1, 'Mod+P': 1, 'Mod+F': 1, 'Mod+G': 1, 'Mod+O': 1, 'Mod+U': 1,
    'Mod+Shift+M': 1, 'Mod+Shift+V': 1, 'Mod+Shift+I': 1, 'Mod+Shift+C': 1, 'Mod+Q': 1, 'Mod+Shift+Q': 1,
    'Mod+Shift+Delete': 1, 'Mod+0': 1, 'Mod+1': 1, 'Mod+2': 1, 'Mod+3': 1, 'Mod+4': 1,
    'Mod+5': 1, 'Mod+6': 1, 'Mod+7': 1, 'Mod+8': 1, 'Mod+9': 1,
  };

  function comboFromEvent(e) {
    if (['Shift', 'Control', 'Alt', 'Meta', 'Dead'].indexOf(e.key) > -1) return null;
    var p = [];
    if (e.metaKey || e.ctrlKey) p.push('Mod');
    if (e.shiftKey) p.push('Shift');
    if (e.altKey) p.push('Alt');
    var k = e.key;
    if (k === ' ') k = 'Space';
    else if (k.length === 1) k = k.toUpperCase();
    p.push(k);
    return p.join('+');
  }
  function fmtCombo(combo) {
    var sep = isMac ? ' ' : '+';
    return combo.split('+').map(function (x) {
      if (x === 'Mod') return isMac ? '⌘' : 'Ctrl';
      if (x === 'Shift') return isMac ? '⇧' : 'Shift';
      if (x === 'Alt') return isMac ? '⌥' : 'Alt';
      if (x === 'Space') return '空格';
      return x;
    }).join(sep);
  }

  function create() {
    var over;
    try { over = JSON.parse(localStorage.getItem(STORE) || '{}'); } catch (e) { over = {}; }
    var subs = [];
    function persist() { try { localStorage.setItem(STORE, JSON.stringify(over)); } catch (e) {} }
    function notify() { persist(); subs.forEach(function (cb) { try { cb(); } catch (e) {} }); }

    function bindings() {
      return DEFAULTS.map(function (d) {
        return { id: d.id, label: d.label, cat: d.cat, combo: over[d.id] || d.combo, custom: !!over[d.id] };
      });
    }
    function maps() {
      var map = {}, seen = {}, conflicts = {};
      bindings().forEach(function (b) {
        if (seen[b.combo]) { conflicts[b.id] = true; conflicts[seen[b.combo]] = true; }
        seen[b.combo] = b.id; map[b.combo] = b.id;
      });
      return { map: map, conflicts: conflicts };
    }
    return {
      bindings: bindings,
      conflicts: function () { return maps().conflicts; },
      reserved: function (combo) { return !!RESERVED[combo]; },
      matchAction: function (e) { var c = comboFromEvent(e); return c ? (maps().map[c] || null) : null; },
      comboFor: function (id) { var b = bindings().find(function (x) { return x.id === id; }); return b ? b.combo : ''; },
      setBinding: function (id, combo) { over[id] = combo; notify(); },
      resetOne: function (id) { delete over[id]; notify(); },
      resetAll: function () { over = {}; notify(); },
      subscribe: function (cb) { subs.push(cb); return function () { subs = subs.filter(function (x) { return x !== cb; }); }; },
    };
  }

  // ── vanilla rebinding modal ───────────────────────────────────
  function h(tag, props) {
    var el = document.createElement(tag);
    var children = Array.prototype.slice.call(arguments, 2);
    if (props) {
      for (var k in props) {
        var v = props[k];
        if (v == null || v === false) continue;
        if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
        else if (k === 'class') el.className = v;
        else if (k.slice(0, 2) === 'on' && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
        else el.setAttribute(k, v);
      }
    }
    children.forEach(function (c) {
      if (c == null || c === false) return;
      el.appendChild(typeof c === 'object' ? c : document.createTextNode(String(c)));
    });
    return el;
  }

  function ShortcutsPanel(t, sc, onClose) {
    var cap = null; // action id currently capturing
    var body;       // scrollable rebind list (rebuilt on change)

    function row(b) {
      var capturing = cap === b.id;
      var conflict = sc.conflicts()[b.id];
      var children = [h('span', { style: { flex: '1', fontSize: '13.5px' } }, b.label)];
      if (conflict && !capturing) children.push(h('span', { title: '与其它快捷键冲突', style: { fontSize: '11px', color: 'oklch(0.62 0.18 25)' } }, '冲突'));
      if (sc.reserved(b.combo) && !capturing) children.push(h('span', { title: '该组合可能被 Chrome 占用，建议改键', style: { fontSize: '11px', fontWeight: '600', color: 'oklch(0.68 0.15 70)' } }, '浏览器占用'));
      if (b.custom && !capturing) children.push(h('button', {
        title: '恢复默认', onclick: function () { sc.resetOne(b.id); },
        style: { border: 'none', background: 'transparent', color: t.faint, cursor: 'pointer', fontSize: '13px', padding: '2px' },
      }, '↺'));
      children.push(h('button', {
        onclick: function () { cap = b.id; rebuild(); },
        style: {
          minWidth: '96px', textAlign: 'center', cursor: 'pointer', fontFamily: t.fontMono, fontSize: '12.5px', fontWeight: '600',
          padding: '6px 12px', borderRadius: (t.radius - 2) + 'px',
          border: '1px solid ' + (capturing ? t.accent : conflict ? 'oklch(0.62 0.18 25)' : t.border),
          background: capturing ? t.accentSoft : t.surface2,
          color: capturing ? t.accent : t.text,
          boxShadow: 'inset 0 -1px 0 ' + t.border,
        },
      }, capturing ? '按下组合键…' : fmtCombo(b.combo)));
      return h('div', { style: { display: 'flex', alignItems: 'center', gap: '10px', padding: '7px 8px', borderRadius: t.radius + 'px' } }, ...children);
    }

    function rebuild() {
      if (!body) return;
      body.textContent = '';
      var cats = [];
      sc.bindings().forEach(function (b) { if (cats.indexOf(b.cat) < 0) cats.push(b.cat); });
      cats.forEach(function (cat) {
        var group = h('div', { style: { marginTop: '10px' } },
          h('div', { style: { fontSize: '10.5px', fontWeight: '700', letterSpacing: '.1em', color: t.faint, textTransform: 'uppercase', padding: '4px 8px' } }, cat));
        sc.bindings().filter(function (b) { return b.cat === cat; }).forEach(function (b) { group.appendChild(row(b)); });
        body.appendChild(group);
      });
    }

    body = h('div', { style: { overflow: 'auto', padding: '8px 12px 16px' } });
    rebuild();

    var card = h('div', {
      onclick: function (e) { e.stopPropagation(); },
      style: {
        width: '460px', maxHeight: '82%', display: 'flex', flexDirection: 'column', overflow: 'hidden',
        background: t.surface, color: t.text, borderRadius: (t.radius + 4) + 'px', border: '1px solid ' + t.border,
        boxShadow: '0 24px 70px rgba(0,0,0,.34)', fontFamily: t.fontUI,
      },
    },
      h('div', { style: { display: 'flex', alignItems: 'center', gap: '10px', padding: '16px 20px', borderBottom: '1px solid ' + t.border } },
        h('span', { style: { fontSize: '16px' } }, '⌨'),
        h('div', { style: { flex: '1' } },
          h('div', { style: { fontSize: '15px', fontWeight: '700' } }, '键盘快捷键'),
          h('div', { style: { fontSize: '11.5px', color: t.faint, marginTop: '1px' } }, '点击右侧按键即可重新绑定 · Esc 取消')),
        h('button', {
          onclick: function () { sc.resetAll(); },
          style: { border: '1px solid ' + t.border, background: t.surface2, color: t.muted, cursor: 'pointer', borderRadius: (t.radius - 2) + 'px', padding: '6px 11px', fontSize: '12px', fontWeight: '600', fontFamily: t.fontUI },
        }, '全部重置'),
        h('button', {
          onclick: function () { onClose(); },
          style: { width: '28px', height: '28px', border: 'none', background: 'transparent', color: t.muted, cursor: 'pointer', fontSize: '18px', borderRadius: '6px' },
        }, '✕')),
      body
    );

    var overlay = h('div', {
      onclick: function () { onClose(); },
      style: { position: 'absolute', inset: '0', zIndex: '60', display: 'grid', placeItems: 'center', background: 'rgba(10,10,12,.34)', backdropFilter: 'blur(2px)' },
    }, card);

    // keyboard capture (capture phase so it pre-empts the editor's own handler)
    function onKey(e) {
      if (cap) {
        e.preventDefault(); e.stopPropagation();
        if (e.key === 'Escape') { cap = null; rebuild(); return; }
        var c = comboFromEvent(e);
        if (c) { sc.setBinding(cap, c); cap = null; rebuild(); }
      } else if (e.key === 'Escape') { onClose(); }
      // While the modal is open, swallow editor shortcut combos so they can't
      // fire behind it (defensive — the overlay normally already holds focus).
      else if (e.metaKey || e.ctrlKey) { e.stopPropagation(); }
    }
    window.addEventListener('keydown', onKey, true);
    // refresh chips if bindings change elsewhere
    var off = sc.subscribe(rebuild);
    overlay._destroy = function () { window.removeEventListener('keydown', onKey, true); off(); };
    return overlay;
  }

  window.MDShortcuts = { create: create, DEFAULTS: DEFAULTS };
  window.MD_comboFromEvent = comboFromEvent;
  window.MD_fmtCombo = fmtCombo;
  window.MDShortcutsPanel = ShortcutsPanel;
})();
