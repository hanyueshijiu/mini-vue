// 第三课：已完成本轮巩固，待独立实践（2026-09-26）。
// 实践重点：按原始对象和 key 推演通知，再区分值比较、执行与依赖清理。
const targetMap = new WeakMap();
let activeEffect;

function cleanup(runner) {
  // 步骤 1：遍历 runner.deps 中的 { target, key }。
  // 找到对应的 Set，只删除当前 runner，然后清空 runner.deps。
  // 不要清空整个 Set，也不要清空 targetMap。
  for (const { target, key } of runner.deps) {
    const dep = targetMap.get(target)?.get(key);
    dep?.delete(runner);
  }
  runner.deps.length = 0;
}

export function effect(fn) {
  function runner() {
    // 步骤 4：若 runner.stopped 为 true，直接 return fn()。
    // 已停止时不进入下面的 cleanup 和 activeEffect 切换流程。
    if (runner.stopped) {
      return fn();
    }

    // 步骤 3：在执行用户函数、重新收集依赖之前，清理当前 runner 的旧订阅。
    cleanup(runner);
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
  if (runner.stopped) return;
  cleanup(runner);
  runner.stopped = true;
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
    activeEffect.deps.push({ target, key });
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

// 依赖表 targetMap 和代理缓存是不同用途的数据结构。
const reactiveMap = new WeakMap(); // 原始对象 -> 代理
const proxyToRaw = new WeakMap();  // 本模块创建的代理 -> 原始对象

function isObject(value) {
  return value !== null && typeof value === 'object';
}

// 已提供的配套逻辑：写入时把自己的代理还原为原始对象再比较。
// 例如 state.user = state.user，不应被误判成更换了对象。
function toRaw(value) {
  return isObject(value) ? (proxyToRaw.get(value) ?? value) : value;
}

export function reactive(target) {
  // 本课普通对象以外的基础值直接返回，避免 new Proxy(null) 等错误。
  if (!isObject(target)) return target;

  // 步骤 B：target 已是代理时返回自身；target 是原始对象时返回缓存代理。
  if (proxyToRaw.has(target)) {
    return target;
  }

  const existingProxy = reactiveMap.get(target);
  if (existingProxy) {
    return existingProxy;
  }

  const proxy = new Proxy(target, {
    get(target, key, receiver) {
      const value = Reflect.get(target, key, receiver);
      track(target, key);
      // 步骤 A：value 是对象时返回 reactive(value)，否则直接返回 value。
      return isObject(value) ? reactive(value) : value;
    },
    set(target, key, value, receiver) {
      const oldValue = toRaw(target[key]);
      const rawValue = toRaw(value);
      const success = Reflect.set(target, key, rawValue, receiver);
      if (success && !Object.is(oldValue, rawValue)) {
        trigger(target, key);
      }
      return success;
    },
  });

  // 步骤 C：两个缓存的登记方向相反，键表示以后拿什么来查找。
  reactiveMap.set(target, proxy); // 拿原始对象查代理：raw -> proxy
  proxyToRaw.set(proxy, target);  // 拿代理查原始对象：proxy -> raw
  return proxy;
}
