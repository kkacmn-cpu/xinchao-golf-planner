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
  const listeners = {};
  const document = {
    getElementById(id) { return id === 'golf-data' ? { textContent: JSON.stringify({ courses: [
      { course_id: 'c1', region_id: 'hochiminh', name_ko: '첫 코스', official_name: 'Course One', region_ko: '호치민' },
      { course_id: 'c2', region_id: 'hochiminh', name_ko: '둘째 코스', official_name: 'Course Two', region_ko: '호치민' },
      { course_id: 'c3', region_id: 'hochiminh', name_ko: '셋째 코스', official_name: 'Course Three', region_ko: '호치민' },
    ] }) } : null; },
    querySelector(selector) { return selector === '.menu-toggle' || selector === '#mobile-menu' ? null : element(selector); },
    addEventListener(name, listener) { listeners[name] = listener; },
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
  function click(attribute, value) {
    const selector = `[${attribute}]`;
    listeners.click({ target: { closest(query) { return query === selector ? { dataset: { [attribute.replace(/^data-/, '').replace(/-([a-z])/g, (_, char) => char.toUpperCase())]: value } } : null; } } });
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

  submit('2026-10-16', '2026-10-20', 2);
  click('data-select-date', '2026-10-19');
  click('data-add-course', 'c1');
  assert.match(element('#planner-timeline').innerHTML, /2026-10-19 · 호치민 · 왕복 차량 확인/);
  assert.equal(JSON.parse(writes.at(-1).value).assignments['2026-10-19'], 'c1');
  click('data-select-date', '2026-10-17');
  click('data-add-course', 'c2');
  assert.equal(element('#planner-count').textContent, '배치 2 / 요청 2');
  assert.equal(JSON.parse(writes.at(-1).value).assignments['2026-10-17'], 'c2');
  const fullWriteCount = writes.length;
  click('data-select-date', '2026-10-18');
  click('data-add-course', 'c3');
  assert.equal(writes.length, fullWriteCount);
  assert.match(element('#planner-error').textContent, /모두 채워졌습니다/);
  click('data-remove-date', '2026-10-19');
  assert.equal(element('#planner-count').textContent, '배치 1 / 요청 2');
  assert.equal(JSON.parse(writes.at(-1).value).assignments['2026-10-19'], undefined);
  console.log(`${process.env.TZ}: date-input/timeline 3 cases + arbitrary round days + overflow/write0 PASS`);
}
