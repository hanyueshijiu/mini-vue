# 手写 Mini Vue：第 1 课

我们以 Vue 3 为主线，使用 JavaScript 手写，通过运行结果检验理解，再对照 TypeScript 源码。源码阅读固定在 [v3.5.42](https://github.com/vuejs/core/tree/v3.5.42)，避免 main 分支持续变化导致名称和实现不一致。

## 模块地图

| 包 | 负责的问题 |
| --- | --- |
| reactivity | 记录“谁读取了哪个状态”，变化后通知订阅者；包括 reactive、effect、ref、computed 等 |
| runtime-core | VNode、组件实例、组件更新、调度、虚拟 DOM patch；通过宿主操作接口完成渲染 |
| runtime-dom | 浏览器 DOM 节点操作、属性、样式和事件的实际处理 |
| compiler-core | 模板解析、AST 转换、生成渲染函数代码 |
| compiler-dom | 扩展面向浏览器的模板编译规则 |
| compiler-sfc | 处理 .vue 文件的 template、script、style，提供编译工具 |
| shared | 各包共用的内部工具 |
| vue | 面向使用者的入口，不同构建组合不同能力 |
| server-renderer / compiler-ssr | 服务端渲染及对应编译，完成客户端主线后再学 |

模块职责参见 [Vue 官方仓库结构说明](https://github.com/vuejs/core/blob/v3.5.42/.github/contributing.md#project-structure)。

响应式系统管理依赖，渲染器管理节点；组件更新函数把两者连接起来。模板经编译生成 render 函数；组件渲染时执行 render 得到 VNode，再挂载或比较新旧 VNode 并更新宿主节点。编译通常发生在构建时，不会在每次状态变化时重做。参见 [官方渲染机制](https://vuejs.org/guide/extras/rendering-mechanism.html)。

## 后续路线

1. reactive / effect / track / trigger：普通对象属性变化后自动重算。
2. 依赖清理、嵌套执行、stop：修复条件分支导致的过期订阅。
3. 深层 reactive、代理缓存、readonly；再处理数组、遍历与集合的差异。
4. ref / toRef / proxyRefs：基本类型和属性引用如何接入响应式。
5. computed：懒计算、缓存、失效以及作为依赖被订阅。
6. scheduler / 微任务队列 / nextTick：批量更新及执行时机。
7. watch / watchEffect：数据源、旧值、清理回调与调度。
8. VNode / h / createRenderer：把节点描述挂载到页面，分离宿主操作。
9. 组件：实例、setup、props、emit、slots、生命周期；渲染 effect 串起自动更新。
10. patch / keyed diff：文本、属性、子节点更新，再处理 key、移动与最长递增子序列。
11. 编译器：parse → transform → generate；先支持文本、插值、普通元素，再扩展指令。
12. 把编译器与运行时接通；回到官方源码研究编译优化和生产实现的数据结构。

每一步的完成标准：能预测输出、手写通过验收、解释数据结构的目的、指出教学版与正式源码的差异。

## 本课只解决一件事

```js
const state = reactive({ count: 1, name: 'Vue' });
let double;
effect(() => { double = state.count * 2; });
// double === 2
state.count = 2;
// double === 4，没有手动调用计算函数
```

普通赋值 `let double = count * 2` 只计算一次。要自动重算，需要保存“计算过程”，然后知道何时再次执行它。

四个函数的分工：

- `effect(fn)`：执行函数，执行期间把当前 runner 放进 activeEffect。
- `track(target, key)`：属性被读取时，把当前 runner 记在对应属性下。
- `trigger(target, key)`：属性变化时找到并执行其订阅者。
- `reactive(target)`：使用 Proxy 拦截属性读写，接上 track / trigger。

依赖结构：

```text
WeakMap（targetMap）
  原始对象 A → Map
                count → Set(runner1, runner2)
                name  → Set(runner3)
  原始对象 B → Map
                count → Set(runner4)
```

按原始对象区分，防止同名属性串扰；按属性区分，避免对象任意变化都重算；Set 去重，避免重复读取造成重复订阅。WeakMap 不会仅因为其键就把原始对象永久保留，但它不负责清除活对象上的过期 effect，后者需要依赖清理和 stop。

## 动手顺序

`practice.mjs` 当前保存已完成的手写练习与学习注释。重新练习时，可以在本地副本中按下面四个步骤独立实现，再对照参考答案。

1. 写 `effect`：runner 执行前保存旧 activeEffect，设置新 activeEffect；用 `try/finally` 恢复；先执行一次，再返回 runner。
2. 写 `track`：没有 activeEffect 时直接返回；逐层创建 Map、Set；把 runner 加入 Set。
3. 写 `trigger`：找到 Set，复制后遍历，执行每个 runner；跳过 activeEffect，防止直接触发自己。
4. 写 `reactive`：get 中使用 Reflect.get 并收集；set 中记录旧值、Reflect.set，写入成功且值变了才通知，最后返回写入结果。

`Reflect.get(target, key, receiver)` 能保留 getter 的 receiver 语义；其内部通过 this 继续读属性时可以经过代理。本课的验收对象是普通自有数据属性，复杂 getter/setter 和原型链写入留到后续专门处理。

`Object.is` 用于判断值是否变化，包含 NaN 的情况。执行 runner 时必须重新设置 activeEffect，否则重跑时无法继续追踪读取。依赖来自实际执行中的属性读取，不是扫描函数文本得来的。

## 运行

需要可运行 ES 模块和顶层 await 的 Node.js，无需 npm install。

```bash
# 在克隆后的 mini-vue 仓库根目录执行
cd 01-reactivity
node check.mjs
```

练习中的 TODO 尚未实现时，验收失败是预期现象。完成后应有 8/8 项通过。

查看参考实现的验收结果：

```bash
node check.mjs --reference
```

观察下一课要修复的问题：

```bash
node branch-demo.mjs
```

## 自己画一次调用过程

`effect(fn)` → `runner()` → 设 activeEffect → `fn()` 读取 count → Proxy get → track 建立订阅 → fn 完成，恢复上下文。

`state.count = 2` → Proxy set → 更新原始对象 → trigger 找到 count 的订阅者 → runner 重算 → double 变为 4。

试着把函数体换成 `document.querySelector('#app').textContent = state.count`。如果页面上存在该元素，状态就可以驱动 DOM 变化。之后的组件课，会把这里的直接 DOM 操作换成 render + patch。当前课不需要浏览器。

## 源码对照

这些是阅读入口，按问题跳转，不用从每个文件第一行开始通读：

- [reactive.ts](https://github.com/vuejs/core/blob/v3.5.42/packages/reactivity/src/reactive.ts)：reactive → createReactiveObject；代理创建和缓存。
- [baseHandlers.ts](https://github.com/vuejs/core/blob/v3.5.42/packages/reactivity/src/baseHandlers.ts)：get / set 拦截及 track / trigger 调用。
- [effect.ts](https://github.com/vuejs/core/blob/v3.5.42/packages/reactivity/src/effect.ts)：ReactiveEffect.run 的执行上下文管理。
- [dep.ts](https://github.com/vuejs/core/blob/v3.5.42/packages/reactivity/src/dep.ts)：targetMap、track、trigger，以及 Dep / Link。

本课采用 WeakMap → Map → Set 的教学模型。Vue 3.5.42 的对象属性依赖是 WeakMap → Map → Dep，订阅关系通过 Link 双向链表维护，另有版本追踪与批处理；不能把本课 Set 实现当作当前正式源码的逐行复刻。

## 范围与下一课

本课仅支持普通对象第一层属性的同步读取、写入和简单 effect；未实现深层代理、代理缓存、依赖清理、stop、完整递归保护、数组和集合语义、删除/遍历追踪、异步调度或组件生命周期。正式 Vue 的 reactive 默认支持深层响应式，本课刻意分阶段加入。

```js
const state = reactive({ ok: true, text: 'hello' });
effect(() => console.log(state.ok ? state.text : '隐藏'));
state.ok = false;
state.text = 'world';
```

第一课实现会输出 `hello`、`隐藏`、`隐藏`。最后一次是多余执行：分支切换后，effect 已经不再读取 text，但旧订阅还在。下一课将让 effect 同时记住“我订阅了哪些属性”，从而能删除过期关系。

进入下一课前，请能说明：为什么要先执行一次 effect；get 如何知道谁在读取；为什么需要对象和属性两层索引；分支切换后哪条依赖关系应被移除。

## 第一课问答复盘（2026-09-14）

本次复习从照着 reference 抄写，推进到了按执行顺序解释代码。通过问答和纠正，已经理清了依赖收集的时机、订阅者的身份、原始对象与代理的关系，以及过期依赖的问题。接下来需要用脱离参考实现的手写来巩固。

以下结论针对本课的同步、浅层教学实现。每段示例独立推演；只有明确标注的实验使用改动后的 effect。这里记录的依赖清理方案是第二课的设计草案，尚未加入第一课代码。

### 最需要记牢的执行顺序

```text
首次执行：
调用 effect(fn)
  → effect 主动调用 runner()
  → runner 保存旧上下文，并设置 activeEffect = runner
  → runner 调用 fn()
  → fn 实际读取响应式属性
  → Proxy.get 调用 track，登记当前 runner
  → fn 结束，通过 finally 恢复上下文

后续更新：
通过代理给属性赋值
  → Proxy.set 读取原始对象上的旧值
  → Reflect.set 写入新值
  → 写入成功且值发生变化时，调用 trigger
  → trigger 找到该对象、该属性已经登记的 runner
  → 调用已有的 runner，再次执行 fn
```

首次执行由 effect 主动启动；这次执行中的属性读取建立依赖。后续更新调用的是已经登记的 runner，无需重新调用 effect 创建订阅者。

### 问答中重点纠正的理解

| 曾经容易混淆的地方 | 现在应当怎样解释 |
| --- | --- |
| “首次收集到依赖，所以执行 runner” | 先主动执行 runner，再在 fn 读取属性时收集依赖 |
| “const 声明的变量不收集依赖” | 关键是 effect 执行期间是否发生响应式属性读取，const/let 不是判断依据 |
| “Map 区分对象” | 最外层 WeakMap 区分原始对象，内层 Map 区分属性，Set 保存 runner |
| “同一个属性只有一份依赖，所以 Set 不增加” | 同一个属性可以有多个订阅者；Set 按 runner 的函数引用去重 |
| “直接修改 raw，不会改变 state 读到的值” | raw 与代理共享底层数据；直接修改 raw 会改变数据，但绕过代理的更新通知 |
| “没有打印，说明 count 还是旧值” | 数据可能已经变了，只是没有找到订阅者执行打印函数 |
| “统计 effect 执行次数时只看后面的赋值” | 还要计入注册 effect 时的首次主动执行 |
| “console 就是订阅的事件” | 集合中的订阅者是 runner，runner 调用 fn，console.log 是 fn 中的业务操作 |

### 场景一：提前取出的数字，不会自动保留属性订阅

```js
const state = reactive({ count: 1, name: 'Vue' });
const initialCount = state.count;

effect(() => console.log('A', initialCount));
effect(() => console.log('B', state.count));

state.count = 2;
state.name = 'Mini Vue';
// A 1
// B 1
// B 2
```

读取 `initialCount` 的初始值时，activeEffect 还是 undefined，没有建立订阅。A 执行时读取的是已经取出的数字 1，没有触发代理 get；B 执行时读取 state.count，才建立对 count 的订阅。

系统不会追溯一个普通变量的值最初来自哪个属性。如果把 `const value = state.count` 放进 effect 回调内部，仍然可以收集依赖。这里讨论的是取出的基本类型值，不要推广为“所有局部变量都不能参与响应式”。

对 name 的赋值会进入 set，但 name 没有订阅者，不会产生额外打印。这个赋值本身不需要先通过代理读取 name；setter 中的 `target[key]` 读取的是原始对象。

### 场景二：对象、属性和订阅者要分别区分

```text
targetMap：WeakMap
  原始对象 A → Map
                count → Set(runnerA)
  原始对象 B → Map
                count → Set(runnerB)
```

如果只按属性名 count 保存订阅，修改 A.count 就可能让读取 B.count 的 runnerB 也多执行一次。因此 trigger 必须同时拿到 target 和 key。这里作为键的 target 是原始对象。

同一个 effect 重复读取 count，会多次调用 track，但加入的是同一个 runner，Set 中仍只有一个元素。更新时调用已有 runner，重新收集也不会凭空创建新的 runner。

```js
const state = reactive({ count: 1 });
function fn() {
  console.log(state.count);
}

const runner1 = effect(fn);
const runner2 = effect(fn);
// runner1 !== runner2
// count 的订阅 Set 中有两个元素
```

每次调用 effect 都会创建新的 runner。即使传入的是同一个 fn，也会产生两个不同的订阅者。要区分“重新调用已有 runner”和“重新调用 effect 创建 runner”。

### 场景三：数据改变与通知订阅者是两件事

```js
const raw = { count: 1 };
const state = reactive(raw);
let double;

effect(() => {
  double = state.count * 2;
});

raw.count = 3;
console.log(state.count, double); // 3, 2

state.count = 4;
console.log(raw.count, double);   // 4, 8
```

Proxy 没有复制原始对象，raw 和 state 访问的是同一份底层数据。

- raw.count = 3：原始数据变成 3，但没有经过代理 set，未调用 trigger，double 保留上次计算的 2。
- 随后读取 state.count：get 从原始对象读取当前值，所以得到 3；这次读取不会自行重算 double。
- state.count = 4：通过代理更新原始对象，并通知已登记的 runner，double 重算为 8。

本次复习曾把第一处结果判断为 1、2。需要记住：绕过代理修改时，数据依然会改变；缺少的是这次响应式通知。

### 场景四：进入 set，不等于一定执行 trigger

```js
const state = reactive({ count: 1 });
let runs = 0;

effect(() => {
  runs++;
  console.log(state.count);
});

state.count = 1;
state.count = 2;
state.count = 2;
console.log('执行次数', runs);
// 1
// 2
// 执行次数 2
```

| 操作 | 是否执行 effect 回调 | runs |
| --- | --- | --- |
| 注册 effect | 立即执行一次 | 1 |
| count = 1 | 值相同，不重跑 | 1 |
| count = 2 | 值变化，重跑 | 2 |
| 再次 count = 2 | 值相同，不重跑 | 2 |

三次赋值都会进入 set，只有中间一次满足 `success && !Object.is(oldValue, value)`。旧值是在写入前读取的；触发通知时，新值已经写入，所以回调重新读取的是新值。

计算次数时要从 effect 注册开始，不能只数之后发生了多少次属性变化。

### 场景五：删掉首次 runner() 的实验，需要与正常实现区分

本场景假设仅删掉 effect 函数末尾的首次 `runner();`，保留 runner 内部设置、恢复 activeEffect 的逻辑以及 `return runner;`。第一课原版仍然保留首次调用，下面的无输出行为不适用于原版。

```js
runner();      // 调用函数，现在执行
return runner; // 返回函数本身，这句话不会调用函数
```

在这个实验版本中：

```js
const state = reactive({ count: 1 });
const runner = effect(() => console.log(state.count));
// 此时仅创建并返回函数：未读取 count，未收集依赖，也未打印

state.count = 2;
// 数据已经是 2，但没有订阅者，不打印

runner();
// 首次执行 fn，读取并订阅 count，打印当前值 2

state.count = 3;
// 现在有订阅者，打印 3
```

没有订阅时，trigger 查不到 dep，就直接返回。它只通知已经登记的 runner，不会自动运行所有定义过的函数来寻找订阅关系。

这次问答最终理清的关键点是：count 的当前值和打印函数是否被执行，需要分别判断。没有打印不能证明数据没变。

### 场景六：activeEffect 是临时上下文，依赖表保存长期关系

activeEffect 表示此刻正在执行的订阅者。targetMap 中的关系在函数执行结束后仍然存在，恢复 activeEffect 不会删除已经放进 Set 的 runner。

使用 try/finally，是为了让 fn 抛错时也恢复之前的上下文。如果只把恢复语句放在 fn() 后面，异常可能让它无法执行，activeEffect 就错误地停留在失败的 runner。之后的响应式属性读取可能被错误地登记到这个 runner 名下。

finally 负责执行恢复动作，不会吞掉原来的异常。恢复上下文也不等于清理旧订阅；第一课仍未实现依赖清理。

嵌套 effect 时，恢复值不能统一写成 undefined：

```js
const state = reactive({ a: 1, b: 2, c: 3 });
effect(() => {
  console.log(state.a);
  effect(() => console.log(state.b));
  console.log(state.c);
});
```

| 执行位置 | activeEffect 应当是谁 |
| --- | --- |
| 外层读取 a | 外层 runner |
| 内层读取 b | 内层 runner |
| 内层结束，外层读取 c | 恢复为外层 runner |
| 外层结束 | 恢复为外层开始前的上下文，此例为 undefined |

如果内层结束时直接设成 undefined，c 会漏掉依赖收集。previous 保存的是进入当前 runner 之前的上下文，它可能是另一个尚未执行完的 runner。

此例只用于观察首次执行的上下文恢复。第一课尚未管理嵌套 effect 的生命周期；外层重跑会再次创建内层 effect，不能把这个例子当作完整的嵌套副作用管理方案。

### 场景七：跳过当前 runner，避免直接递归触发自身

```js
const state = reactive({ count: 0 });
effect(() => {
  state.count++;
});
// 首次执行结束后，count 为 1
```

count++ 先读取，再写入。读取时登记当前 runner；写入时 trigger 又能找到这个 runner。因此本课判断 `runner !== activeEffect`，跳过本轮正在执行的订阅者。

跳过通知不会撤销已经完成的写入，所以 count 仍变成了 1。若移除判断，会反复同步递归执行 runner，最终通常导致调用栈溢出。这个判断只处理当前 runner 直接触发自身的情况，不是完整的循环依赖保护。

### 场景八：Set 去重无法清除过期依赖

```js
const state = reactive({ ok: true, text: 'hello' });
effect(() => console.log(state.ok ? state.text : '隐藏'));
state.ok = false;
state.text = 'world';
// 第一课实现：hello、隐藏、隐藏
```

首次执行订阅 ok 和 text。切换到 false 后，回调只读取 ok，但原来的 text → runner 关系仍然存在，所以修改 text 依然会触发多余执行。

- Set 去重：防止同一个 runner 被重复登记。
- 依赖清理：移除 runner 最近一次执行已经不再使用的订阅。

本次问答中已经能解释这一区别：目前 track 只增加关系，不会删除过期关系。这是教学实现的缺口，不代表正式 Vue 也保留这个多余订阅。

### 我提出的第二课设计：记录 target 和 key

让每个 runner 保存它使用过的多组 `{ target, key }`，就能在重跑前找到旧订阅。target 应当是原始对象，不能只记录属性名。

实现时需要先为 runner 初始化空的 deps 数组，再由 track 在建立订阅时记录对应的 target 和 key，并避免同一条关系被重复记录。假设原始对象名为 raw，首次读取 ok 和 text 后，可以得到这样的记录：

```js
runner.deps = [
  { target: raw, key: 'ok' },
  { target: raw, key: 'text' },
];
```

清理逻辑可以写成下面的设计草案：

```js
function cleanup(runner) {
  for (const { target, key } of runner.deps) {
    const dep = targetMap.get(target)?.get(key);
    dep?.delete(runner);
  }
  runner.deps = [];
}
```

只删除当前 runner，保留同一属性上的其他订阅者。清理后重新执行 fn，并重新收集本次实际读取的属性，条件分支变化后的关系就能更新。

这个设计补上了两个方向：属性知道“谁使用了我”，runner 知道“我使用了哪些属性”。第二课再把这些记录接进 effect、track 和 cleanup，并检查清理与重新收集时的遍历行为。

### 进入第二课前的自查

第一课的核心流程已完成梳理；后续需要巩固的重点是独立推演和独立手写。复习时优先检查下面几件事：

- 能区分创建函数、调用函数、返回函数，解释 effect 为什么先执行一次。
- 能按时间顺序判断 get 发生时 activeEffect 是谁，画出实际建立的依赖关系。
- 能分开判断数据是否变化、是否进入代理 set、是否通知订阅者、回调是否执行。
- 能解释 runner 引用去重、异常与嵌套上下文恢复，以及直接自触发保护。
- 能指出条件分支中的过期关系，并说明如何用多组 target/key 找到并清理它们。

WeakMap 的回收细节、Reflect 的 receiver 语义、Object.is 的特殊值行为，以及完整的集合、嵌套生命周期和递归处理，本次问答尚未逐项展开，后续再结合相应场景学习。
