# 第四课：ref 与属性引用

## 学习状态

**已规划，待学习（2026-09-26）。** 本次先整理课程目标、手写顺序和源码入口。当前目录只有课程说明，练习实现、参考实现和验收脚本将在各阶段开始时补齐。

下面的 ref 等示例描述实现后的目标行为，目前还不能从仓库的第四课模块中导入这些 API。

## 本课要解决的问题

前三课已经能通过代理拦截对象属性的读写。这一课继续解决三个问题：

1. 数字、字符串等值，如何通过一个稳定的对象和属性参与依赖收集？
2. 提前取出对象属性时，怎样保留对原属性位置的读写联系？
3. 对含有 ref 的普通对象，怎样提供省略一层 .value 的访问方式？

手写目标为 ref、isRef、unref、toRef、toRefs、proxyRefs。按最初路线进入 ref 主线，readonly 与浅层模式作为后续对象响应式扩展安排。

## 分阶段学习

| 阶段 | 内容 | 完成标准 |
| --- | --- | --- |
| A | ref 的包装对象与 .value 存取器 | 基本类型变化能通知 effect，重复赋相同值不重跑 |
| B | 对象类型的 ref | 嵌套修改和整体替换都能更新，并清理旧对象依赖 |
| C | isRef、unref 与 ref 身份 | 区分普通对象和 ref；理解取值与保留引用的区别 |
| D | toRef、toRefs | 属性双向读写；解构后仍通过 ref 读取原属性 |
| E | proxyRefs | 读取解包；写普通值与写新 ref 采用不同规则 |

每次只推进一个阶段，先解释完整示例，再手写并验收。

## 阶段 A：为什么需要 .value

第三课的 reactive(1) 只会原样返回数字。普通变量重新赋值，不会进入 Proxy 的 set。ref 要提供一个可拦截的属性位置：

```js
const count = ref(1);

effect(() => {
  console.log(count.value);
});

count.value = 2;
// 目标输出：1、2
```

count 保存包装对象的引用，变化的是其 value 属性。读取 .value 会调用 getter，赋值会调用 setter；这也是拦截读写的一种方式，不要求包装对象本身一定是 Proxy。

本课先用已有 track/trigger 思路描述关系：

```text
effect 主动执行 runner
  → 用户函数读取 count.value
  → value 的 getter 记录当前订阅者

count.value = 新值
  → value 的 setter 判断值是否变化
  → 通知已有订阅者
```

