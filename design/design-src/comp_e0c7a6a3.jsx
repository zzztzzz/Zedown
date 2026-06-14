/* app.jsx — assembles the design canvas with the side-panel variations
   and the full-screen editor prototype. */
(function () {
  const { useState, useEffect } = React;
  const T = window.MD_TOKENS;
  const STORE = 'mdkit:theme';

  // Fixed, always-visible global theme switch — drives the editor + reader.
  function GlobalThemeBar({ theme, setTheme }) {
    return (
      <div style={{
        position: 'fixed', top: 16, left: '50%', transform: 'translateX(-50%)', zIndex: 9999,
        display: 'flex', alignItems: 'center', gap: 4, padding: 5,
        background: 'rgba(22,22,24,.9)', backdropFilter: 'blur(10px)',
        borderRadius: 13, boxShadow: '0 8px 30px rgba(0,0,0,.28)', border: '1px solid rgba(255,255,255,.08)',
        fontFamily: "'Public Sans', system-ui, sans-serif",
      }}>
        <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.08em', color: 'rgba(255,255,255,.5)', padding: '0 8px 0 9px', textTransform: 'uppercase' }}>主题</span>
        {window.MD_THEMES.map(function (th) {
          const on = th.id === theme;
          return (
            <button key={th.id} onClick={function () { setTheme(th.id); }} style={{
              display: 'flex', alignItems: 'center', gap: 7, cursor: 'pointer',
              border: 'none', borderRadius: 9, padding: '7px 12px',
              background: on ? 'rgba(255,255,255,.14)' : 'transparent',
              color: on ? '#fff' : 'rgba(255,255,255,.6)', fontSize: 12.5, fontWeight: on ? 700 : 500,
              transition: 'all .15s',
            }}>
              <span style={{ width: 11, height: 11, borderRadius: '50%', background: T[th.id].accent, boxShadow: on ? '0 0 0 2px rgba(255,255,255,.25)' : 'none' }} />
              {th.label}
            </button>
          );
        })}
      </div>
    );
  }

  // A faux article webpage to sit behind the docked side panel (gives context).
  function FakePage() {
    const line = function (w, op) {
      return { height: 11, borderRadius: 4, background: '#e7e7e7', width: w, opacity: op || 1, marginBottom: 12 };
    };
    return (
      <div style={{ flex: 1, minWidth: 0, height: '100%', overflow: 'hidden', background: '#fff', fontFamily: 'system-ui, sans-serif' }}>
        <div style={{ maxWidth: 560, margin: '0 auto', padding: '44px 40px' }}>
          <div style={{ display: 'flex', gap: 10, marginBottom: 26 }}>
            <div style={{ height: 9, width: 60, borderRadius: 4, background: '#d8d8d8' }} />
            <div style={{ height: 9, width: 42, borderRadius: 4, background: '#ececec' }} />
          </div>
          <div style={{ height: 26, width: '78%', borderRadius: 5, background: '#cfcfcf', marginBottom: 10 }} />
          <div style={{ height: 26, width: '52%', borderRadius: 5, background: '#cfcfcf', marginBottom: 26 }} />
          <div style={{
            height: 190, borderRadius: 8, marginBottom: 26,
            backgroundImage: 'repeating-linear-gradient(45deg,#f0f0f0 0 12px,#f7f7f7 12px 24px)',
            border: '1px solid #ececec', display: 'grid', placeItems: 'center',
            color: '#bbb', fontFamily: 'ui-monospace, monospace', fontSize: 12,
          }}>article image</div>
          {['100%', '96%', '99%', '88%', '100%', '72%', '100%', '94%', '60%'].map(function (w, i) {
            return <div key={i} style={line(w, i % 3 === 2 ? 0.55 : 1)} />;
          })}
        </div>
      </div>
    );
  }

  function BrowserWithPanel({ themeId }) {
    return (
      <ChromeWindow width={980} height={640}
        url="example.com/blog/markdown-everywhere"
        tabs={[{ title: 'Markdown everywhere — Blog' }, { title: 'New Tab' }]} activeIndex={0}>
        <div style={{ display: 'flex', height: '100%' }}>
          <FakePage />
          <div style={{ width: 360, flexShrink: 0, height: '100%' }}>
            <MDSidePanel themeId={themeId} height={556} />
          </div>
        </div>
      </ChromeWindow>
    );
  }

  function FullEditorBoard({ theme, setTheme }) {
    return (
      <ChromeWindow width={1320} height={820}
        url="chrome-extension://markdown/editor.html"
        tabs={[{ title: 'Markdown — 编辑器' }, { title: 'example.com' }]} activeIndex={0}>
        <div style={{ height: '100%' }}>
          <MDFullEditor themeId={theme} onTheme={setTheme} />
        </div>
      </ChromeWindow>
    );
  }

  function ReaderStandalone() { return null; }

  function App() {
    const [theme, setTheme] = useState(function () {
      const v = localStorage.getItem(STORE);
      return (v && T[v]) ? v : 'paper';
    });
    useEffect(function () { try { localStorage.setItem(STORE, theme); } catch (e) {} }, [theme]);
    return (
      <React.Fragment>
      <GlobalThemeBar theme={theme} setTheme={setTheme} />
      <DesignCanvas>
        <DCSection id="sidepanel" title="侧边栏 · 常驻右侧"
          subtitle="点击图标在网页右侧展开速记面板 — 三种视觉风格。每个面板都可输入、切换编辑/预览、用工具栏排版。">
          {window.MD_THEMES.map(function (th) {
            return (
              <DCArtboard key={th.id} id={th.id} label={th.label + ' · ' + th.desc} width={980} height={640}>
                <BrowserWithPanel themeId={th.id} />
              </DCArtboard>
            );
          })}
        </DCSection>

        <DCSection id="editor" title="全屏编辑器 · 独立页面"
          subtitle="文件树(文件夹 / 新建 / 导入) + 实时分屏预览。点顶部「阅读」整页变成只读全屏 mdReader，自带目录 / 进度 / 字号导航；点「编辑」又返回。读写与阅读一体。">
          <DCArtboard id="full" label="全屏编辑器 · 编辑 ⇄ 阅读一体(试试点「阅读」)" width={1320} height={820}>
            <FullEditorBoard theme={theme} setTheme={setTheme} />
          </DCArtboard>
        </DCSection>
      </DesignCanvas>
      </React.Fragment>
    );
  }

  window.MDApp = App;
})();
