import assert from 'node:assert/strict';

const useReference = process.argv.includes('--reference');
const { reactive, effect, stop } = await import(
  useReference ? './reference.mjs' : './practice.mjs'
);

const checks = [
  ['停止后不再自动更新，响应式数据仍然正常变化', () => {
    const state = reactive({ count: 1 });
    let runs = 0;
    let double;
    const runner = effect(() => { runs++; double = state.count * 2; });
    assert.equal(runs, 1);
    stop(runner);
    state.count = 2;
    assert.equal(state.count, 2);
    assert.equal(double, 2);
    assert.equal(runs, 1);
  }],
  ['手动调用返回最新计算结果，但不重新开启自己的自动订阅', () => {
    const state = reactive({ count: 1 });
    let runs = 0;
    const runner = effect(() => { runs++; return state.count * 2; });
    stop(runner);
    state.count = 2;
    assert.equal(runner(), 4);
    assert.equal(runs, 2);
    state.count = 3;
    assert.equal(runs, 2);
    assert.equal(runner(), 6);
    assert.equal(runs, 3);
  }],
  ['停止一个 runner 不影响同一属性上的其他订阅者', () => {
    const state = reactive({ count: 1 });
    const aValues = [];
    const bValues = [];
    const a = effect(() => aValues.push(state.count));
    effect(() => bValues.push(state.count));
    stop(a);
    state.count = 2;
    assert.deepEqual(aValues, [1]);
    assert.deepEqual(bValues, [1, 2]);
  }],
  ['重复停止安全，手动调用后仍保持停止状态', () => {
    const state = reactive({ count: 1 });
    let runs = 0;
    const runner = effect(() => { runs++; return state.count; });
    stop(runner);
    stop(runner);
    assert.equal(runner(), 1);
    stop(runner);
    state.count = 2;
    assert.equal(runs, 2);
  }],
  ['进阶：外层 effect 调用已停止的 runner 时，读取仍归外层收集', () => {
    const state = reactive({ count: 1 });
    const inner = effect(() => state.count * 2);
    stop(inner);
    const values = [];
    effect(() => values.push(inner()));
    state.count = 2;
    assert.deepEqual(values, [2, 4]);
  }],
  ['进阶：本轮通知快照中的 runner 被停止后，应跳过自动调用', () => {
    const state = reactive({ count: 0 });
    let second;
    effect(() => {
      if (state.count === 1) stop(second);
    });
    const values = [];
    second = effect(() => values.push(state.count));
    state.count = 1;
    assert.deepEqual(values, [0]);
    state.count = 2;
    assert.deepEqual(values, [0]);
  }],
];

console.log(`第二课 stop：${useReference ? '参考实现' : '你的练习实现'}`);
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
  console.log('请检查 stop 的清理与状态标记，以及 runner 对停止状态的处理。');
}
