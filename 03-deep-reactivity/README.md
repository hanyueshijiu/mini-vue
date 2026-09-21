# 第三课：深层响应式与代理缓存

这一课承接已完成的 effect、依赖清理和 stop，只集中修改 reactive。先让嵌套对象的读写也经过代理，再保证同一个原始对象复用同一个代理。readonly 和 ref 留到后续部分。

## 学习状态

**已学习，待复习（2026-09-21）。** 已跟随 README 完成三个步骤，手写实现通过 8 项验收；尚未完成本课的独立练习与系统复习。下一轮优先回顾代理缓存命中的返回值，以及两个 WeakMap 的登记方向。

## 先观察第二课的边界

```js
const state = reactive({ user: { age: 18 } });
effect(() => console.log(state.user.age));

state.user.age = 19;
state.user = { age: 20 };
```

第二课只打印 18、20。age 确实改成过 19，但修改嵌套属性时没有通知这个 effect。

读取 state.user.age 可以分成两步：

```js
const user = state.user; // 最外层 Proxy.get，订阅“根对象的 user”
const age = user.age;    // user 还是原始对象，没有第二层 get 拦截
```

同样，state.user.age = 19 先通过最外层 get 取出 user，然后直接修改这个原始对象的 age；它不会调用最外层的 set。state.user = 新对象则是在替换根对象的 user 属性，会进入最外层 set。

可以从仓库根目录运行对比演示：

```bash
npm run demo:03:reference
```

它先运行第二课，再运行第三课参考实现。第二课 effect 读取到 18、20；第三课 effect 读取到 18、19、20。单独打印的“当前数据中的 age”用来区分数据已经改变与 effect 是否执行。

## 第一步：读到嵌套对象时，再给它代理

沿用原来的 get，先 Reflect.get，再 track。新增的事情是检查返回值：

```js
const value = Reflect.get(target, key, receiver);
track(target, key);

// value 是对象：返回 reactive(value)
// value 是基本类型或 null：直接返回 value
```

现在访问 state.user.age 的过程就能变成：

```text
读取 state.user
  → 根对象的 Proxy.get
  → 收集“根对象、user”的依赖
  → 返回 user 对象的代理

继续读取 userProxy.age
  → user 对象的 Proxy.get
  → 收集“user 原始对象、age”的依赖
  → 返回数字 18
```

同一个 runner 会同时订阅两组不同的 target/key：

```text
根原始对象    → user → Set(runner)
user 原始对象 → age  → Set(runner)
```

以后，修改 age 由第二层代理通知；替换整个 user 由第一层代理通知。替换后，第二课的 cleanup 会清掉旧 user 上的订阅，并在本次执行中订阅新的 user。

