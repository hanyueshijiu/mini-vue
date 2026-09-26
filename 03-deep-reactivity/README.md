# 第三课：深层响应式与代理缓存

这一课承接已完成的 effect、依赖清理和 stop，只集中修改 reactive。先让嵌套对象的读写也经过代理，再保证同一个原始对象复用同一个代理。readonly 和 ref 留到后续部分。

## 学习状态

**已完成（2026-09-26）。** 本课实现、行为验收及两轮问答复习已完成。共享对象的通知匹配、cleanup 的执行时机，以及 toRaw 与 set 的关系已整理为学习记录；文末保留选做练习，便于后续查漏补缺。

| 日期 | 学习进度 |
| --- | --- |
| 2026-09-21 | 跟随 README 完成实现，手写版通过 8 项验收 |
| 2026-09-25 | 完成首轮问答复习，记录引用和缓存的易混淆点 |
| 2026-09-26 | 完成巩固，第三课标记为已完成 |

首轮纠错见[复习重点](#本轮复习重点)，最新过程见[本轮巩固记录](#本轮巩固记录)。推演时先确认输入对象与缓存，再按实际的 target/key 匹配订阅。

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

根代理会在第一次读取嵌套属性前登记好。遇到 raw.self = raw 这样的循环引用时，读取 state.self 就能复用根代理，保持 state.self === state。创建代理时不会预先遍历 self，因此不能把“没有缓存”直接等同于“初始化时必然无限递归”。

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

当前手写实现已经通过以下 8 项验收。问答复习与巩固已经完成，后续可用这些用例检验独立重写的结果：

- 多层属性变化更新，未使用的属性不引起更新。
- 替换嵌套对象后清理旧对象订阅，并订阅新对象。
- 同一原始对象复用代理，已经是代理时不重复包装。
- 共享引用与循环引用保持一致的代理身份。
- 创建根代理时，不提前读取嵌套 getter。
- null、基础值和函数值不会被错误代理。
- 写回同一对象的代理不误触发，写入新对象的代理仍能正确更新。
- 深层依赖仍然支持 stop 和停止后的手动执行。

完成后再对照 [reference.mjs](./reference.mjs)。无需重写 effect、cleanup、stop、track 或 trigger。

## 实现时的易混淆点

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

## 本轮复习重点

本节保留 2026-09-25 首轮复习的纠错过程。以下场景按第三课已完成的实现推演，每段代码独立执行；先出现误判，再拆解调用顺序得到正确解释，不等同于已经能脱离提示完成所有推演。

### 1. 参数接收的是实参，不会自动变成原始对象

```js
const raw = { count: 1 };
const proxy1 = reactive(raw);
const another = reactive(proxy1);
```

最后一行传入的是括号中的 proxy1；another 负责接收返回值。进入 reactive 时，形参 target 与 proxy1 指向同一个代理对象，不会自动沿代理关系变成 raw。

| 同名参数出现的位置 | 参数由谁传入 | 本例中的含义 |
| --- | --- | --- |
| reactive(target) | 调用 reactive 的代码 | 传入 raw 就接收 raw；传入 proxy1 就接收 proxy1 |
| Proxy 的 get(target, key, receiver) | JavaScript 的 Proxy 机制 | 创建这个代理时传给 new Proxy 的对象 |

target 只是参数名，并不固定表示原始对象。本课正常创建的 Proxy 包装原始对象，所以 get 中的 target 通常是原始对象；这不改变 reactive 的普通传参规则。

proxyToRaw.has(proxy1) 只返回布尔值。要取出 raw，需要明确执行 proxyToRaw.get(proxy1)。识别到已经是自己的代理时，reactive 直接返回传入的代理，而不是返回它内部关联的原始对象。

### 2. 返回已有引用不会创建新对象，缓存会跨调用保留

```js
const raw = { count: 1 };
const a = reactive(raw);
const b = reactive(raw);
const c = reactive(a);

console.log(a === b);
console.log(a === c);
console.log(b === raw);
```

<details>
<summary>查看结果与逐次调用后的缓存状态</summary>

```text
true
true
false
```

| 调用 | target 接收谁 | 命中的路径 | 返回谁 |
| --- | --- | --- | --- |
| a = reactive(raw) | raw | 没有缓存，创建代理并登记两个方向 | 新代理，随后由 a 引用 |
| b = reactive(raw) | 同一个 raw | reactiveMap.get(raw) 取得已有代理 | a 所指的代理 |
| c = reactive(a) | 代理 a | proxyToRaw.has(a) 为 true | a 本身 |

第一行调用结束前就已经执行了登记，随后两张表包含：

```text
reactiveMap：raw → a
proxyToRaw：a   → raw
```

它们在 reactive 函数外创建，同一模块实例中的后续调用共用这些缓存，不会每次调用重新清空。整段代码只创建了一个 Proxy，a、b、c 都指向它。

首轮复习的最后一道综合题曾把 a === b 判断为 false，原因是漏掉了 a 那次调用返回之前已经登记缓存。后续推演时，要先写下上一行执行后留下的状态。

新变量名不代表新对象，函数返回已有对象也不会复制对象。const b = a 和函数直接 return a 都只是传递同一个对象引用。

</details>

查表时只按 key 查找，不会倒着按 value 查找。对于上面的记录，proxyToRaw.get(raw) 返回 undefined；raw 在这条记录中是 value，key 是代理 a。reactiveMap 用 raw 找代理，proxyToRaw 用代理找 raw。

### 3. 创建代理与登记订阅是不同动作

```js
const raw = {
  user: { profile: { age: 18 } },
  unused: { enabled: true },
};
const state = reactive(raw);
const user = state.user;
```

假设这些对象此前未创建过代理，这段代码会创建根代理和 user 代理；profile、unused 未被读取，尚未创建对应代理。age 和 enabled 是基本类型，本身不需要 Proxy。

这里没有调用 effect，没有 runner 执行，activeEffect 仍是 undefined。state.user 的 get 虽然调用 track，但 track 直接返回，不会登记订阅者。这个 return 只结束 track，get 仍会继续返回 user 的代理。

更深一层的误区是：即使已经有 effect，也只收集它执行期间实际读取的属性，不会因为返回了深层代理就自动订阅所有子属性。

下面三种写法分别独立考察；rawUser 表示首次执行时 raw.user 对应的原始对象：

| 写法 | 首次执行收集的 target/key |
| --- | --- |
| effect 内只读取 state.user | (raw, 'user') |
| effect 内读取 state.user.age | (raw, 'user') 和 (rawUser, 'age') |
| 在 effect 外先取 user = state.user，effect 内只读取 user.age | 只有 (rawUser, 'age') |

创建代理是在准备拦截能力，track 则需要一个当前执行的 runner 来登记关系。进入 set 也不会自动创建 effect；set 通过 trigger 通知已经登记的订阅者。

### 4. 提前保存的嵌套代理，不会随父属性替换自动改指向

先看在 effect 内沿 state.user.age 读取的情况：

```js
const state = reactive({ user: { age: 18 } });
const oldUser = state.user;

effect(() => console.log(state.user.age));
state.user = { age: 20 };
oldUser.age = 99;
// 打印：18、20
```

根对象的 user 属性也被订阅。替换 user 会重跑 runner，清理旧对象 age 的订阅，并读取、订阅新对象。oldUser 仍是有效代理，只是这个 runner 不再订阅它的 age。

再看提前保存 user、effect 内只读取 user.age 的情况：

```js
const state = reactive({ user: { age: 18 } });
const user = state.user;

effect(() => console.log(user.age));
state.user = { age: 20 };
user.age = 19;
console.log(state.user.age, user.age);
```

<details>
<summary>查看结果与引用关系</summary>

```text
18
19
20 19
```

| 位置 | 最后关联的对象 |
| --- | --- |
| 根原始对象的 user 属性 | 新对象，age 为 20 |
| 局部变量 user | 旧对象的代理，旧对象的 age 已改成 19 |

runner 执行期间只读取旧对象的 age，没有读取根对象的 user 属性。因此，替换 state.user 不通知它，修改 user.age 才通知它。

const user = state.user 保存的是当时得到的代理引用，不是一个会自动重新求值的表达式。依赖表也保存实际原始对象的引用与 key，不会把“raw.user.age”当作字符串路径，在父属性被替换后自行改绑。

</details>

### 5. 比较的是对象身份，toRaw 用于统一代理与原始值

从下面相同的初始状态，分别考察三种赋值：

```js
const raw = { user: { age: 18 } };
const state = reactive(raw);
```

| 赋值 | set 收到的新值 | 直接比较 target[key] 与 value | 转为原始值后比较 |
| --- | --- | --- | --- |
| state.user = state.user | user 的代理 | false | true，不因本次赋值通知更新 |
| state.user = raw.user | 原始 user 对象 | true | true，不因本次赋值通知更新 |
| state.user = { age: 18 } | 新创建的原始对象 | false | false，通知相应订阅者 |

右侧 state.user 会经过 get，最终返回代理；右侧 raw.user 则直接读取原始对象的属性。读取不会把 raw.user 中保存的原始对象替换成代理。

toRaw 将本模块的代理还原为原始对象引用，再用 Object.is 比较。它不克隆对象，也不比较两个对象的属性内容。两个新建的 { age: 18 } 内容相同，仍然是不同对象；如果 runner 订阅了根对象的 user，替换为新对象仍会让它执行。

### 6. 循环引用复用的是已有代理，没有额外包一层

```js
const raw = { count: 1 };
raw.self = raw;
const state = reactive(raw);
console.log(state.self === state); // true
```

读取 self 时，Reflect.get 取到的是 raw.self，也就是 raw。随后 reactive(raw) 在 reactiveMap 中找到已创建的根代理 state，直接返回，因此比较为 true。raw.self 仍指向 raw。

若取消缓存复用，让每次 reactive(raw) 都创建新 Proxy，本次比较会是 false。那是另一个直接包装 raw 的代理，不是在 state 外面再套一层：

```text
state          → 代理 A → raw
state.self结果 → 代理 B → raw
```

两个代理包装同一个原始对象，并不保证它们本身相等。缓存的作用是返回同一个已有代理；按需转换则保证创建代理时不预先展开整棵对象树。

## 本轮巩固记录

记录日期：2026-09-26。缓存题先分步确认调用后的记录，再扩展到共享对象与属性替换。后半部分改用完整代码推演，避免漏掉前面留下的对象引用和订阅状态。

### 1. 已在分步问答中确认的缓存关系

| 情况 | 结论 |
| --- | --- |
| 同一个 raw 再次传入 reactive | reactiveMap.get(raw) 返回已有代理 |
| 已有代理传入 reactive | proxyToRaw.has(proxy) 命中，直接返回该代理 |
| 两个内容相同的新对象分别传入 reactive | 两个不同的 key，各自创建代理 |
| 两个属性保存同一个 shared 对象 | 读取时都以 shared 为缓存 key，复用同一个代理 |

两张 WeakMap 在模块中共享。两个不同对象对应的是同一张表中的两条记录，并不是每次调用各创建一张新的表。

### 2. 访问路径不同，仍可能通知同一个订阅者

以下是共同的初始状态：

```js
const shared = { age: 18 };
const raw = { left: shared, right: shared };
const state = reactive(raw);
effect(() => console.log(state.left.age));
```

首次打印 18，并登记 (raw, 'left') 与 (shared, 'age')。下面各操作分别从这个初始状态单独考察：

| 操作 | 接收写入的 target/key | 是否通知这个 runner |
| --- | --- | --- |
| state.right.age = 19 | (shared, 'age') | 是，打印 19 |
| state.right = { age: 19 } | (raw, 'right') | 否 |
| state.left = { age: 30 } | (raw, 'left') | 是，打印 30 |

left、right 最初指向同一个 shared。通过 right 取得它的代理再写 age，与通过 left 读取时登记的是同一组 (shared, 'age')。依赖按原始对象引用和属性名匹配，不按 state.left.age、state.right.age 两段路径字符串匹配。

state.right = { age: 19 } 则是在写根对象的 right 属性。右侧对象里包含 age，不代表执行了子代理的 age 写入。

### 3. 没有执行 runner，就不会自动清理或重新订阅

本轮曾把“替换 right 属性”解释成删除 left 对应 runner 的旧订阅并重新订阅新对象。实际顺序是先由 trigger 查找匹配订阅；找不到这个 runner，它就不会执行，内部的 cleanup 也不会执行。

以下是本轮使用的完整场景。可在本课目录的独立 .mjs 文件中运行：

```js
import { reactive, effect } from './practice.mjs';

const shared = { age: 18 };
const raw = { left: shared, right: shared };
const state = reactive(raw);

const runner = effect(() => {
  console.log(state.left.age);
});

state.right = { age: 19 };
state.left.age = 20;

const oldLeft = state.left;
state.left = { age: 30 };
oldLeft.age = 40;
```

<details>
<summary>查看完整输出与订阅变化</summary>

```text
18
20
30
```

| 操作 | 输出与订阅变化 |
| --- | --- |
| 注册 effect | 打印 18，订阅根对象的 left 和 shared 的 age |
| 替换 right | 不通知这个 runner，原来的两条订阅都保留 |
| 修改 left.age | 通过 (shared, 'age') 通知，打印 20，重跑后仍订阅这两组关系 |
| 保存 oldLeft | 取得旧对象的代理，不新增这个 runner 的订阅 |
| 替换 left | 通过 (raw, 'left') 通知；清理旧订阅，读取新对象并打印 30 |
| 修改 oldLeft.age | 旧 shared 的 age 变成 40，但这个 runner 已不再订阅它，不打印 |

最后仍保留根对象 left 的订阅，age 的订阅已经移到新 left 对象。oldLeft 仍是有效代理，旧数据仍会变化；被移除的是当前 runner 对旧 age 的关系。

</details>

### 4. toRaw 统一比较身份，不代表提前跳过 set

下面是另一段独立代码：

```js
import { reactive, effect } from './practice.mjs';

const raw = { user: { age: 18 } };
const state = reactive(raw);
let runs = 0;

effect(() => {
  runs++;
  console.log(state.user.age);
});

state.user = state.user;
state.user = { age: 18 };
console.log('执行次数', runs);
```

输出是 18、18、执行次数 2。本轮已正确判断两次赋值分别不通知、通知；原因还需说清具体执行步骤。

第一次赋值右侧的 get 返回 user 代理。set 中旧值是原始 user，新值经 toRaw 还原后是同一个原始对象。Reflect.set 仍然执行写入，只是 Object.is(oldValue, rawValue) 为 true，不满足通知条件，所以不会调用 trigger。

第二次赋值创建了新对象。即使 age 仍是 18，原始对象引用不同，写入成功后会调用 trigger。它找到已有 runner，再由 runner 清理旧订阅、执行回调，并通过实际读取重新收集。

这里不能简化为“找到缓存就直接 return 掉整个赋值过程”。缓存返回、toRaw 还原、set 写入与比较、trigger 通知，是不同的步骤。

## 完成记录与选做练习

- [x] 完成首轮关于引用身份、按需代理、缓存和依赖收集的问答复习。
- [x] 在问答中写出两个 WeakMap 正确方向的登记语句。
- [x] 在本轮分步推演中正确说明原始对象复用代理、已有代理直接返回，以及共享对象复用代理。
- [x] 完成本轮共享引用与对象替换的完整代码推演，核对输出和订阅变化。
- [ ] 无提示一次性推演多个 reactive 调用，逐次列出缓存状态与返回值。
- [ ] 独立重写步骤 A、B、C，并通过本课验收。
- [ ] 独立区分 effect 内外读取嵌套对象时的订阅关系。
- [ ] 对一段新代码完整说明写入目标、原始值比较、通知匹配、runner 执行与依赖清理的顺序。

当前课程状态为“已完成”。未勾选条目保留为选做练习，可以在后续通过脱稿实现和完整流程说明继续巩固。

## 本课范围

验收范围是普通对象的属性读写、按需深层代理和本模块自己的代理缓存。这里仍未实现 readonly、ref、数组专有更新规则、Map/Set 等集合处理、特殊对象的内部槽语义、不可配置且不可写属性的代理约束、完整原型链写入处理，以及组件调度。

各课模块分别保存自己的缓存与依赖表，学习时请成套导入同一课的 reactive/effect/stop。直接通过原始对象修改属性仍然会绕过通知；代理并不会监听一切对原始对象的直接操作。
