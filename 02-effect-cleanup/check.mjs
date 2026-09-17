import assert from 'node:assert/strict';

const useReference = process.argv.includes('--reference');
const { reactive, effect } = await import(
  useReference ? './reference.mjs' : './practice.mjs'
);

const checks = [
  ['保留首次执行、值变化更新和手动 runner 的行为', () => {
    const state = reactive({ count: 1 });
    let runs = 0;
    let double;
    const runner = effect(() => {
      runs++;
      return (double = state.count * 2);
    });
    assert.equal(double, 2);
    assert.equal(runs, 1);
    state.count = 1;
    assert.equal(runs, 1);
    state.count = 2;
    assert.equal(double, 4);
    assert.equal(runs, 2);
    assert.equal(runner(), 4);
    assert.equal(runs, 3);
  }],
  ['切换分支后，旧属性不再触发多余执行', () => {
    const state = reactive({ ok: true, text: 'hello' });
    const values = [];
    effect(() => values.push(state.ok ? state.text : '隐藏'));
    state.ok = false;
    state.text = 'world';
    assert.deepEqual(values, ['hello', '隐藏']);
  }],
  ['分支切回来能重新订阅，多次切换后仍然正确', () => {
    const state = reactive({ ok: true, count: 1 });
    const values = [];
    effect(() => values.push(state.ok ? state.count + state.count : '隐藏'));
    state.ok = false;
    state.count = 2;
    state.ok = true;
    state.count = 3;
    state.ok = false;
    state.count = 4;
    state.ok = true;
    assert.deepEqual(values, [2, '隐藏', 4, 6, '隐藏', 8]);
  }],
  ['清理当前 runner 时保留同一属性上的其他订阅者', () => {
    const state = reactive({ ok: true, text: 'hello' });
    const aValues = [];
    const bValues = [];
    effect(() => aValues.push(state.ok ? state.text : '隐藏'));
    effect(() => bValues.push(state.text));
    state.ok = false;
    state.text = 'world';
    assert.deepEqual(aValues, ['hello', '隐藏']);
    assert.deepEqual(bValues, ['hello', 'world']);
  }],
  ['在不同对象的同名属性之间切换时清理正确', () => {
    const selection = reactive({ useA: true });
    const a = reactive({ count: 1 });
    const b = reactive({ count: 10 });
    const values = [];
    effect(() => values.push(selection.useA ? a.count : b.count));
    selection.useA = false;
    a.count = 2;
    b.count = 11;
    selection.useA = true;
    b.count = 12;
    a.count = 3;
    assert.deepEqual(values, [1, 10, 11, 2, 3]);
  }],
];

console.log(`第二课：${useReference ? '参考实现' : '你的练习实现'}`);
let passed = 0;
for (const [name, check] of checks) {
  try {
    check();
    passed++;
    console.log(`✓ ${name}`);
  } catch (error) {
    console.error(`✗ ${name}\n  ${error.message}`);
  }
}
console.log(`\n${passed}/${checks.length} 项通过。`);
if (passed !== checks.length) process.exitCode = 1;
if (!useReference && passed !== checks.length) {
  console.log('请检查 cleanup、track 的反向记录以及 runner 的清理时机。');
}
