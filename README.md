# Mini Vue：结合源码，逐步手写 Vue 核心

这是一个 Vue 3 源码学习项目：用 JavaScript 实现可运行的简化版本，再对照 Vue 的 TypeScript 源码理解设计。仓库保留手写练习、参考实现、行为验收，以及通过问答逐步纠正理解的学习笔记。

目前完成第一课：**响应式系统的最小流程**，以及第二课：**依赖清理与 stop**。第二课手写实现已通过两组共 11 项验收；后续逐步加入 ref、computed、调度、组件、渲染器和模板编译。

## 快速开始

使用 Node.js 22 或更高版本。当前没有第三方运行依赖，无需执行 npm install。

```bash
git clone https://github.com/hanyueshijiu/mini-vue.git
cd mini-vue
npm test
```

`npm test` 依次检验第一课的练习实现和参考实现，各有 8 项行为验收。也可以分别运行：

```bash
npm run test:practice
npm run test:reference
npm run demo:branch
```

直接使用 Node.js 运行第一课：

```bash
node 01-reactivity/check.mjs
node 01-reactivity/check.mjs --reference
node 01-reactivity/branch-demo.mjs
```

第一课的分支示例会执行 3 次，而清理过期依赖后应只执行 2 次。第二课围绕这个问题展开，使用独立命令：

```bash
npm run test:02
npm run test:02:reference
npm run test:02:stop
npm run test:02:stop:reference
```

第二课的依赖清理有 5 项验收，stop 有 6 项验收，手写实现与参考实现均已通过。详见 [第二课：依赖清理与 stop](./02-effect-cleanup/README.md)。

## 第一课实现了什么

```js
import { reactive, effect } from './01-reactivity/reference.mjs';

const state = reactive({ count: 1 });
let double;

effect(() => {
  double = state.count * 2;
});

console.log(double); // 2
state.count = 2;
console.log(double); // 4
```

核心流程是：

```text
effect 主动执行 runner
  → 用户函数读取响应式属性
  → get / track 建立依赖

通过代理修改属性
  → set 判断值发生变化
  → trigger 找到订阅者
  → 再次执行已有 runner
```

重点理解：

- 依赖在函数实际读取属性时建立，首次执行由 effect 主动启动。
- WeakMap 区分原始对象，Map 区分属性，Set 按 runner 引用去重。
- 原始对象与代理共享数据；数据改变、触发通知和执行回调需要分别判断。
- 保存与恢复 activeEffect，让异常和嵌套执行时的依赖收集上下文保持正确。
- 值没变化时跳过通知，并避免当前 runner 直接递归触发自身。
- Set 去重与清理过期依赖解决的是不同问题。

详细的执行过程、源码入口、8 个复习场景和第二课设计见 [第一课学习笔记](./01-reactivity/README.md)。

## 文件说明

```text
mini-vue/
├── README.md                 # 项目介绍和学习路线
├── package.json              # 零依赖的运行、验收命令
├── .gitignore                # 忽略系统文件、本地配置和临时产物
├── 01-reactivity/
│   ├── README.md             # 第一课说明、源码对照和问答复盘
│   ├── practice.mjs          # 已完成的手写练习，保留学习注释
│   ├── reference.mjs         # 第一课参考实现
│   ├── check.mjs             # 8 项行为验收，可选择练习或参考实现
│   └── branch-demo.mjs       # 条件分支切换后的过期依赖示例
└── 02-effect-cleanup/
    ├── README.md             # 第二课：依赖清理与 stop
    ├── practice.mjs          # 已完成的依赖清理与 stop 手写实现
    ├── reference.mjs         # 依赖清理与 stop 的参考实现
    ├── check.mjs             # 5 项依赖清理行为验收
    └── check-stop.mjs        # 6 项 stop 行为验收
```

第一、二课的 `practice.mjs` 均已填写完成。自行复习时，可以在本地副本中重新实现，再通过对应的验收脚本检验。

## 学习路线

| 阶段 | 内容 | 状态 |
| --- | --- | --- |
| 1 | reactive / effect / track / trigger，依赖关系与执行时机 | 已实现，已完成问答复盘 |
| 2 | 依赖清理、stop、嵌套执行边界 | 依赖清理与 stop 已实现，11 项验收通过；完整嵌套生命周期后续展开 |
| 3 | 深层代理、缓存、readonly、ref | 计划中 |
| 4 | computed、调度队列、nextTick、watch | 计划中 |
| 5 | VNode、h、createRenderer 和 DOM 操作 | 计划中 |
| 6 | 组件、setup、props、事件、插槽与生命周期 | 计划中 |
| 7 | patch、keyed diff、节点复用与移动 | 计划中 |
| 8 | 模板解析、AST 转换和代码生成 | 计划中 |
| 9 | 串联 Mini Vue，并对照官方实现分析优化 | 计划中 |

每一课按照“提出问题 → 设计数据结构 → 手写实现 → 验证行为 → 对照源码”的顺序推进。复习采用一问一答，先预测输出，再解释执行顺序，最后记录容易混淆的场景。

## 与 Vue 正式实现的关系

源码阅读固定在 [Vue v3.5.42](https://github.com/vuejs/core/tree/v3.5.42)。本仓库代码是分阶段的教学实现，暂只覆盖普通对象第一层属性的同步响应式；第二课参考实现增加了依赖清理和 stop。深层代理、代理缓存、完整的递归保护、数组与集合语义，以及组件调度等能力尚未实现。

第一课使用 WeakMap → Map → Set 帮助观察依赖关系。正式源码使用 Dep、Link 等结构管理订阅，阅读时应对照设计目的和实际调用关系。

- [reactive.ts：代理创建](https://github.com/vuejs/core/blob/v3.5.42/packages/reactivity/src/reactive.ts)
- [baseHandlers.ts：属性读写拦截](https://github.com/vuejs/core/blob/v3.5.42/packages/reactivity/src/baseHandlers.ts)
- [effect.ts：执行与上下文管理](https://github.com/vuejs/core/blob/v3.5.42/packages/reactivity/src/effect.ts)
- [dep.ts：依赖收集与触发](https://github.com/vuejs/core/blob/v3.5.42/packages/reactivity/src/dep.ts)

该项目用于学习和理解核心机制，尚不具备完整框架的行为与边界处理能力。
