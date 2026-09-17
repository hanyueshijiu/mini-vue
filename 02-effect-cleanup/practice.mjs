// 第二课：依赖清理与 stop 已完成，分别通过 5 项和 6 项行为验收。
const targetMap = new WeakMap();
let activeEffect;

function cleanup(runner) {
  // 步骤 1：遍历 runner.deps 中的 { target, key }。
  // 找到对应的 Set，只删除当前 runner，然后清空 runner.deps。
  // 不要清空整个 Set，也不要清空 targetMap。
  for (const { target, key } of runner.deps) {
    const dep = targetMap.get(target)?.get(key)
    dep?.delete(runner)
  }
  runner.deps.length = 0;
}

export function effect(fn) {
  function runner() {
    // 步骤 4：若 runner.stopped 为 true，直接 return fn()。
    // 已停止时不进入下面的 cleanup 和 activeEffect 切换流程。
    if (runner.stopped) {
      return fn()
    }

    // 步骤 3：在执行用户函数、重新收集依赖之前，清理当前 runner 的旧订阅。
    cleanup(runner)
    const previous = activeEffect;
    activeEffect = runner;
    try {
      return fn();
    } finally {
      activeEffect = previous;
    }
  }

  runner.deps = [];
  runner.stopped = false;
  runner();
  return runner;
}

export function stop(runner) {
  // 步骤 5：已停止则直接返回；否则清理已有订阅，并将 stopped 设为 true。
  // 不要清空整个 targetMap，也不要修改响应式对象的值。
  if (runner.stopped) return
  cleanup(runner)
  runner.stopped = true
}

function track(target, key) {
  // 额外保护：函数执行到一半停止自己后，后续读取不再为它收集依赖。
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
    // 步骤 2：让 activeEffect.deps 记住这组 { target, key }。
    activeEffect.deps.push({ target, key })
    // 这里在新订阅建立时执行，避免重复读取造成反向记录重复。
  }
}

function trigger(target, key) {
  const dep = targetMap.get(target)?.get(key);
  if (!dep) return;

  // 清理、重新收集会改变原 Set，这里保留第一课的快照遍历。
  for (const runner of new Set(dep)) {
    // 快照里的 runner 也可能在本轮中途被停止，自动通知时再检查一次。
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
