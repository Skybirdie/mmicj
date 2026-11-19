/* Join / Testify switch tests (front end): node frontForms-join-switch.test.mjs */
import fs from 'fs';
import vm from 'vm';
const SRC = fs.readFileSync(new URL('./js/frontForms.js', import.meta.url).pathname, 'utf8');
let fails = 0;
const ok = (c, m) => { if (!c) { console.log('FAIL', m); fails++; } else console.log('ok  ', m); };

function env(flags = {}) {
  const mkEl = () => ({
    dataset: {}, attrs: {}, style: { setProperty() {} }, offsetWidth: 220, listeners: {}, disabled: false, hidden: false, className: '',
    classList: { s: new Set(), toggle(c, f) { f ? this.s.add(c) : this.s.delete(c); }, add(c) { this.s.add(c); }, remove(c) { this.s.delete(c); }, contains(c) { return this.s.has(c); } },
    setAttribute(k, v) { this.attrs[k] = v; }, getAttribute(k) { return this.attrs[k]; }, removeAttribute(k) { delete this.attrs[k]; },
    addEventListener(t, f) { (this.listeners[t] = this.listeners[t] || []).push(f); },
    click() { if (this.disabled) return; (this.listeners.click || []).forEach(f => f({})); },
    appendChild(c) { return c; }, querySelector() { return null; }, contains() { return false; }, focus() {},
    getBoundingClientRect() { return { left: 100, width: 60, top: 500 }; }
  });
  const host = mkEl(), button = mkEl();
  const built = [];
  const doc = {
    readyState: 'complete', documentElement: { clientWidth: 400, clientHeight: 800 },
    getElementById: id => id === 'frontPage' ? host : id === 'frontFormsButton' ? button : null,
    createElement(tag) { const e = mkEl(); if (tag === 'template') e.content = { firstChild: mkEl() }; built.push(e); return e; },
    createTextNode: t => ({ t }), addEventListener() {}, body: mkEl(), head: mkEl()
  };
  const win = { document: doc, addEventListener() {}, requestAnimationFrame: f => f(), localStorage: { getItem: () => null, setItem() {} },
    MutationObserver: class { observe() {} }, setTimeout, clearTimeout, console, innerWidth: 400, innerHeight: 800 };
  if (flags.join !== undefined) win.__MMICJ_JOIN_ENABLED = flags.join;
  if (flags.testify !== undefined) win.__MMICJ_TESTIFY_ENABLED = flags.testify;
  win.window = win; vm.createContext(win);
  vm.runInContext(SRC, win);
  const rows = () => built.filter(e => e.className === 'ff-menu-btn');     /* [Join, Testify] once the menu is built */
  return { win, button, built, rows };
}

{ /* both on (nothing set): nothing changes */
  const e = env();
  ok(!e.button.disabled && !e.button.classList.contains('is-off') && e.button.attrs.title === 'Join or testify', 'nothing set: the small button is normal');
  e.button.click();
  const [j, t] = e.rows();
  ok(e.rows().length === 2 && !j.disabled && !t.disabled && !j.classList.contains('is-off') && !t.classList.contains('is-off'), 'nothing set: both menu rows are normal');
}
{ /* both explicitly on */
  const e = env({ join: true, testify: true });
  e.button.click();
  const [j, t] = e.rows();
  ok(!e.button.disabled && !j.disabled && !t.disabled, 'both true: all normal');
}
{ /* the planned use: Join off, Testify on */
  const e = env({ join: false });
  ok(!e.button.disabled && !e.button.classList.contains('is-off'), 'Join off only: the small button stays normal (Testify still works)');
  e.button.click();
  const [j, t] = e.rows();
  ok(e.rows().length === 2, 'Join off only: the menu still opens with both rows');
  ok(j.disabled && j.classList.contains('is-off') && j.attrs['aria-disabled'] === 'true' && /not available/i.test(j.attrs.title), 'Join off only: the Join row is dimmed and disabled');
  ok(!t.disabled && !t.classList.contains('is-off'), 'Join off only: the Testify row is normal');
  const before = e.built.length;
  e.win.FrontForms.open('join');
  ok(e.built.length === before, 'Join off only: FrontForms.open("join") opens nothing');
}
{ /* the opposite */
  const e = env({ testify: false });
  ok(!e.button.disabled, 'Testify off only: the small button stays normal');
  e.button.click();
  const [j, t] = e.rows();
  ok(!j.disabled && t.disabled && t.classList.contains('is-off'), 'Testify off only: only the Testify row is dimmed and disabled');
  const before = e.built.length;
  e.win.FrontForms.open('testify');
  ok(e.built.length === before, 'Testify off only: FrontForms.open("testify") opens nothing');
}
{ /* both off */
  const e = env({ join: false, testify: false });
  ok(e.button.disabled && e.button.classList.contains('is-off') && e.button.attrs['aria-disabled'] === 'true', 'both off: the small button is dimmed and disabled');
  ok(/not available/i.test(e.button.attrs.title) && /not available/i.test(e.button.attrs['aria-label']), 'both off: tooltip and screen-reader label say it is not available');
  e.button.click();
  ok(e.rows().length === 0, 'both off: tapping builds no menu');
}
{ /* only a real boolean false counts */
  const e = env({ join: 'false', testify: 0 });
  e.button.click();
  const [j, t] = e.rows();
  ok(!j.disabled && !t.disabled, 'a string or number is ignored: only the boolean false switches a form off');
}
const css = fs.readFileSync(new URL('./css/front-forms.css', import.meta.url).pathname, 'utf8');
ok(/#frontFormsButton:disabled,\s*#frontFormsButton\.is-off\{[^}]*opacity:\.35/.test(css), 'css: the disabled small button is dimmed');
ok(/#frontFormsButton:hover:not\(:disabled\)/.test(css), 'css: no hover lift on the disabled small button');
ok(/\.ff-menu-btn:disabled,\s*\.ff-menu-btn\.is-off\{[^}]*opacity:\.4/.test(css) && /\.ff-menu-btn:hover:not\(:disabled\)/.test(css), 'css: a disabled menu row is dimmed with no hover');
console.log(fails ? '\n' + fails + ' FAILED' : '\nall ok');
process.exit(fails ? 1 : 0);
