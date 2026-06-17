/* vs-forms.js — vanilla form editors for the data-driven diagram kinds:
   sequence / pie / gantt. Vanilla DOM port of the design/v2 prototype
   (VisualStudioForms.jsx). Each emits onMermaid(str) on every change. Pie and
   gantt carry their own inline preview; the sequence preview is rendered by the
   studio shell from the emitted mermaid.

   window.VS_Sequence / VS_Pie / VS_Gantt({ t, onMermaid }) → { el } */
(function () {
  var el = window.VS_el, svg = window.VS_svg;

  function btn(t, primary) { return { border: primary ? 'none' : '1px solid ' + t.border, background: primary ? t.accent : t.surface, color: primary ? t.accentText : t.muted, cursor: 'pointer', borderRadius: (t.radius - 2) + 'px', padding: '6px 11px', fontSize: '12px', fontWeight: primary ? '700' : '600', fontFamily: t.fontUI }; }
  function inp(t) { return { border: '1px solid ' + t.border, borderRadius: (t.radius - 3) + 'px', background: t.surface, color: t.text, padding: '6px 9px', fontSize: '12.5px', fontFamily: t.fontUI, outline: 'none', boxSizing: 'border-box' }; }
  function iconBtn(t) { return { width: '26px', height: '26px', display: 'grid', placeItems: 'center', cursor: 'pointer', border: '1px solid ' + t.border, borderRadius: '6px', background: t.surface, color: t.muted, fontSize: '13px' }; }
  function sectionLabel(t) { return { fontSize: '10.5px', fontWeight: '700', letterSpacing: '.08em', textTransform: 'uppercase', color: t.faint, margin: '4px 0 8px' }; }

  // ───────────────────────── Sequence ─────────────────────────
  function VS_Sequence(opts) {
    var t = opts.t;
    var ini = opts.initial && opts.initial.parts ? opts.initial : null;
    var parts = ini ? ini.parts.slice() : ['用户', '插件', '存储'];
    var msgs = ini ? (ini.msgs || []).map(function (m) { return { from: m.from, to: m.to, text: m.text, dashed: !!m.dashed }; }) : [
      { from: '用户', to: '插件', text: '编辑笔记', dashed: false },
      { from: '插件', to: '存储', text: '保存', dashed: false },
      { from: '存储', to: '插件', text: '完成', dashed: true },
      { from: '插件', to: '用户', text: '已保存', dashed: true },
    ];
    var root = el('div', { style: { padding: '16px', overflow: 'auto', height: '100%', boxSizing: 'border-box' } });
    var partsHost = el('div', { style: { display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '18px' } });
    var msgsHost = el('div', { style: { display: 'flex', flexDirection: 'column', gap: '7px' } });

    function emit() {
      var out = 'sequenceDiagram\n';
      parts.forEach(function (p) { out += '  participant ' + p.replace(/\s/g, '_') + '\n'; });
      msgs.forEach(function (m) { out += '  ' + m.from.replace(/\s/g, '_') + (m.dashed ? '-->>' : '->>') + m.to.replace(/\s/g, '_') + ': ' + m.text + '\n'; });
      if (opts.onMermaid) opts.onMermaid(out.trim());
    }
    // Live rename: update model + remap messages + refresh message-row selects,
    // WITHOUT rebuilding the participant chips (would steal focus mid-typing).
    function renamePart(i, v) { var old = parts[i]; parts[i] = v; msgs.forEach(function (m) { if (m.from === old) m.from = v; if (m.to === old) m.to = v; }); buildMsgs(); emit(); }

    function buildParts() {
      partsHost.textContent = '';
      parts.forEach(function (p, i) {
        var chip = el('div', { style: { display: 'flex', alignItems: 'center', gap: '4px', background: t.surface2, border: '1px solid ' + t.border, borderRadius: t.radius + 'px', padding: '4px 4px 4px 10px' } });
        var f = el('input', { value: p, style: Object.assign({}, inp(t), { border: 'none', background: 'transparent', width: '70px', padding: '2px 0' }) });
        f.addEventListener('input', function () { renamePart(i, f.value); });
        var rm = el('button', { onclick: function () { var nm = parts[i]; parts = parts.filter(function (_, k) { return k !== i; }); msgs = msgs.filter(function (m) { return m.from !== nm && m.to !== nm; }); buildParts(); buildMsgs(); emit(); }, style: Object.assign({}, iconBtn(t), { width: '22px', height: '22px' }) }, '✕');
        chip.appendChild(f); chip.appendChild(rm); partsHost.appendChild(chip);
      });
      partsHost.appendChild(el('button', { onclick: function () { parts.push('角色' + (parts.length + 1)); buildParts(); buildMsgs(); emit(); }, style: btn(t, false) }, '＋ 参与者'));
    }
    function partSelect(value, onPick) {
      var s = el('select', { style: inp(t) });
      parts.forEach(function (p) { var o = el('option', { value: p }, p); if (p === value) o.selected = true; s.appendChild(o); });
      s.addEventListener('change', function () { onPick(s.value); });
      return s;
    }
    function buildMsgs() {
      msgsHost.textContent = '';
      msgs.forEach(function (m, i) {
        var row = el('div', { style: { display: 'flex', alignItems: 'center', gap: '6px', background: t.surface, border: '1px solid ' + t.border, borderRadius: t.radius + 'px', padding: '7px' } });
        row.appendChild(el('span', { style: { color: t.faint, fontSize: '11px', fontFamily: t.fontMono, width: '16px' } }, String(i + 1)));
        row.appendChild(partSelect(m.from, function (v) { m.from = v; emit(); }));
        row.appendChild(el('span', { style: { color: t.muted } }, m.dashed ? '⇠' : '→'));
        row.appendChild(partSelect(m.to, function (v) { m.to = v; emit(); }));
        var txt = el('input', { value: m.text, placeholder: '消息内容', style: Object.assign({}, inp(t), { flex: '1' }) });
        txt.addEventListener('input', function () { m.text = txt.value; emit(); });
        row.appendChild(txt);
        row.appendChild(el('button', { title: '虚线(应答)', onclick: function () { m.dashed = !m.dashed; buildMsgs(); emit(); }, style: Object.assign({}, iconBtn(t), { color: m.dashed ? t.accent : t.muted, borderColor: m.dashed ? t.accent : t.border }) }, '⇠'));
        row.appendChild(el('button', { title: '上移', onclick: function () { if (i > 0) { var tmp = msgs[i]; msgs[i] = msgs[i - 1]; msgs[i - 1] = tmp; buildMsgs(); emit(); } }, style: iconBtn(t) }, '↑'));
        row.appendChild(el('button', { title: '下移', onclick: function () { if (i < msgs.length - 1) { var tmp = msgs[i]; msgs[i] = msgs[i + 1]; msgs[i + 1] = tmp; buildMsgs(); emit(); } }, style: iconBtn(t) }, '↓'));
        row.appendChild(el('button', { title: '删除', onclick: function () { msgs = msgs.filter(function (_, k) { return k !== i; }); buildMsgs(); emit(); }, style: iconBtn(t) }, '✕'));
        msgsHost.appendChild(row);
      });
    }

    root.appendChild(el('div', { style: sectionLabel(t) }, '参与者'));
    root.appendChild(partsHost);
    root.appendChild(el('div', { style: sectionLabel(t) }, '消息(从上到下按顺序发生)'));
    root.appendChild(msgsHost);
    root.appendChild(el('button', { onclick: function () { msgs.push({ from: parts[0], to: parts[1] || parts[0], text: '新消息', dashed: false }); buildMsgs(); emit(); }, style: Object.assign({}, btn(t, false), { marginTop: '10px' }) }, '＋ 添加消息'));
    buildParts(); buildMsgs(); emit();
    return { el: root };
  }

  // ───────────────────────── Pie ─────────────────────────
  var PIE_COLORS = ['#e2792f', '#2f8a6b', '#4f6bd6', '#c2497a', '#9a6bd6', '#c9a227', '#5aaecb', '#8a8a8a'];
  function VS_Pie(opts) {
    var t = opts.t;
    var iniP = opts.initial && opts.initial.rows ? opts.initial : null;
    var title = iniP ? (iniP.title || '占比') : '笔记分类占比';
    var rows = iniP ? iniP.rows.map(function (r) { return { label: r.label, value: r.value }; }) : [{ label: '工作', value: 45 }, { label: '个人', value: 30 }, { label: '读书', value: 15 }, { label: '其它', value: 10 }];
    var rowsHost = el('div', { style: { display: 'flex', flexDirection: 'column', gap: '7px' } });
    var preview = el('div', { style: { width: '240px', flexShrink: '0', borderLeft: '1px solid ' + t.border, background: t.surface2, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '14px', padding: '20px' } });

    function emit() {
      var out = 'pie title ' + (title || '占比') + '\n';
      rows.forEach(function (r) { out += '  "' + r.label.replace(/"/g, '') + '" : ' + (Number(r.value) || 0) + '\n'; });
      if (opts.onMermaid) opts.onMermaid(out.trim());
    }
    function paintPreview() {
      preview.textContent = '';
      preview.appendChild(el('div', { style: { fontSize: '12.5px', fontWeight: '700' } }, title));
      var total = rows.reduce(function (s, r) { return s + (Number(r.value) || 0); }, 0) || 1;
      var acc = 0;
      var pie = svg('svg', { width: '160', height: '160', viewBox: '0 0 160 160' });
      rows.forEach(function (r, i) {
        var frac = (Number(r.value) || 0) / total;
        var a0 = acc * 2 * Math.PI - Math.PI / 2; acc += frac; var a1 = acc * 2 * Math.PI - Math.PI / 2;
        var R = 70, cx = 80, cy = 80;
        var x0 = cx + R * Math.cos(a0), y0 = cy + R * Math.sin(a0), x1 = cx + R * Math.cos(a1), y1 = cy + R * Math.sin(a1);
        var large = frac > 0.5 ? 1 : 0;
        var d = frac >= 0.999 ? 'M' + (cx - R) + ',' + cy + ' a' + R + ',' + R + ' 0 1 1 ' + (2 * R) + ',0 a' + R + ',' + R + ' 0 1 1 -' + (2 * R) + ',0' : 'M' + cx + ',' + cy + ' L' + x0 + ',' + y0 + ' A' + R + ',' + R + ' 0 ' + large + ' 1 ' + x1 + ',' + y1 + ' Z';
        pie.appendChild(svg('path', { d: d, fill: PIE_COLORS[i % PIE_COLORS.length], stroke: t.surface, 'stroke-width': '1.5' }));
      });
      preview.appendChild(pie);
      var legend = el('div', { style: { width: '100%', display: 'flex', flexDirection: 'column', gap: '5px' } });
      rows.forEach(function (r, i) {
        var pct = Math.round((Number(r.value) || 0) / total * 100);
        legend.appendChild(el('div', { style: { display: 'flex', alignItems: 'center', gap: '7px', fontSize: '11.5px', color: t.muted } },
          el('span', { style: { width: '10px', height: '10px', borderRadius: '2px', background: PIE_COLORS[i % PIE_COLORS.length] } }),
          el('span', { style: { flex: '1' } }, r.label),
          el('span', { style: { fontFamily: t.fontMono } }, pct + '%')));
      });
      preview.appendChild(legend);
    }
    function buildRows() {
      rowsHost.textContent = '';
      rows.forEach(function (r, i) {
        var row = el('div', { style: { display: 'flex', alignItems: 'center', gap: '8px' } });
        row.appendChild(el('span', { style: { width: '12px', height: '12px', borderRadius: '3px', background: PIE_COLORS[i % PIE_COLORS.length], flexShrink: '0' } }));
        var lab = el('input', { value: r.label, style: Object.assign({}, inp(t), { flex: '1' }) });
        lab.addEventListener('input', function () { r.label = lab.value; paintPreview(); emit(); });
        var val = el('input', { type: 'number', value: r.value, style: Object.assign({}, inp(t), { width: '72px' }) });
        val.addEventListener('input', function () { r.value = val.value; paintPreview(); emit(); });
        row.appendChild(lab); row.appendChild(val);
        row.appendChild(el('button', { onclick: function () { rows = rows.filter(function (_, k) { return k !== i; }); buildRows(); paintPreview(); emit(); }, style: iconBtn(t) }, '✕'));
        rowsHost.appendChild(row);
      });
    }

    var titleInp = el('input', { value: title, style: Object.assign({}, inp(t), { width: '100%', marginBottom: '18px' }) });
    titleInp.addEventListener('input', function () { title = titleInp.value; paintPreview(); emit(); });
    var left = el('div', { style: { flex: '1', padding: '16px', overflow: 'auto', boxSizing: 'border-box' } },
      el('div', { style: sectionLabel(t) }, '标题'), titleInp,
      el('div', { style: sectionLabel(t) }, '数据项'), rowsHost,
      el('button', { onclick: function () { rows.push({ label: '新项', value: 10 }); buildRows(); paintPreview(); emit(); }, style: Object.assign({}, btn(t, false), { marginTop: '10px' }) }, '＋ 添加项'));
    var root = el('div', { style: { display: 'flex', height: '100%' } }, left, preview);
    buildRows(); paintPreview(); emit();
    return { el: root };
  }

  // ───────────────────────── Gantt ─────────────────────────
  var GANTT_STATUS = [{ id: 'done', label: '已完成' }, { id: 'active', label: '进行中' }, { id: '', label: '未开始' }];
  function VS_Gantt(opts) {
    var t = opts.t;
    var iniG = opts.initial && opts.initial.sections ? opts.initial : null;
    var title = iniG ? (iniG.title || '排期') : '项目排期';
    var sections = iniG ? iniG.sections.map(function (s) { return { name: s.name, tasks: (s.tasks || []).map(function (tk) { return { name: tk.name, start: tk.start, days: tk.days, status: tk.status }; }) }; }) : [
      { name: '设计', tasks: [{ name: '原型', start: '2026-06-01', days: 5, status: 'done' }, { name: '评审', start: '2026-06-06', days: 3, status: 'active' }] },
      { name: '开发', tasks: [{ name: '编码', start: '2026-06-09', days: 7, status: '' }] },
    ];
    var formHost = el('div', { style: { flex: '1', padding: '16px', overflow: 'auto', boxSizing: 'border-box' } });
    var preview = el('div', { style: { width: '300px', flexShrink: '0', borderLeft: '1px solid ' + t.border, background: t.surface2, padding: '18px', overflow: 'auto' } });

    function emit() {
      var out = 'gantt\n  title ' + (title || '排期') + '\n  dateFormat YYYY-MM-DD\n';
      sections.forEach(function (s) {
        out += '  section ' + s.name + '\n';
        s.tasks.forEach(function (tk) { out += '  ' + tk.name + ' :' + (tk.status ? tk.status + ', ' : '') + 's' + Math.random().toString(36).slice(2, 6) + ', ' + tk.start + ', ' + tk.days + 'd\n'; });
      });
      if (opts.onMermaid) opts.onMermaid(out.trim());
    }
    function barColor(st) { return st === 'done' ? t.faint : st === 'active' ? t.accent : t.borderStrong; }
    function paintPreview() {
      preview.textContent = '';
      preview.appendChild(el('div', { style: { fontSize: '12.5px', fontWeight: '700', marginBottom: '14px' } }, title));
      var all = []; sections.forEach(function (s) { s.tasks.forEach(function (tk) { all.push(tk); }); });
      var dates = all.map(function (tk) { return new Date(tk.start).getTime(); }).filter(function (x) { return !isNaN(x); });
      var ends = all.map(function (tk) { return new Date(tk.start).getTime() + (Number(tk.days) || 0) * 864e5; }).filter(function (x) { return !isNaN(x); });
      var min = Math.min.apply(null, dates.length ? dates : [Date.now()]);
      var max = Math.max.apply(null, ends.length ? ends : [Date.now() + 864e5]);
      var span = Math.max(1, max - min);
      sections.forEach(function (s) {
        var sec = el('div', { style: { marginBottom: '12px' } }, el('div', { style: { fontSize: '11px', fontWeight: '700', color: t.muted, marginBottom: '5px' } }, s.name));
        s.tasks.forEach(function (tk) {
          var st = new Date(tk.start).getTime(); var w = (Number(tk.days) || 0) * 864e5;
          var left = isNaN(st) ? 0 : (st - min) / span * 100;
          var width = Math.max(3, w / span * 100);
          sec.appendChild(el('div', { style: { display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' } },
            el('span', { style: { width: '52px', fontSize: '10.5px', color: t.faint, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' } }, tk.name),
            el('div', { style: { position: 'relative', flex: '1', height: '14px', background: t.surface, borderRadius: '4px' } },
              el('div', { style: { position: 'absolute', left: left + '%', width: width + '%', top: '0', bottom: '0', background: barColor(tk.status), borderRadius: '4px', minWidth: '4px' } }))));
        });
        preview.appendChild(sec);
      });
    }
    function statusSelect(value, onPick) {
      var s = el('select', { style: inp(t) });
      GANTT_STATUS.forEach(function (o) { var op = el('option', { value: o.id }, o.label); if (o.id === value) op.selected = true; s.appendChild(op); });
      s.addEventListener('change', function () { onPick(s.value); });
      return s;
    }
    function buildForm() {
      formHost.textContent = '';
      var titleInp = el('input', { value: title, style: Object.assign({}, inp(t), { width: '100%', marginBottom: '16px' }) });
      titleInp.addEventListener('input', function () { title = titleInp.value; paintPreview(); emit(); });
      formHost.appendChild(el('div', { style: sectionLabel(t) }, '标题'));
      formHost.appendChild(titleInp);
      sections.forEach(function (s, si) {
        var block = el('div', { style: { marginBottom: '16px' } });
        var head = el('div', { style: { display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '7px' } });
        var nm = el('input', { value: s.name, style: Object.assign({}, inp(t), { fontWeight: '700', flex: '1' }) });
        nm.addEventListener('input', function () { s.name = nm.value; paintPreview(); emit(); });
        head.appendChild(nm);
        head.appendChild(el('button', { onclick: function () { sections = sections.filter(function (_, k) { return k !== si; }); buildForm(); paintPreview(); emit(); }, style: iconBtn(t) }, '✕'));
        block.appendChild(head);
        s.tasks.forEach(function (tk, ti) {
          var row = el('div', { style: { display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px', paddingLeft: '10px' } });
          var tn = el('input', { value: tk.name, style: Object.assign({}, inp(t), { flex: '1' }) });
          tn.addEventListener('input', function () { tk.name = tn.value; paintPreview(); emit(); });
          var ts = el('input', { type: 'date', value: tk.start, style: inp(t) });
          ts.addEventListener('input', function () { tk.start = ts.value; paintPreview(); emit(); });
          var td = el('input', { type: 'number', min: '1', value: tk.days, style: Object.assign({}, inp(t), { width: '56px' }) });
          td.addEventListener('input', function () { tk.days = Number(td.value) || 1; paintPreview(); emit(); });
          row.appendChild(tn); row.appendChild(ts); row.appendChild(td);
          row.appendChild(el('span', { style: { fontSize: '11px', color: t.faint } }, '天'));
          row.appendChild(statusSelect(tk.status, function (v) { tk.status = v; paintPreview(); emit(); }));
          row.appendChild(el('button', { onclick: function () { s.tasks = s.tasks.filter(function (_, j) { return j !== ti; }); buildForm(); paintPreview(); emit(); }, style: iconBtn(t) }, '✕'));
          block.appendChild(row);
        });
        block.appendChild(el('button', { onclick: function () { s.tasks.push({ name: '新任务', start: '2026-06-10', days: 3, status: '' }); buildForm(); paintPreview(); emit(); }, style: Object.assign({}, btn(t, false), { marginLeft: '10px' }) }, '＋ 任务'));
        formHost.appendChild(block);
      });
      formHost.appendChild(el('button', { onclick: function () { sections.push({ name: '新分区', tasks: [] }); buildForm(); paintPreview(); emit(); }, style: btn(t, false) }, '＋ 添加分区'));
    }

    var root = el('div', { style: { display: 'flex', height: '100%' } }, formHost, preview);
    buildForm(); paintPreview(); emit();
    return { el: root };
  }

  window.VS_Sequence = VS_Sequence;
  window.VS_Pie = VS_Pie;
  window.VS_Gantt = VS_Gantt;
})();
