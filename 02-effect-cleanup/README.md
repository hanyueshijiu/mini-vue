# 第二课：让依赖关系跟随实际读取变化

本课沿用第一课的 JavaScript、WeakMap → Map → Set，以及学习中提出的 `{ target, key }` 反向记录方案。依赖清理与 stop 的手写实现均已完成，分别通过 5 项、6 项验收（2026-09-17）。

## 本课学习入口

| 内容 | 入口 |
| --- | --- |
| 手写实现 | [practice.mjs](./practice.mjs) |
| 参考实现 | [reference.mjs](./reference.mjs) |
| 依赖清理验收 | [check.mjs](./check.mjs)，5 项 |
| stop 验收 | [check-stop.mjs](./check-stop.mjs)，6 项 |
| 问答复习 | [5 道复习题与折叠答案](#复习练习) |

下面先解释实现过程，再整理复习练习。复习题使用本课已完成的实现；每题独立运行，可从 practice.mjs 导入 reactive、effect、stop。

## 从第一课的复习题开始

```js
const state = reactive({ ok: true, text: 'hello' });
effect(() => console.log(state.ok ? state.text : '隐藏'));
state.ok = false;
state.text = 'world';
```

第一课会打印 hello、隐藏、隐藏。首次执行订阅 ok 和 text；切换为 false 后，函数不再读取 text，但旧订阅仍能被 text 的修改触发。

这里需要纠正一个表述：“本次执行不再读取 text”不等于“修改 text 已经不能触发 runner”。只有删掉旧订阅，才不会触发那次多余执行。

本节目标是让这段代码只打印 hello、隐藏；重新切换为 true 时，又能读取 text 的当前值并订阅它。

## 清理放在 runner 重跑之前

响应式系统管理的是属性读取与函数执行的关系。set 不需要理解 ok、true、false 的业务含义。数字分支、不同对象的选择和手动调用 runner，也应该采用相同的依赖更新机制。

教学版选择这个顺序：

```text
属性发生变化，trigger 找到 runner
  → runner 清理自己上一次的订阅
  → 设置 activeEffect
  → 执行 fn
  → get / track 根据本次实际读取建立新订阅
  → 恢复 activeEffect
```

以 ok 从 true 变为 false 为例：

| 时刻 | ok 的订阅集合 | text 的订阅集合 |
| --- | --- | --- |
| 首次执行之后 | runner | runner |
| ok 已写入 false，runner 开始清理 | 空 | 空 |
| fn 重新读取 ok，判断走隐藏分支 | runner | 空 |
| 随后修改 text | runner | 空，不通知这个 runner |

即使 ok 仍然需要，也先移除当前 runner 对它的订阅，再在读取时重新建立。这种“先清理、再收集”的教学方案实现直接；正式 Vue 会复用仍有效的订阅关系。

## 需要补上的反向记录

原来的 targetMap 方便从属性找到订阅者：

```text
原始对象 → 属性 → Set(runnerA, runnerB)
```

现在让每个 runner 也知道自己订阅了哪些属性：

```js
// 假设 raw 是对应的原始对象；这里只示意数据结构。
runner.deps = [
  { target: raw, key: 'ok' },
  { target: raw, key: 'text' },
];
```

target 和 key 要一起记录，因为不同对象可以有同名属性。JavaScript 函数也是对象，可以把 deps 数组放在 runner 上。

这里的两个方向分别回答：

- targetMap：这个属性变化时，应该通知谁？
- runner.deps：这个 runner 重新执行前，应该从哪些集合中移除自己？

## 第一部分：已经完成的三处修改

打开 [practice.mjs](./practice.mjs)。依赖清理部分承接第一课，包含下面三处变化，可用来复习。

1. 完成 cleanup：遍历 runner.deps，按 target/key 找到 Set，只删除当前 runner；最后清空它的 deps 数组。
2. 完成 track 的反向记录：新订阅建立时，把 `{ target, key }` 放进 activeEffect.deps。只在 Set 还没有当前 runner 时记录，避免重复读取产生重复条目。
3. 接入 runner：每次执行用户函数、重新收集依赖之前，调用 cleanup(runner)。保留首次 runner()、try/finally 和 previous 恢复逻辑。

练习已经在首次 runner() 之前初始化 `runner.deps = []`，所以首次清理面对的是空数组，不妨碍首次执行与收集。

清理只修改订阅关系，不会修改 raw 中的数据，不会删除用户函数，也不会影响其他 runner 的订阅。如果 text 的集合是 Set(runnerA, runnerB)，清理 runnerA 后应该保留 runnerB。

也不能只写 `runner.deps = []`：那样只是丢掉了用于查找的记录，旧 Set 中的订阅仍然存在。需要先移除实际订阅，再清空记录。

## 为什么保留 new Set(dep)

第一课的 trigger 已经使用副本遍历。加入 cleanup 后，这一点尤其重要：执行 runner 时，会先从原 Set 删除自己，再因属性读取而重新加入原 Set。

如果直接遍历原 Set，删除后重新加入的成员可能又被遍历到，反复执行。`new Set(dep)` 固定的是本轮通知名单，让清理与重新收集发生在原集合上，避免干扰本轮遍历。

注意，这是教学版解决遍历期间成员变化的方法。原来的 `runner !== activeEffect` 判断仍然保留，它负责跳过正在执行的 runner；这两个措施解决不同的问题。

## 运行与验收

在仓库根目录运行：

```bash
npm run test:02
npm run test:02:reference
```

或进入本课目录：

```bash
cd 02-effect-cleanup
node check.mjs
node check.mjs --reference
```

依赖清理部分已经完成，应有 5/5 项通过：

- 保留首次执行、值变化更新、手动 runner 及返回值。
- 离开分支后，旧属性不再触发多余执行。
- 切回原分支可以重新订阅，多次切换仍然正确。
- 清理一个 runner 时保留其他订阅者。
- 在不同对象的同名属性之间切换时清理正确。

完成后再对照 [reference.mjs](./reference.mjs)。第一课的文件保留原有行为，便于比较；根目录的 npm test 验收已完成课程，也可以使用上面的命令单独运行本课。

## 第二部分：stop 停止自动更新

stop 的目标是移除当前 runner 的已有订阅，并让它后续被手动调用时不重新建立自己的自动订阅。数据仍可正常修改，用户函数也仍可手动执行并返回结果。

```js
const state = reactive({ count: 1 });
let runs = 0;
const runner = effect(() => {
  runs++;
  return state.count * 2;
});

stop(runner);
state.count = 2;
console.log(runner(), runs); // 4, 2
state.count = 3;
console.log(runs);           // 2
```

首次注册 effect 时已经执行一次，runs 为 1。停止后，count 改成 2 不触发自动更新。手动调用 runner 时，fn 用当前值计算 2 × 2，返回 4，并使 runs 变成 2。随后 count 改成 3，数据正常改变，fn 不再自动执行。

### 为什么只有 cleanup 不够

如果 stop 只调用 cleanup，随后手动调用 runner 时，原来的逻辑仍会设置 activeEffect = runner。fn 读取属性后，track 就会重新把它加入依赖集合。

finally 恢复 activeEffect，不会删除已经登记的关系。previous 保存的是进入当前执行之前的 activeEffect 引用；它不保存依赖表，也不是整个响应式系统的旧状态。

因此新增一个持续存在的标记：`runner.stopped`。初始化为 false，停止后设为 true。

| 信息 | 用途 |
| --- | --- |
| activeEffect | 当前属性读取应当归属于哪个正在执行的订阅者 |
| previous | 进入当前 runner 之前的执行上下文，供 finally 恢复 |
| runner.deps | 当前 runner 已经建立的订阅关系，供清理使用 |
| runner.stopped | 这个 runner 是否已经停止自动订阅 |

### stop 的两处核心修改

1. 步骤 4：在 runner 入口判断 stopped。如果已经停止，直接 `return fn()`，跳过后面的 cleanup 和执行上下文切换。正常 runner 继续沿用原来的执行流程。
2. 步骤 5：实现导出的 stop(runner)。已经停止时直接返回；否则清理它的已有订阅，并把 stopped 标记设为 true。

练习已经在首次 runner() 之前初始化 stopped = false。stop 不需要修改 activeEffect，也不应清空整个 targetMap 或改变响应式对象的值。

提前返回要写成 `return fn()`：只写 return 会丢掉手动执行能力；return fn 会返回函数本身，而不会执行用户逻辑。此处返回的是调用 fn 得到的结果。

### 验收 stop

在仓库根目录执行：

```bash
npm run test:02:stop
npm run test:02:stop:reference
```

在本课目录也可以运行 `node check-stop.mjs`，加 --reference 检验参考实现。手写实现现已完成，stop 的 6 项验收与依赖清理的 5 项验收均通过。

stop 已通过以下 6 项验收：

- 停止后不再自动更新，但数据正常变化。
- 手动调用返回最新计算结果，不重新开启自己的自动订阅。
- 其他订阅同一属性的 runner 不受影响。
- 多次调用 stop 安全，手动执行后仍保持停止状态。
- 进阶：另一个活跃 effect 调用已停止的 runner 时，读取仍可被那个外层 effect 收集。
- 进阶：通知快照中的某个 runner 在本轮中途被停止时，跳过它的自动调用。

### 两个补充边界

已停止的 runner 直接调用 fn 时，没有把自己设置为 activeEffect，也没有清空外层执行上下文。如果外面正在运行另一个 effect，fn 中的读取可以归属那个外层 effect；停止的是自己的订阅能力，不是关闭整个系统的依赖收集。

`new Set(dep)` 复制的是成员名单，里面仍是原来的 runner 函数引用。因此，本轮前一个 runner 可以把后一个 runner 停止：后者虽然仍在副本中，但它的 stopped 已经变成 true。练习在 trigger 中提供了 stopped 检查，避免把这次自动通知误当成停止后的手动调用。

track 也提供了 stopped 检查：如果函数执行到一半停止自己，后续读取不能继续为这个已停止的 runner 建立订阅。这些检查与入口处的直接 return fn() 配合，分别约束收集、自动通知和手动执行。

### 与 reactive 的连接方式

reactive 创建代理，不会主动创建或执行 effect。业务代码调用 effect(fn) 后，runner 首次调用 fn；fn 读取代理属性时进入 get，track 通过共享的 activeEffect 找到当前订阅者。

```text
业务代码调用 effect(fn)
  → runner 标记当前执行者并调用 fn
  → fn 读取 state.count
  → Proxy.get / track 保存 count → runner 的关系
  → 后续修改 state.count
  → Proxy.set / trigger 找到已有 runner 并通知
```

真实 Vue 的组件运行时会替使用者创建并首次执行渲染 effect。模板对应的渲染函数读取响应式数据时，再建立渲染所需的依赖。可以对照 [组件渲染 effect 的创建与首次执行](https://github.com/vuejs/core/blob/v3.5.42/packages/runtime-core/src/renderer.ts#L1521)。

## 对照 Vue 3.5.42

阅读 [ReactiveEffect.run](https://github.com/vuejs/core/blob/v3.5.42/packages/reactivity/src/effect.ts#L154)、[prepareDeps](https://github.com/vuejs/core/blob/v3.5.42/packages/reactivity/src/effect.ts#L296) 和 [cleanupDeps](https://github.com/vuejs/core/blob/v3.5.42/packages/reactivity/src/effect.ts#L307)。

正式实现会在执行前标记已有 Link，在读取时更新使用情况，并在执行后的 finally 中清理未被使用的关系。我们先清理、再重新收集，以便观察依赖变化；两者具体的数据结构和执行步骤不同。

阅读时还要区分 cleanupDeps 与 cleanupEffect：前者处理依赖关系；后者运行注册的清理回调。本节手写的 cleanup 对应的是依赖关系的清理问题。

stop 可以对照 [ReactiveEffect.stop](https://github.com/vuejs/core/blob/v3.5.42/packages/reactivity/src/effect.ts#L183) 和 run 中对 ACTIVE 标记的判断。我们用 stopped 布尔值表达状态；正式实现使用 EffectFlags，并管理额外的清理与生命周期信息。

## 复习练习

整理日期：2026-09-18。先独立写出输出和依赖关系，再展开答案。判断每次更新时，都要看当时的订阅集合，不能只根据表达式的当前值推测函数一定会执行。

### 练习 1：分支切换与重新订阅

```js
const state = reactive({ ok: true, text: 'hello' });

effect(() => {
  console.log(state.ok ? state.text : '隐藏');
});

state.ok = false;
state.text = 'world';
state.ok = true;
state.text = 'Vue';
```

问题：完整输出是什么？每轮执行后，runner 分别订阅哪些属性？

<details>
<summary>查看答案与推演</summary>

```text
hello
隐藏
world
Vue
```

| 操作 | 是否执行 runner | 执行后的订阅 |
| --- | --- | --- |
| 注册 effect | 首次执行，打印 hello | ok、text |
| ok = false | 执行，打印隐藏 | 只有 ok |
| text = 'world' | 不执行 | 只有 ok |
| ok = true | 执行，打印 world | ok、text |
| text = 'Vue' | 执行，打印 Vue | ok、text |

复习时曾多写一次“隐藏”。需要把“只订阅 ok”的判断落实到后续通知：text 的集合里已没有这个 runner，修改 text 就不会让它重跑。

text 的值仍然会变成 world，set 也仍然会调用 trigger；只是本次没有这个订阅者需要通知。切换回 true 时，fn 再次读取 text，才重新登记关系并打印它的当前值。

</details>

### 练习 2：集合副本与成员引用

```js
function runnerA() {}
runnerA.stopped = false;

const dep = new Set([runnerA]);
const effectsToRun = new Set(dep);

dep.delete(runnerA);
runnerA.stopped = true;

console.log(effectsToRun.has(runnerA));
console.log([...effectsToRun][0].stopped);
```

问题：两次输出是什么？哪些对象是独立的，哪些引用是共享的？

<details>
<summary>查看答案与推演</summary>

```text
true
true
```

new Set(dep) 创建新的集合，并迭代原集合的成员，把同一个函数引用加入新集合。它没有进行序列化，也没有深拷贝函数。

```text
dep          → 集合 A ──┐
                        ├──→ 同一个 runnerA 函数对象
effectsToRun → 集合 B ──┘
```

从集合 A 删除成员不会删除集合 B 的记录；但修改 runnerA.stopped，两个集合中的引用都能观察到该函数对象的新状态。

Set 没有数字下标。题目先通过展开语法转成数组，再用 [0] 取得成员。直接写 effectsToRun[0] 无法取得集合的首个成员。

这对应 trigger 的两个不同要求：复制集合固定本轮通知名单；执行前检查 stopped，读取的是函数对象当下的状态。

</details>

### 练习 3：停止后的手动执行

```js
const state = reactive({ count: 2 });
let runs = 0;

const runner = effect(() => {
  runs++;
  return state.count * 2;
});

stop(runner);
state.count = 3;
console.log(runner(), runs);

state.count = 4;
console.log(state.count, runs);
```

问题：两处输出是什么？停止后的手动执行为什么不会重新开启自己的订阅？

<details>
<summary>查看答案与推演</summary>

```text
6 2
4 2
```

注册 effect 时先执行一次，runs 为 1。stop 移除已有订阅并设置停止标记；count 改为 3 不触发回调。手动调用 runner 时直接 return fn()，计算 3 × 2，runs 增加到 2。随后 count 改成 4，数据更新，回调不自动执行。

本例中的手动调用发生在 effect 外部。提前返回没有把当前 runner 设置为 activeEffect，fn 读取属性时不会为这个 runner 重新建立订阅。

stopped 保存 runner 的停止状态；activeEffect 表示当前的收集上下文；previous 只备份进入本次执行之前的 activeEffect。previous 不保存依赖表，finally 恢复上下文也不会删除已登记的依赖。

</details>

### 练习 4：外层 effect 调用已停止的 runner

```js
const state = reactive({ count: 1 });

const inner = effect(() => state.count * 2);
stop(inner);

const outer = effect(() => {
  console.log(inner());
});

state.count = 2;
```

问题：完整输出是什么？inner 内部读取 count 时，activeEffect 指向谁？

<details>
<summary>查看答案与推演</summary>

```text
2
4
```

最初注册 inner 只返回计算值，没有 console.log。注册 outer 时，activeEffect 已经是 outer 对应的 runner。inner 已停止，因此直接执行 fn，没有切换 activeEffect；fn 的属性读取由外层 runner 收集。

count 的订阅集合中保存的是 outer。count 变成 2 后，自动重跑的是 outer，它再次手动调用 inner，计算并打印 4。inner 自己的自动订阅没有恢复。

因此，停止一个 runner 不能理解成全局关闭依赖收集，也不能在停止后的手动调用中强行把 activeEffect 设为 undefined，否则会破坏外层的收集上下文。

</details>

### 练习 5：本轮通知过程中停止另一个 runner

```js
const state = reactive({ count: 0 });
let runnerB;

const runnerA = effect(() => {
  if (state.count === 1) stop(runnerB);
});

runnerB = effect(() => {
  console.log('B', state.count);
});

state.count = 1;
state.count = 2;
```

问题：完整输出是什么？B 已经进入本轮通知副本，为什么还能被跳过？

<details>
<summary>查看答案与推演</summary>

```text
B 0
```

首次注册 A 时 count 是 0，不会调用 stop；随后注册 B，立即打印 B 0。两个 runner 都订阅 count，A 先登记。

count = 1 时，通知副本包含 A、B。A 先执行，调用 stop(B)，从原集合移除 B 并设置 B.stopped = true。副本仍保存 B 的函数引用，但 trigger 在执行前检查停止状态，因此跳过它。

count = 2 时，情况不同：原集合中已经没有 B，新生成的通知副本也不包含 B。两次都不打印，但应区分“仍在副本中、因状态被跳过”和“已经不在新的通知名单中”。

</details>

## 复习后的自查

- 能根据最近一次实际读取，判断哪些属性仍然订阅着当前 runner。
- 能区分 Set 容器与成员引用，解释浅拷贝、删除成员和修改成员状态的不同结果。
- 能区分数据赋值、通知订阅者、手动调用用户函数这三件事。
- 能区分 activeEffect、previous、runner.deps 和 runner.stopped 的职责。
- 能解释外层收集与停止后的手动执行，以及通知副本中的停止状态检查。

## 本节范围与下一步

本课手写实现和参考实现均包含同步、浅层响应式中的依赖清理和 stop。尚未加入深层代理、完整的递归保护、异常时的完整订阅回收，以及嵌套 effect 的生命周期管理。空的属性 Set 暂时保留，容器回收也留到后续讨论。

通过两部分验收后，需要能说明清理发生的时机、target/key 反向记录、快照遍历，以及停止后的手动执行与自动订阅有什么区别。