教学实现可以复用“包装对象 + 'value'”这一组 target/key；正式 Vue 的 RefImpl 自己持有 Dep，读取和写入直接调用它。对照时要区分数据结构与所解决的问题。[RefImpl 源码](https://github.com/vuejs/core/blob/v3.5.42/packages/reactivity/src/ref.ts#L108)

先确认这里的“首次执行”仍由 effect 启动，ref 的创建不会自行调用用户函数。

## 阶段 B：ref 也可以保存对象

```js
const user = ref({ age: 18 });
effect(() => console.log(user.value.age));

user.value.age = 19;
user.value = { age: 20 };
// 目标输出：18、19、20
```

这一阶段沿用第三课的深层代理与原始值比较。需要分清包装对象本身、用于比较的原始值，以及读取 .value 时返回的值。

整体替换后，旧对象的属性不应继续触发这个 runner；把同一原始对象对应的代理写回 .value，也不应误报变化。包装值不等于深拷贝对象。[ref API](https://vuejs.org/api/reactivity-core.html#ref)

## 阶段 C：判断 ref 与取出值

| API | 本课目标 |
| --- | --- |
| isRef(value) | 依据本实现的 ref 标记判断身份，普通的 { value: 1 } 不自动算 ref |
| unref(value) | ref 返回 .value，普通值原样返回 |
| ref(existingRef) | 直接返回已有 ref，避免重复包装 |

两个独立的 ref(1) 应有各自的包装对象和订阅，修改一个不会改变另一个。

unref 是一次取值。若在 effect 外取得一个数字，再让 effect 只读取那个普通数字变量，不会自动保留对原 ref 的订阅。这与前面学习的“实际读取发生在什么时候”是同一个问题。[isRef / unref 文档](https://vuejs.org/api/reactivity-utilities.html#isref)

## 阶段 D：取出当前值与链接原属性

先对比下面两种行为：

```js
const state = reactive({ count: 1 });
const copy = ref(state.count);
const linked = toRef(state, 'count');

state.count = 2;
console.log(copy.value, linked.value); // 目标：1、2

linked.value = 3;
console.log(state.count);             // 目标：3
```

ref(state.count) 收到的是当时取出的值；toRef(state, 'count') 保留对象与属性位置，之后通过 .value 转发到 state.count 的读写。

再扩展为 toRefs，对普通对象现有的自有可枚举字符串属性批量创建属性引用：

```js
const state = reactive({ count: 1, title: 'Mini Vue' });
const { count, title } = toRefs(state);

effect(() => console.log(count.value, title.value));
state.count = 2;
title.value = 'Vue Learning';
```

本课只实现 toRef(object, key) 的属性链接形式。源对象使用已有 reactive 代理，依赖由转发后的属性读取收集；不为同一个属性维护两份独立状态。批量转换只覆盖转换时已有的属性，不会自动为后续新增属性生成变量。[toRef / toRefs 文档](https://vuejs.org/api/reactivity-utilities.html#toref)

## 阶段 E：proxyRefs 的浅层解包

```js
const count = ref(1);
const model = { count };
const view = proxyRefs(model);

console.log(view.count); // 目标：1
view.count = 2;
console.log(count.value); // 目标：2

view.count = ref(3);     // 目标：替换 model.count 中保存的 ref
```

读取时检查属性值是否为 ref；写入时区分“旧值是 ref、新值不是 ref”和“替换为新 ref”等情况。前一种更新旧 ref 的 .value，后一种正常替换属性。

本阶段先处理含有 ref 的普通对象的一层属性。proxyRefs 是访问适配，不会把其中所有普通属性都变成完整的 reactive；模板自动解包、reactive 中嵌套 ref 的特殊处理留到后续。[proxyRefs 及处理器源码](https://github.com/vuejs/core/blob/v3.5.42/packages/reactivity/src/ref.ts#L240)

## 计划中的行为验收

开始手写时，按阶段补齐对应检查；目前尚未新增第四课的 npm 命令。

- 基本类型的 .value 首次读取、更新与相同值赋值。
- ref 对象值的深层更新、整体替换及旧依赖清理。
- 同一原始对象与其代理的赋值比较。
- 两个独立 ref 的订阅隔离，及 ref(existingRef) 的身份保持。
- isRef 对 ref、普通对象、null 的判断；unref 对普通值的保留。
- toRef 的双向同步，及与 ref(state.key) 的区别。
- toRefs 解构后通过 .value 读取、更新源属性。
- proxyRefs 读取、写普通值和替换新 ref 的行为。
- 与已有 stop、手动 runner、分支依赖清理的配合。

实现仍在第四课目录内维护独立版本。课程资料会按进度加入 practice.mjs、reference.mjs 和验收脚本，继续保持每课成套导入的约定。

## 源码阅读顺序

固定阅读 Vue v3.5.42 的 ref.ts，先关注运行逻辑，类型重载和其他扩展按需要再读。

| 阶段 | 入口 | 阅读问题 |
| --- | --- | --- |
| A、B | [createRef / RefImpl](https://github.com/vuejs/core/blob/v3.5.42/packages/reactivity/src/ref.ts#L98) | value 的读取、比较、对象转换和通知发生在哪里？ |
| C | [isRef](https://github.com/vuejs/core/blob/v3.5.42/packages/reactivity/src/ref.ts#L46)、[unref](https://github.com/vuejs/core/blob/v3.5.42/packages/reactivity/src/ref.ts#L218) | 身份判断与一次取值有什么区别？ |
| D | [toRefs / ObjectRefImpl](https://github.com/vuejs/core/blob/v3.5.42/packages/reactivity/src/ref.ts#L342)、[toRef](https://github.com/vuejs/core/blob/v3.5.42/packages/reactivity/src/ref.ts#L476) | 属性引用如何把读写转发到源对象？ |
| E | [shallowUnwrapHandlers / proxyRefs](https://github.com/vuejs/core/blob/v3.5.42/packages/reactivity/src/ref.ts#L240) | 为什么写普通值与写新 ref 需要分别处理？ |

## 本课边界

第一轮覆盖以上基本行为，以及普通对象的属性链接。shallowRef、customRef、getter 形式的 toRef、默认值参数、数组与集合的特殊规则、模板编译和组件层自动解包不纳入本轮实现。

课程完成时，应能解释 .value 为什么可以收集依赖、ref 与 toRef 分别保存什么，以及 proxyRefs 的两种写入路径。届时再安排问答复习与独立手写。
