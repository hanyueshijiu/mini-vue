// 第二课：target/key 依赖清理与 stop。
// 教学范围：同步、浅层响应式；完整的嵌套生命周期后续加入。
const targetMap = new WeakMap();
let activeEffect;

function cleanup(runner) {
  for (const { target, key } of runner.deps) {
    const dep = targetMap.get(target)?.get(key);
    // 同一个属性可能还有别的订阅者，只移除当前 runner。
    dep?.delete(runner);
  }
  runner.deps.length = 0;
}

export function effect(fn) {
  function runner() {
    // 停止后保留手动调用，但不把自己设为当前订阅者。
    // 若外面正有另一个 effect 执行，读取仍可被那个外层 effect 收集。
    if (runner.stopped) return fn();

    cleanup(runner);
    const previous = activeEffect;
    activeEffect = runner;
    try {
      return fn();
    } finally {
      activeEffect = previous;
    }
  }

  // 初始化必须早于首次 runner()，第一次清理的就是空数组。
  runner.deps = [];
  runner.stopped = false;
  runner();
  return runner;
}

export function stop(runner) {
  if (runner.stopped) return;
  cleanup(runner);
  runner.stopped = true;
}

function track(target, key) {
  if (!activeEffect || activeEffect.stopped) return;

  let depsMap = targetMap.get(target);
  if (!depsMap) {
    depsMap = new Map();
    targetMap.set(target, depsMap);
  }

  let dep = depsMap.get(key);
  if (!dep) {
    dep = new Set();
    depsMap.set(key, dep);
  }

  if (!dep.has(activeEffect)) {
    dep.add(activeEffect);
    activeEffect.deps.push({ target, key });
  }
}

function trigger(target, key) {
  const dep = targetMap.get(target)?.get(key);
  if (!dep) return;

  // cleanup 会删除成员，track 又会加入成员；按快照通知本轮订阅者。
  for (const runner of new Set(dep)) {
    // 快照固定了函数引用，但引用上的停止状态仍可能改变。
    if (runner !== activeEffect && !runner.stopped) runner();
  }
}

export function reactive(target) {
  return new Proxy(target, {
    get(target, key, receiver) {
      const value = Reflect.get(target, key, receiver);
      track(target, key);
      return value;
    },
    set(target, key, value, receiver) {
      const oldValue = target[key];
      const success = Reflect.set(target, key, value, receiver);
      if (success && !Object.is(oldValue, value)) {
        trigger(target, key);
      }
      return success;
    },
  });
}
