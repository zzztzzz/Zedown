/* VisualStudioForms.jsx — visual form editors for the data-driven diagram kinds:
   sequence / pie / gantt. Each exposes a window.VS_* component that calls
   onMermaid(str) on every change. Controls only — the studio shell renders the
   live preview from the emitted mermaid. */
(function () {
  const { useState, useEffect } = React;
  const btn = function (t, primary) { return { border: primary ? 'none' : '1px solid ' + t.border, background: primary ? t.accent : t.surface, color: primary ? t.accentText : t.muted, cursor: 'pointer', borderRadius: t.radius - 2, padding: '6px 11px', fontSize: 12, fontWeight: primary ? 700 : 600, fontFamily: t.fontUI }; };
  const inp = function (t) { return { border: '1px solid ' + t.border, borderRadius: t.radius - 3, background: t.surface, color: t.text, padding: '6px 9px', fontSize: 12.5, fontFamily: t.fontUI, outline: 'none', boxSizing: 'border-box' }; };
  const iconBtn = function (t) { return { width: 26, height: 26, display: 'grid', placeItems: 'center', cursor: 'pointer', border: '1px solid ' + t.border, borderRadius: 6, background: t.surface, color: t.muted, fontSize: 13 }; };
  const sectionLabel = function (t) { return { fontSize: 10.5, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: t.faint, margin: '4px 0 8px' }; };

  // ───────────────────────── Sequence ─────────────────────────
  function VS_Sequence(props) {
    const { t, onMermaid } = props;
    const [parts, setParts] = useState(['用户', '插件', '存储']);
    const [msgs, setMsgs] = useState([
      { from: '用户', to: '插件', text: '编辑笔记', dashed: false },
      { from: '插件', to: '存储', text: '保存', dashed: false },
      { from: '存储', to: '插件', text: '完成', dashed: true },
      { from: '插件', to: '用户', text: '已保存', dashed: true },
    ]);
    useEffect(function () {
      let out = 'sequenceDiagram\n';
      parts.forEach(function (p) { out += '  participant ' + p.replace(/\s/g, '_') + '\n'; });
      msgs.forEach(function (m) { out += '  ' + m.from.replace(/\s/g, '_') + (m.dashed ? '-->>' : '->>') + m.to.replace(/\s/g, '_') + ': ' + m.text + '\n'; });
      onMermaid(out.trim());
    }, [parts, msgs]);

    function setPart(i, v) { setParts(function (a) { const n = a.slice(); const old = n[i]; n[i] = v; setMsgs(function (ms) { return ms.map(function (m) { return { from: m.from === old ? v : m.from, to: m.to === old ? v : m.to, text: m.text, dashed: m.dashed }; }); }); return n; }); }
    function setMsg(i, k, v) { setMsgs(function (a) { const n = a.slice(); n[i] = Object.assign({}, n[i], { [k]: v }); return n; }); }
    function moveMsg(i, d) { setMsgs(function (a) { const n = a.slice(); const j = i + d; if (j < 0 || j >= n.length) return a; const tmp = n[i]; n[i] = n[j]; n[j] = tmp; return n; }); }

    return (
      <div style={{ padding: 16, overflow: 'auto', height: '100%', boxSizing: 'border-box' }}>
        <div style={sectionLabel(t)}>参与者</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 18 }}>
          {parts.map(function (p, i) {
            return (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 4, background: t.surface2, border: '1px solid ' + t.border, borderRadius: t.radius, padding: '4px 4px 4px 10px' }}>
                <input value={p} onChange={function (e) { setPart(i, e.target.value); }} style={Object.assign({}, inp(t), { border: 'none', background: 'transparent', width: 70, padding: '2px 0' })} />
                <button onClick={function () { const rm = parts[i]; setParts(parts.filter(function (_, k) { return k !== i; })); setMsgs(msgs.filter(function (m) { return m.from !== rm && m.to !== rm; })); }} style={Object.assign({}, iconBtn(t), { width: 22, height: 22 })}>✕</button>
              </div>
            );
          })}
          <button onClick={function () { setParts(parts.concat(['角色' + (parts.length + 1)])); }} style={btn(t, false)}>＋ 参与者</button>
        </div>

        <div style={sectionLabel(t)}>消息(从上到下按顺序发生)</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
          {msgs.map(function (m, i) {
            return (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, background: t.surface, border: '1px solid ' + t.border, borderRadius: t.radius, padding: 7 }}>
                <span style={{ color: t.faint, fontSize: 11, fontFamily: t.fontMono, width: 16 }}>{i + 1}</span>
                <select value={m.from} onChange={function (e) { setMsg(i, 'from', e.target.value); }} style={inp(t)}>{parts.map(function (p) { return <option key={p} value={p}>{p}</option>; })}</select>
                <span style={{ color: t.muted }}>{m.dashed ? '⇠' : '→'}</span>
                <select value={m.to} onChange={function (e) { setMsg(i, 'to', e.target.value); }} style={inp(t)}>{parts.map(function (p) { return <option key={p} value={p}>{p}</option>; })}</select>
                <input value={m.text} onChange={function (e) { setMsg(i, 'text', e.target.value); }} placeholder="消息内容" style={Object.assign({}, inp(t), { flex: 1 })} />
                <button title="虚线(应答)" onClick={function () { setMsg(i, 'dashed', !m.dashed); }} style={Object.assign({}, iconBtn(t), { color: m.dashed ? t.accent : t.muted, borderColor: m.dashed ? t.accent : t.border })}>⇠</button>
                <button title="上移" onClick={function () { moveMsg(i, -1); }} style={iconBtn(t)}>↑</button>
                <button title="下移" onClick={function () { moveMsg(i, 1); }} style={iconBtn(t)}>↓</button>
                <button title="删除" onClick={function () { setMsgs(msgs.filter(function (_, k) { return k !== i; })); }} style={iconBtn(t)}>✕</button>
              </div>
            );
          })}
        </div>
        <button onClick={function () { setMsgs(msgs.concat([{ from: parts[0], to: parts[1] || parts[0], text: '新消息', dashed: false }])); }} style={Object.assign({}, btn(t, false), { marginTop: 10 })}>＋ 添加消息</button>
      </div>
    );
  }

  // ───────────────────────── Pie ─────────────────────────
  const PIE_COLORS = ['#e2792f', '#2f8a6b', '#4f6bd6', '#c2497a', '#9a6bd6', '#c9a227', '#5aaecb', '#8a8a8a'];
  function VS_Pie(props) {
    const { t, onMermaid } = props;
    const [title, setTitle] = useState('笔记分类占比');
    const [rows, setRows] = useState([{ label: '工作', value: 45 }, { label: '个人', value: 30 }, { label: '读书', value: 15 }, { label: '其它', value: 10 }]);
    useEffect(function () {
      let out = 'pie title ' + (title || '占比') + '\n';
      rows.forEach(function (r) { out += '  "' + r.label.replace(/"/g, '') + '" : ' + (Number(r.value) || 0) + '\n'; });
      onMermaid(out.trim());
    }, [title, rows]);
    function setRow(i, k, v) { setRows(function (a) { const n = a.slice(); n[i] = Object.assign({}, n[i], { [k]: v }); return n; }); }

    const total = rows.reduce(function (s, r) { return s + (Number(r.value) || 0); }, 0) || 1;
    let acc = 0;
    const slices = rows.map(function (r, i) {
      const frac = (Number(r.value) || 0) / total;
      const a0 = acc * 2 * Math.PI - Math.PI / 2; acc += frac; const a1 = acc * 2 * Math.PI - Math.PI / 2;
      const R = 70, cx = 80, cy = 80;
      const x0 = cx + R * Math.cos(a0), y0 = cy + R * Math.sin(a0), x1 = cx + R * Math.cos(a1), y1 = cy + R * Math.sin(a1);
      const large = frac > 0.5 ? 1 : 0;
      const d = frac >= 0.999 ? 'M' + (cx - R) + ',' + cy + ' a' + R + ',' + R + ' 0 1 1 ' + (2 * R) + ',0 a' + R + ',' + R + ' 0 1 1 -' + (2 * R) + ',0' : 'M' + cx + ',' + cy + ' L' + x0 + ',' + y0 + ' A' + R + ',' + R + ' 0 ' + large + ' 1 ' + x1 + ',' + y1 + ' Z';
      return <path key={i} d={d} fill={PIE_COLORS[i % PIE_COLORS.length]} stroke={t.surface} strokeWidth="1.5" />;
    });

    return (
      <div style={{ display: 'flex', height: '100%' }}>
        <div style={{ flex: 1, padding: 16, overflow: 'auto', boxSizing: 'border-box' }}>
          <div style={sectionLabel(t)}>标题</div>
          <input value={title} onChange={function (e) { setTitle(e.target.value); }} style={Object.assign({}, inp(t), { width: '100%', marginBottom: 18 })} />
          <div style={sectionLabel(t)}>数据项</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
            {rows.map(function (r, i) {
              return (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ width: 12, height: 12, borderRadius: 3, background: PIE_COLORS[i % PIE_COLORS.length], flexShrink: 0 }} />
                  <input value={r.label} onChange={function (e) { setRow(i, 'label', e.target.value); }} style={Object.assign({}, inp(t), { flex: 1 })} />
                  <input type="number" value={r.value} onChange={function (e) { setRow(i, 'value', e.target.value); }} style={Object.assign({}, inp(t), { width: 72 })} />
                  <button onClick={function () { setRows(rows.filter(function (_, k) { return k !== i; })); }} style={iconBtn(t)}>✕</button>
                </div>
              );
            })}
          </div>
          <button onClick={function () { setRows(rows.concat([{ label: '新项', value: 10 }])); }} style={Object.assign({}, btn(t, false), { marginTop: 10 })}>＋ 添加项</button>
        </div>
        <div style={{ width: 240, flexShrink: 0, borderLeft: '1px solid ' + t.border, background: t.surface2, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, padding: 20 }}>
          <div style={{ fontSize: 12.5, fontWeight: 700 }}>{title}</div>
          <svg width="160" height="160" viewBox="0 0 160 160">{slices}</svg>
          <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 5 }}>
            {rows.map(function (r, i) {
              const pct = Math.round((Number(r.value) || 0) / total * 100);
              return <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 11.5, color: t.muted }}><span style={{ width: 10, height: 10, borderRadius: 2, background: PIE_COLORS[i % PIE_COLORS.length] }} /><span style={{ flex: 1 }}>{r.label}</span><span style={{ fontFamily: t.fontMono }}>{pct}%</span></div>;
            })}
          </div>
        </div>
      </div>
    );
  }

  // ───────────────────────── Gantt ─────────────────────────
  const GANTT_STATUS = [{ id: 'done', label: '已完成' }, { id: 'active', label: '进行中' }, { id: '', label: '未开始' }];
  function VS_Gantt(props) {
    const { t, onMermaid } = props;
    const [title, setTitle] = useState('项目排期');
    const [sections, setSections] = useState([
      { name: '设计', tasks: [{ name: '原型', start: '2026-06-01', days: 5, status: 'done' }, { name: '评审', start: '2026-06-06', days: 3, status: 'active' }] },
      { name: '开发', tasks: [{ name: '编码', start: '2026-06-09', days: 7, status: '' }] },
    ]);
    useEffect(function () {
      let out = 'gantt\n  title ' + (title || '排期') + '\n  dateFormat YYYY-MM-DD\n';
      sections.forEach(function (s) {
        out += '  section ' + s.name + '\n';
        s.tasks.forEach(function (tk, i) { out += '  ' + tk.name + ' :' + (tk.status ? tk.status + ', ' : '') + 's' + Math.random().toString(36).slice(2, 6) + ', ' + tk.start + ', ' + tk.days + 'd\n'; });
      });
      onMermaid(out.trim());
    }, [title, sections]);

    function setTask(si, ti, k, v) { setSections(function (a) { const n = a.map(function (s) { return Object.assign({}, s, { tasks: s.tasks.slice() }); }); n[si].tasks[ti] = Object.assign({}, n[si].tasks[ti], { [k]: v }); return n; }); }
    function setSecName(si, v) { setSections(function (a) { const n = a.slice(); n[si] = Object.assign({}, n[si], { name: v }); return n; }); }

    // simple timeline preview
    const all = []; sections.forEach(function (s) { s.tasks.forEach(function (tk) { all.push(tk); }); });
    const dates = all.map(function (tk) { return new Date(tk.start).getTime(); }).filter(function (x) { return !isNaN(x); });
    const ends = all.map(function (tk) { return new Date(tk.start).getTime() + (Number(tk.days) || 0) * 864e5; }).filter(function (x) { return !isNaN(x); });
    const min = Math.min.apply(null, dates.length ? dates : [Date.now()]);
    const max = Math.max.apply(null, ends.length ? ends : [Date.now() + 864e5]);
    const span = Math.max(1, max - min);
    const barColor = function (st) { return st === 'done' ? t.faint : st === 'active' ? t.accent : t.borderStrong; };

    return (
      <div style={{ display: 'flex', height: '100%' }}>
        <div style={{ flex: 1, padding: 16, overflow: 'auto', boxSizing: 'border-box' }}>
          <div style={sectionLabel(t)}>标题</div>
          <input value={title} onChange={function (e) { setTitle(e.target.value); }} style={Object.assign({}, inp(t), { width: '100%', marginBottom: 16 })} />
          {sections.map(function (s, si) {
            return (
              <div key={si} style={{ marginBottom: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 7 }}>
                  <input value={s.name} onChange={function (e) { setSecName(si, e.target.value); }} style={Object.assign({}, inp(t), { fontWeight: 700, flex: 1 })} />
                  <button onClick={function () { setSections(sections.filter(function (_, k) { return k !== si; })); }} style={iconBtn(t)}>✕</button>
                </div>
                {s.tasks.map(function (tk, ti) {
                  return (
                    <div key={ti} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6, paddingLeft: 10 }}>
                      <input value={tk.name} onChange={function (e) { setTask(si, ti, 'name', e.target.value); }} style={Object.assign({}, inp(t), { flex: 1 })} />
                      <input type="date" value={tk.start} onChange={function (e) { setTask(si, ti, 'start', e.target.value); }} style={inp(t)} />
                      <input type="number" min="1" value={tk.days} onChange={function (e) { setTask(si, ti, 'days', Number(e.target.value) || 1); }} style={Object.assign({}, inp(t), { width: 56 })} />
                      <span style={{ fontSize: 11, color: t.faint }}>天</span>
                      <select value={tk.status} onChange={function (e) { setTask(si, ti, 'status', e.target.value); }} style={inp(t)}>{GANTT_STATUS.map(function (o) { return <option key={o.id} value={o.id}>{o.label}</option>; })}</select>
                      <button onClick={function () { setSections(function (a) { const n = a.map(function (x, k) { return k === si ? Object.assign({}, x, { tasks: x.tasks.filter(function (_, j) { return j !== ti; }) }) : x; }); return n; }); }} style={iconBtn(t)}>✕</button>
                    </div>
                  );
                })}
                <button onClick={function () { setSections(function (a) { const n = a.map(function (x, k) { return k === si ? Object.assign({}, x, { tasks: x.tasks.concat([{ name: '新任务', start: '2026-06-10', days: 3, status: '' }]) }) : x; }); return n; }); }} style={Object.assign({}, btn(t, false), { marginLeft: 10 })}>＋ 任务</button>
              </div>
            );
          })}
          <button onClick={function () { setSections(sections.concat([{ name: '新分区', tasks: [] }])); }} style={btn(t, false)}>＋ 添加分区</button>
        </div>
        <div style={{ width: 300, flexShrink: 0, borderLeft: '1px solid ' + t.border, background: t.surface2, padding: 18, overflow: 'auto' }}>
          <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 14 }}>{title}</div>
          {sections.map(function (s, si) {
            return (
              <div key={si} style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: t.muted, marginBottom: 5 }}>{s.name}</div>
                {s.tasks.map(function (tk, ti) {
                  const st = new Date(tk.start).getTime(); const w = (Number(tk.days) || 0) * 864e5;
                  const left = isNaN(st) ? 0 : (st - min) / span * 100;
                  const width = Math.max(3, w / span * 100);
                  return (
                    <div key={ti} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                      <span style={{ width: 52, fontSize: 10.5, color: t.faint, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{tk.name}</span>
                      <div style={{ position: 'relative', flex: 1, height: 14, background: t.surface, borderRadius: 4 }}>
                        <div style={{ position: 'absolute', left: left + '%', width: width + '%', top: 0, bottom: 0, background: barColor(tk.status), borderRadius: 4, minWidth: 4 }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  window.VS_Sequence = VS_Sequence;
  window.VS_Pie = VS_Pie;
  window.VS_Gantt = VS_Gantt;
})();
