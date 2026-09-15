// 第 1 课：普通对象第一层属性的同步响应式。
// 教学模型，不是 Vue 源码拷贝；本课尚未实现依赖清理和深层代理。
const targetMap = new WeakMap();
let activeEffect;

export function effect(fn) {
  function runner() {
    const previous = activeEffect;
    activeEffect = runner;
    try {
      return fn();
    } finally {
      activeEffect = previous;
    }
  }
  runner();
  return runner;
}

function track(target, key) {
  if (!activeEffect) return;

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
  dep.add(activeEffect);
}

function trigger(target, key) {
  const dep = targetMap.get(target)?.get(key);
  if (!dep) return;

  // 固定本轮通知名单，避免执行期间的订阅变化干扰遍历。
  for (const runner of new Set(dep)) {
    // 防止当前函数直接触发自身；这不是完整的循环依赖处理。
    if (runner !== activeEffect) runner();
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
