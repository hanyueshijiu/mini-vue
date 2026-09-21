import assert from 'node:assert/strict';

const useReference = process.argv.includes('--reference');
const { reactive, effect, stop } = await import(
  useReference ? './reference.mjs' : './practice.mjs'
);

const checks = [
  ['嵌套多层属性变化会更新，未读取的属性不触发更新', () => {
    const state = reactive({ user: { profile: { age: 18, name: 'Ada' } } });
    const values = [];
    effect(() => values.push(state.user.profile.age));
    state.user.profile.age = 19;
    state.user.profile.name = 'Grace';
    state.user.profile.age = 19;
    assert.deepEqual(values, [18, 19]);
  }],
  ['替换嵌套对象后，重新订阅新对象并清理旧对象的订阅', () => {
    const state = reactive({ user: { name: 'Ada' } });
    const values = [];
    effect(() => values.push(state.user.name));
    const oldUser = state.user;
    state.user = { name: 'Grace' };
    oldUser.name = '旧对象';
    state.user.name = 'Lin';
    assert.deepEqual(values, ['Ada', 'Grace', 'Lin']);
  }],
  ['同一原始对象复用代理，重复读取与 reactive(proxy) 保持身份一致', () => {
    const raw = { user: { age: 18 } };
    const state = reactive(raw);
    assert.notStrictEqual(state, raw);
    assert.notStrictEqual(state.user, raw.user);
    assert.strictEqual(reactive(raw), state);
    assert.strictEqual(state.user, state.user);
    assert.strictEqual(reactive(raw.user), state.user);
    assert.strictEqual(reactive(state), state);
    assert.strictEqual(reactive(state.user), state.user);
  }],
  ['共享引用和循环引用能够复用同一个代理', () => {
    const shared = { count: 1 };
    const raw = { left: shared, right: shared };
    raw.self = raw;
    const state = reactive(raw);
    assert.strictEqual(state.self, state);
    assert.strictEqual(state.left, state.right);
    const values = [];
    effect(() => values.push(state.self.left.count));
    state.right.count = 2;
    assert.deepEqual(values, [1, 2]);
  }],
  ['按需转换：创建根代理时，不提前读取嵌套 getter', () => {
    let reads = 0;
    const child = { age: 18 };
    const raw = {
      get user() {
        reads++;
        return child;
      },
    };
    const state = reactive(raw);
    assert.equal(reads, 0);
    assert.equal(state.user.age, 18);
    assert.equal(reads, 1);
  }],
  ['null、基础值和函数值不会被错误代理', () => {
    const fn = () => 1;
    const mark = Symbol('mark');
    const state = reactive({ value: null, count: 0, text: '', fn, mark });
    assert.strictEqual(reactive(null), null);
    assert.strictEqual(reactive(1), 1);
    assert.strictEqual(reactive(fn), fn);
    assert.strictEqual(state.value, null);
    assert.strictEqual(state.count, 0);
    assert.strictEqual(state.text, '');
    assert.strictEqual(state.fn, fn);
    assert.strictEqual(state.mark, mark);
  }],
  ['写回同一对象的代理不会误触发，写入新代理仍能正确更新', () => {
    const user = { age: 18 };
    const raw = { user };
    const state = reactive(raw);
    const values = [];
    effect(() => values.push(state.user.age));
    state.user = state.user;
    state.user = user;
    assert.deepEqual(values, [18]);
    assert.strictEqual(raw.user, user);
    const nextUser = { age: 20 };
    state.user = reactive(nextUser);
    assert.strictEqual(raw.user, nextUser);
    state.user.age = 21;
    assert.deepEqual(values, [18, 20, 21]);
  }],
  ['深层依赖仍支持 stop，手动执行不重新订阅自身', () => {
    const state = reactive({ user: { age: 18 } });
    const values = [];
    const runner = effect(() => {
      const value = state.user.age;
      values.push(value);
      return value;
    });
    state.user.age = 19;
    stop(runner);
    state.user.age = 20;
    assert.equal(runner(), 20);
    state.user.age = 21;
    assert.deepEqual(values, [18, 19, 20]);
  }],
];

console.log(`第三课：${useReference ? '参考实现' : '你的练习实现'}`);
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
  console.log('请检查深层返回、代理复用，以及两个 WeakMap 的登记方向。');
}
