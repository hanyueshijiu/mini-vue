// 请按 README 的顺序完成四个函数，再运行 node check.mjs。
// 不需要安装 Vue 或任何 npm 依赖。
const targetMap = new WeakMap();
let activeEffect;

export function effect(fn) {
  // 1. 创建 runner，执行 fn 前记录当前 runner。
  function runner() {
    const previous = activeEffect;
    activeEffect = runner; // 告诉系统，接下来发生的读取属于这个函数

    try {
      return fn(); // 真正运行用户逻辑，读取属性时就有机会收集依赖
    } finally {
      activeEffect = previous; // 执行结束或抛错后，都恢复之前的上下文，避免后面的普通读取被错误关联
    }
  }
  // 2. 用 try/finally 恢复之前的 activeEffect。
  // 3. 立即执行一次，并返回 runner。
  runner()
  return runner;
}

function track(target, key) {
  // 1. 没有正在执行的 effect，就不收集。
  if (!activeEffect) return;
  // 2. 按 target -> key -> Set<runner> 查找/创建容器。
  let depsMap = targetMap.get(target);
  if (!depsMap) {
    depsMap = new Map();
    targetMap.set(target, depsMap)
  }

  let dep = depsMap.get(key);
  if(!dep) {
    dep = new Set();
    depsMap.set(key, dep)
  }
  // 3. 把 activeEffect 加入集合。

  dep.add(activeEffect)
}

function trigger(target, key) {
  // 1. 找到这个对象的这个属性对应的集合；不存在就返回。
  const dep = targetMap.get(target)?.get(key)
  if(!dep) return
  // 2. 复制集合，执行其中的 runner，跳过 activeEffect。
  for(const runner of new Set(dep)) {
    if(runner !== activeEffect) {
      runner()
    }
  }
}

export function reactive(target) {
  // 返回 Proxy：get 中 Reflect.get + track；set 中 Reflect.set + trigger。
  return new Proxy(target, {
    get(target, key, receiver) {
      const value = Reflect.get(target, key, receiver);
      track(target, key);
      return value;
    },

    set(target, key, value, receiver) {
      const oldValue = target[key];
      const success = Reflect.set(target, key, value, receiver);

      if(success && !Object.is(oldValue, value)) {
        trigger(target, key)
      }

      return success;
    }
  })
  // 写入成功且 !Object.is(oldValue, value) 才通知。
  // set 必须返回 Reflect.set 的布尔结果。
}
