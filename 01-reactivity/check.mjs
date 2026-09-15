import assert from 'node:assert/strict';

const useReference = process.argv.includes('--reference');
const { reactive, effect } = await import(
  useReference ? './reference.mjs' : './practice.mjs'
);

const checks = [
  ['立即执行，并在依赖变化后同步重算', () => {
    const state = reactive({ count: 1 });
    let double;
    effect(() => { double = state.count * 2; });
    assert.equal(double, 2);
    state.count = 3;
    assert.equal(double, 6);
  }],
  ['只通知读取过该属性的函数', () => {
    const state = reactive({ count: 0, name: 'Vue' });
    let runs = 0;
    effect(() => { runs++; void state.count; });
    state.name = 'Mini Vue';
    assert.equal(runs, 1);
    state.count++;
    assert.equal(runs, 2);
  }],
  ['不同对象的同名属性相互独立', () => {
    const a = reactive({ count: 0 });
    const b = reactive({ count: 0 });
    let aRuns = 0;
    let bRuns = 0;
    effect(() => { aRuns++; void a.count; });
    effect(() => { bRuns++; void b.count; });
    a.count++;
    assert.equal(aRuns, 2);
    assert.equal(bRuns, 1);
  }],
  ['一个属性能通知多个订阅者，重复读取不会重复订阅', () => {
    const state = reactive({ count: 0 });
    let aRuns = 0;
    let bRuns = 0;
    effect(() => { aRuns++; void state.count; void state.count; });
    effect(() => { bRuns++; void state.count; });
    state.count++;
    assert.equal(aRuns, 2);
    assert.equal(bRuns, 2);
  }],
  ['值没变化不重跑，包括 NaN 到 NaN', () => {
    const state = reactive({ count: 1 });
    let runs = 0;
    effect(() => { runs++; void state.count; });
    state.count = 1;
    assert.equal(runs, 1);
    state.count = NaN;
    assert.equal(runs, 2);
    state.count = NaN;
    assert.equal(runs, 2);
  }],
  ['effect 之外的读取不会被误收集', () => {
    const state = reactive({ count: 0, name: 'Vue' });
    let runs = 0;
    effect(() => { runs++; void state.count; });
    void state.name;
    state.name = 'Mini Vue';
    assert.equal(runs, 1);
  }],
  ['返回的 runner 能手动执行并返回函数结果', () => {
    const state = reactive({ count: 2 });
    let runs = 0;
    const runner = effect(() => { runs++; return state.count * 2; });
    assert.equal(runs, 1);
    assert.equal(runner(), 4);
    assert.equal(runs, 2);
  }],
  ['函数抛错后恢复收集上下文', () => {
    const state = reactive({ other: 0 });
    assert.throws(() => effect(() => { throw new Error('预期错误'); }), /预期错误/);
    void state.other;
    assert.doesNotThrow(() => { state.other++; });
  }],
];

console.log(`检验：${useReference ? '参考实现' : '你的练习实现'}`);
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
console.log('本课验收只覆盖约定范围；依赖清理、深层代理、集合和调度会逐课补齐。');
