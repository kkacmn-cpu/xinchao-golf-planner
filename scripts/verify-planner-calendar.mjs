import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';

if (process.argv[2] !== '--child') {
  for (const timezone of ['Asia/Ho_Chi_Minh', 'Asia/Seoul', 'America/Los_Angeles']) {
    process.stdout.write(execFileSync(process.execPath, [process.argv[1], '--child'], {
      encoding: 'utf8',
      env: { ...process.env, TZ: timezone },
    }));
  }
} else {
  const source = readFileSync(resolve('assets/planner-runtime.js'), 'utf8');
  const elements = new Map();
  const element = (selector) => {
    if (!elements.has(selector)) {
      elements.set(selector, {
        value: '', hidden: false, innerHTML: '', textContent: '',
        listeners: {},
        addEventListener(name, listener) { this.listeners[name] = listener; },
      });
    }
    return elements.get(selector);
  };
  const document = {
    getElementById(id) { return id === 'golf-data' ? { textContent: '{"courses":[]}' } : null; },
    querySelector(selector) { return selector === '.menu-toggle' || selector === '#mobile-menu' ? null : element(selector); },
    addEventListener() {},
  };
  const writes = [];
  const localStorage = {
    getItem() { return null; },
    setItem(key, value) { writes.push({ key, value }); },
    removeItem() {},
  };
  runInNewContext(source, { document, localStorage, Date, JSON, Number, Object, Set, String });

  function submit(start, end, requested) {
    element('#planner-region').value = 'hochiminh';
    element('#planner-arrival').value = start;
    element('#planner-departure').value = end;
    element('#planner-rounds').value = String(requested);
    element('#planner-players').value = '4';
    element('#planner-form').listeners.submit({ preventDefault() {} });
    return element('#planner-timeline').innerHTML;
  }

  for (const [start, end, middle] of [
    ['2026-10-16', '2026-10-19', ['2026-10-17', '2026-10-18']],
    ['2026-03-07', '2026-03-10', ['2026-03-08', '2026-03-09']],
    ['2026-11-01', '2026-11-04', ['2026-11-02', '2026-11-03']],
  ]) {
    const html = submit(start, end, 2);
    assert.match(html, new RegExp(start));
    assert.match(html, new RegExp(end));
    for (const day of middle) assert.match(html, new RegExp(day));
    assert.equal((html.match(/data-day=/g) || []).length, 4);
    assert.equal(element('#planner-title').textContent, '4인 3박 4일 · 2회');
  }

  const writeCount = writes.length;
  submit('2026-10-16', '2026-10-19', 4);
  assert.equal(element('#planner-error').hidden, false);
  assert.match(element('#planner-error').textContent, /최대 2회/);
  assert.equal(writes.length, writeCount);
  console.log(`${process.env.TZ}: date-input/timeline 3 cases + invalid-round fail-closed PASS`);
}