这一策略叫按需转换：读取到哪一层对象，才为那一层创建代理。创建根代理时不递归遍历整个对象，也不提前读取所有 getter。Vue 对普通嵌套对象的转换可以在 [baseHandlers.ts 的 get](https://github.com/vuejs/core/blob/v3.5.42/packages/reactivity/src/baseHandlers.ts#L118)中对照。

递归代理不等于深拷贝。每层代理仍然操作对应的原始对象；get 返回嵌套代理，也不等于把原对象的属性替换成代理。

## 第二步：复用代理，保持对象身份一致

如果每次读取嵌套对象都直接 new Proxy，就会创建不同的代理对象：

```js
const raw = { user: { age: 18 } };
const state = reactive(raw);

// 只有按需代理、没有缓存时，这个比较可能变成 false：
state.user === state.user;
```

它们虽然操作同一个原始对象，却是不同的代理引用。我们希望：

```js
reactive(raw) === reactive(raw);       // true
state.user === state.user;            // true
reactive(raw.user) === state.user;    // true
reactive(state) === state;            // true
```

为此新增两个缓存。它们与之前的依赖表作用不同：

| 数据结构 | 保存什么 | 解决的问题 |
| --- | --- | --- |
| targetMap | 原始对象 → 属性 → 订阅者 | 属性变化时通知谁 |
| reactiveMap | 原始对象 → 代理 | 是否已经为这个对象创建过代理 |
| proxyToRaw | 本模块创建的代理 → 原始对象 | 是否已经是代理，以及取得它对应的原始对象 |

reactive 的入口顺序是：

1. 非对象值直接返回，避免对 null、数字等创建 Proxy。
2. 如果 target 已经是本模块的代理，直接返回它。
3. 如果原始对象已有缓存代理，返回缓存。
4. 否则创建新代理，把两个方向都登记好，再返回。

根代理会在第一次读取嵌套属性前登记好。遇到 raw.self = raw 这样的循环引用时，读取 state.self 就能复用根代理，而不必递归创建无穷多份代理。

Vue 正式实现同样保留原始对象到代理的缓存，同时使用内部标记识别代理；本课用反向 WeakMap 便于观察。对应入口为 [createReactiveObject](https://github.com/vuejs/core/blob/v3.5.42/packages/reactivity/src/reactive.ts#L251)。

## 已实现的三个步骤

打开 [practice.mjs](./practice.mjs)。前半部分保留第二课完成的核心逻辑，本课的三个修改都位于 reactive 中；现已按说明实现，复习时可以在本地副本中重新手写：

- 步骤 A：get 读到对象时，返回 reactive(value)，让后续的深层属性读取也经过代理。
- 步骤 B：在创建 Proxy 之前，识别自己的代理并检查已有缓存。
- 步骤 C：创建新代理后，记录 raw → proxy、proxy → raw 两个方向。

isObject 和 toRaw 辅助函数已提供。前者排除 null 和非对象值；后者配合 set，将本模块的代理还原为原始对象后比较并写入。

## 一个已配好的写入细节

```js
state.user = state.user;
```

左边设置的是根对象的 user，右边读取到的是 userProxy。原始对象中保存的却是 rawUser。直接比较 rawUser 和 userProxy，会把同一个对象误判成发生了替换。

本课已在 set 中用 toRaw 统一旧值和新值，再比较、写入。这不是克隆对象，只是通过 proxyToRaw 找回对应的原始对象。先集中理解 get 的转换与缓存，再回来看这段配套逻辑。

## 运行和验收

在仓库根目录运行：

```bash
npm run test:03
npm run test:03:reference
npm run demo:03
npm run demo:03:reference
```

也可以直接运行本目录的 check.mjs、demo.mjs，使用 --reference 选择参考实现。

当前手写实现已经通过以下 8 项验收。行为验收通过记录的是本课约定的实现结果，独立解释和练习仍保留为待复习事项：

- 多层属性变化更新，未使用的属性不引起更新。
- 替换嵌套对象后清理旧对象订阅，并订阅新对象。
- 同一原始对象复用代理，已经是代理时不重复包装。
- 共享引用与循环引用保持一致的代理身份。
- 创建根代理时，不提前读取嵌套 getter。
- null、基础值和函数值不会被错误代理。
- 写回同一对象的代理不误触发，写入新对象的代理仍能正确更新。
- 深层依赖仍然支持 stop 和停止后的手动执行。

完成后再对照 [reference.mjs](./reference.mjs)。无需重写 effect、cleanup、stop、track 或 trigger。

## 本轮易混淆点

### 步骤 B：两种命中情况，返回值不同

练习时曾尝试把两个判断合并后统一返回 target：

```js
// 这个写法的返回值有问题，保留在这里用于复习。
if (proxyToRaw.has(target) || reactiveMap.get(target)) return target;
```

| 命中情况 | target 的身份 | 应返回什么 |
| --- | --- | --- |
| proxyToRaw.has(target) | 本模块创建的代理 | target 自身 |
| reactiveMap.get(target) | 已经有代理的原始对象 | 缓存中的代理 |

第二种情况下仍返回 target，就会把原始对象返回给调用者，绕过代理。应该分别判断：

```js
if (proxyToRaw.has(target)) return target;

const existingProxy = reactiveMap.get(target);
if (existingProxy) return existingProxy;
```

复习时用同一个 raw 连续调用两次 reactive，解释为什么第二次应该返回第一次创建的代理。

### 步骤 C：两个 WeakMap 的方向

实现时曾把两张表的登记方向混淆；当前代码已经是正确方向：

```js
reactiveMap.set(target, proxy); // 原始对象 -> 代理
proxyToRaw.set(proxy, target);  // 代理 -> 原始对象
```

记忆时先想“以后拿什么来查”，它就是 key：

| 缓存 | key | value | 对应读取 |
| --- | --- | --- | --- |
| reactiveMap | 原始对象 raw | 代理 proxy | reactiveMap.get(raw) 得到已有代理 |
| proxyToRaw | 代理 proxy | 原始对象 raw | proxyToRaw.has(proxy) 识别代理；get(proxy) 还原原始对象 |

```text
raw ── reactiveMap ──→ proxy
raw ←── proxyToRaw ─── proxy
```

这两张表存的是对象与代理的对应关系；targetMap 存的是原始对象、属性和订阅者的关系。复习时要分别说明它们解决的问题。

## 待复习清单

- [ ] 脱离 README 解释两个 WeakMap 各自的 key、value 和用途。
- [ ] 分别推演 reactive(raw) 首次调用、再次调用和 reactive(proxy) 的返回值。
- [ ] 独立重写步骤 A、B、C，并通过本课验收。
- [ ] 解释 state.user.age 的两次读取分别触发哪个对象的 get，收集哪两组 target/key。
- [ ] 解释按需代理与创建时遍历整棵对象树的区别，并区分创建代理和收集依赖。
- [ ] 解释 state.user = state.user 为什么需要比较原始对象身份。

完成这些复习后，再更新学习状态；当前保持“已学习，待复习”。

## 本课范围

验收范围是普通对象的属性读写、按需深层代理和本模块自己的代理缓存。这里仍未实现 readonly、ref、数组专有更新规则、Map/Set 等集合处理、特殊对象的内部槽语义、不可配置且不可写属性的代理约束、完整原型链写入处理，以及组件调度。

各课模块分别保存自己的缓存与依赖表，学习时请成套导入同一课的 reactive/effect/stop。直接通过原始对象修改属性仍然会绕过通知；代理并不会监听一切对原始对象的直接操作。
