import * as previous from '../02-effect-cleanup/practice.mjs';

const useReference = process.argv.includes('--reference');
const current = await import(useReference ? './reference.mjs' : './practice.mjs');

function demonstrate(label, { reactive, effect, stop }) {
  console.log(`\n${label}`);
  const state = reactive({ user: { age: 18 } });
  const runner = effect(() => console.log('effect 读取 age：', state.user.age));
  console.log('执行 state.user.age = 19');
  state.user.age = 19;
  console.log('当前数据中的 age：', state.user.age);
  console.log('执行 state.user = { age: 20 }');
  state.user = { age: 20 };
  stop(runner);
}

demonstrate('第二课：只代理第一层', previous);
demonstrate(`第三课：${useReference ? '参考实现' : '你的练习实现'}`, current);
