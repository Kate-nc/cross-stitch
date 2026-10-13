// Phase 5 / COMMON-02 audit: record first, fix after.
//   AUDIT_PORT=8000 node a11y-audit.js <label>      (axe-core 4.10.2 from /tmp/axe-install, not added to the repo)
// axe on the tracker (default, More panel open, highlight view, project Stats) and the global Stats page, light and dark,
// desktop and phone; a Tab-key sweep for visible focus; contrast of the hint banners. Screen-reader semantics (ARIA names,
// roles, states) are recorded and tagged "deferred": that work is out of scope for Phase 5 for now.
const fs = require('fs'), path = require('path');
const T = require('./tk');
const LABEL = process.argv[2] || 'before';
const AXE = fs.readFileSync('/tmp/axe-install/node_modules/axe-core/axe.min.js', 'utf8');
const BASE = 'http://127.0.0.1:' + (process.env.AUDIT_PORT || '8000') + '/';
const SR = new Set(['aria-allowed-attr', 'aria-hidden-focus', 'aria-required-attr', 'aria-required-children', 'aria-required-parent', 'aria-roles', 'aria-valid-attr', 'aria-valid-attr-value', 'button-name', 'link-name', 'label', 'select-name', 'input-button-name', 'image-alt', 'aria-input-field-name', 'aria-command-name', 'aria-dialog-name', 'aria-toggle-field-name', 'aria-tooltip-name', 'aria-progressbar-name', 'aria-meter-name', 'aria-treeitem-name', 'role-img-alt', 'svg-img-alt', 'frame-title', 'document-title', 'html-has-lang', 'landmark-one-main', 'region', 'page-has-heading-one', 'heading-order', 'empty-heading', 'duplicate-id-aria', 'aria-text', 'nested-interactive', 'list', 'listitem', 'definition-list', 'dlitem']);
const classify = id => id === 'color-contrast' ? 'contrast' : SR.has(id) ? 'screen-reader (deferred)' : 'other';
const VPS = [{ n: 'desktop', w: 1440, h: 900, touch: false }, { n: 'phone', w: 393, h: 727, touch: true }];
(async () => {
  const report = { label: LABEL, axe: [], focus: [], banners: [] };
  for (const vp of VPS) for (const theme of ['light', 'dark']) {
    const { ctx, close } = await T.launch({ viewport: { width: vp.w, height: vp.h }, hasTouch: vp.touch, isMobile: vp.touch });
    const page = await ctx.newPage();
    await page.addInitScript((theme) => { try { localStorage.setItem('cs_stitchStyle', 'block'); ['tracker', 'creator', 'manager', 'home'].forEach(k => localStorage.setItem('cs_welcome_' + k + '_done', '1')); localStorage.setItem('cs_sessionOnboardingDone', '1'); ['firstStitch_tracker', 'rectSelect_tracker', 'firstStitch_creator', 'import', 'undo', 'progress', 'save'].forEach(k => localStorage.setItem('cs_pref_onboarding.coached.' + k, 'true')); sessionStorage.setItem('cs_eviction_warned', '1'); localStorage.setItem('cs_pref_theme', JSON.stringify(theme)); localStorage.setItem('cs_theme', theme); } catch (e) {} document.addEventListener('DOMContentLoaded', () => document.documentElement.setAttribute('data-theme', theme)); }, theme);
    const id = await T.seed(page, 'small.json');
    const run = async (state) => {
      await page.addScriptTag({ content: AXE }).catch(() => {});
      const res = await page.evaluate(async () => { try { return await axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] }, resultTypes: ['violations'] }); } catch (e) { return { error: String(e) }; } });
      if (res.error) { console.log('axe error', state, res.error); return; }
      for (const v of res.violations) report.axe.push({ viewport: vp.n, theme, state, rule: v.id, impact: v.impact, category: classify(v.id), nodes: v.nodes.length, example: (v.nodes[0] && v.nodes[0].target.join(' ')).slice(0, 120), help: v.help, detail: v.id === 'color-contrast' ? v.nodes.map(n => { const d = (n.any[0] && n.any[0].data) || {}; return { t: n.target.join(' ').slice(0, 110), fg: d.fgColor, bg: d.bgColor, ratio: d.contrastRatio, need: d.expectedContrastRatio, size: d.fontSize, text: ((n.html || '').replace(/<[^>]+>/g, '|').slice(0, 60)) }; }) : undefined });
      console.log(vp.n, theme, state, 'violations:', res.violations.map(v => v.id + '(' + v.nodes.length + ',' + v.impact + ')').join(' ') || 'none');
    };
    await page.goto(BASE + 'stitch.html?id=' + id); await page.waitForSelector(T.TRACKER_CANVAS, { timeout: 90000 }); await page.waitForTimeout(2000);
    await page.evaluate(theme => document.documentElement.setAttribute('data-theme', theme), theme); await page.waitForTimeout(300);
    await run('tracker');
    if (vp.n === 'desktop' && theme === 'light') {
      // Tab sweep: does each stop show a focus indicator?
      await page.mouse.click(5, 5).catch(() => {});
      for (let i = 0; i < 70; i++) {
        await page.keyboard.press('Tab'); await page.waitForTimeout(350);   // controls ease their outline in (transition: all); read it once it has settled
        const f = await page.evaluate(() => { const e = document.activeElement; if (!e || e === document.body) return null; const cs = getComputedStyle(e); const r = e.getBoundingClientRect();
          return { tag: e.tagName.toLowerCase(), cls: String(e.className).slice(0, 40), label: (e.getAttribute('aria-label') || e.textContent || '').trim().slice(0, 24), outlineStyle: cs.outlineStyle, outlineW: parseFloat(cs.outlineWidth), outlineColor: cs.outlineColor, shadow: cs.boxShadow !== 'none', visible: r.width > 0 && r.height > 0 }; });
        if (f && f.visible) { f.indicator = (f.outlineStyle !== 'none' && f.outlineW > 0) || f.shadow; report.focus.push(f); }
      }
      // Hint banners: contrast of text on its background.
      const ban = await page.evaluate(() => {
        const lum = c => { const a = c.match(/[\d.]+/g).map(Number); const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(a[0]) + 0.7152 * f(a[1]) + 0.0722 * f(a[2]); };
        const bgOf = e => { while (e) { const b = getComputedStyle(e).backgroundColor; const m = b.match(/[\d.]+/g); if (m && (m.length < 4 || +m[3] > 0.5)) return b; e = e.parentElement; } return 'rgb(255,255,255)'; };
        const out = []; document.querySelectorAll('[class*="banner"], [class*="hint"], .toast, [data-toast-container] > div').forEach(el => { if (!el.getBoundingClientRect().width) return; const t = (el.textContent || '').trim(); if (!t) return;
          const cs = getComputedStyle(el); const fg = cs.color, bg = bgOf(el); const a = lum(fg), b = lum(bg); const ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05); out.push({ cls: String(el.className).slice(0, 50), text: t.slice(0, 40), fg, bg, ratio: +ratio.toFixed(2) }); }); return out; });
      report.banners.push(...ban);
    }
    await page.click('.ppal-mode-btn:has-text("More")').catch(() => {}); await page.waitForTimeout(500); await run('tracker + More panel');
    await page.click('.ppal-more-close').catch(() => {}); await page.waitForTimeout(300);
    await page.evaluate(() => window.__openTrackerStats && window.__openTrackerStats()).catch(() => {}); await page.waitForTimeout(1500);
    await run('project Stats');
    await page.goto(BASE + 'index.html?mode=stats&from=home'); await page.waitForTimeout(3500);
    await page.evaluate(theme => document.documentElement.setAttribute('data-theme', theme), theme); await page.waitForTimeout(300);
    await run('global Stats');
    await close();
  }
  const out = path.join(__dirname, '..', 'a11y', 'phase5-audit-' + LABEL + '.json');
  fs.writeFileSync(out, JSON.stringify(report, null, 1)); console.log('written', out);
})();
