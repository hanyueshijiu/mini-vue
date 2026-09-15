// 第 2 课的问题：本课实现尚未清除不再使用的依赖。
// 默认演示参考实现，传 --practice 可改为你的实现。
const { reactive, effect } = await import(
  process.argv.includes('--practice') ? './practice.mjs' : './reference.mjs'
);
const state = reactive({ ok: true, text: 'hello' });
let runs = 0;

effect(() => {
  runs++;
  console.log(`第 ${runs} 次执行：`, state.ok ? state.text : '隐藏');
});

state.ok = false;
state.text = 'world';

console.log(`当前执行 ${runs} 次；清理过期依赖后应只执行 2 次。`);
console.log('请解释：第二次执行没读 text，为什么第三次仍被 text 的修改触发？');
