/**
 * 巡检任务中心自检脚本（最小测试）
 * 验证四条路径：normalize、同步补缺不覆盖、删除角色后任务阻塞、备份恢复一致性校验。
 * 运行：npm run selfcheck
 */
import { execFileSync } from 'node:child_process';
import { writeFileSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

// localStorage  shim（必须在导入被测模块前完成）
const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => void store.set(k, String(v)),
  removeItem: (k) => void store.delete(k),
  clear: () => store.clear(),
};

// 用项目自带 esbuild 把 TS composables 打成 node 可跑的 bundle
const entry = path.join(__dirname, '.selfcheck-entry.mjs');
const bundle = path.join(__dirname, '.selfcheck-bundle.mjs');
writeFileSync(
  entry,
  [
    `export * as charMod from '../src/composables/useCharacters.ts';`,
    `export * as taskMod from '../src/composables/useInspectionTasks.ts';`,
    `export * as planMod from '../src/composables/useRehearsalPlans.ts';`,
    `export * as types from '../src/types/index.ts';`,
    '',
  ].join('\n')
);
execFileSync(
  path.join(root, 'node_modules/.bin/esbuild'),
  [entry, '--bundle', '--format=esm', '--platform=node', `--outfile=${bundle}`, '--log-level=warning'],
  { stdio: 'inherit' }
);

const { charMod, taskMod, planMod, types } = await import(bundle);

let passed = 0;
let failed = 0;
function check(name, cond) {
  if (cond) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    console.error(`  ✗ ${name}`);
  }
}

try {
  // ---------- 路径 1：normalize ----------
  console.log('\n[1] normalize 规范化');
  const t = types.normalizeInspectionTask({
    sourceType: 'legacy_type',
    severity: 'urgent',
    status: 'done',
    title: 123,
    story: undefined,
    extraJunk: 'x',
    checkResults: [{ a: 1 }],
  });
  check('非法 sourceType 回退 manual', t.sourceType === 'manual');
  check('非法 severity 回退 medium', t.severity === 'medium');
  check('非法 status 回退 open', t.status === 'open');
  check('title 强制转字符串', t.title === '123');
  check('story 缺省为未分类', t.story === '未分类');
  check('旧字段/多余字段被丢弃（不塞进任务）', !('extraJunk' in t) && !('checkResults' in t));
  const r = types.normalizeInspectionTask({ status: 'resolved' });
  check('resolved 状态自动补 resolvedAt', !!r.resolvedAt);
  const c = types.normalizeCharacter({ id: 'c1', riskLevel: 'extreme', status: 'weird', missingAccessories: 'bad' });
  check('角色非法 riskLevel 回退 low', c.riskLevel === 'low');
  check('角色配件字段数组兜底', Array.isArray(c.missingAccessories));
  const p = types.normalizeRehearsalPlan({ status: 'unknown', characters: [{ characterId: '', rehearsalResult: 'bad' }] });
  check('计划非法 status 回退 draft', p.status === 'draft');
  check('计划过滤无效角色条目', p.characters.length === 0);

  // ---------- 路径 2：同步只补缺，不覆盖用户编辑 ----------
  console.log('\n[2] 同步补缺');
  const tasksApi = taskMod.useInspectionTasks(); // 初始化时已执行一次同步
  const charsApi = charMod.useCharacters();

  const auto = tasksApi.tasks.value.find((t) => t.title === '补齐猪八戒的九齿钉耙');
  check('缺件任务标题格式「补齐{角色名}的{配件名}」', !!auto);
  check('自动任务 sourceType=character / sourceId=角色id', !!auto && auto.sourceType === 'character' && auto.sourceId === 'char_demo_003');
  check('高风险任务标题格式「复核{角色名}风险说明」', tasksApi.tasks.value.some((t) => t.title === '复核白骨精风险说明'));
  check('未分配责任人标题格式「分配{角色名}责任人」', tasksApi.tasks.value.some((t) => t.title === '分配老汉责任人'));

  const r2 = tasksApi.syncTasksFromCharacters();
  check('重复同步不重复创建（created=0）', r2.created === 0);

  tasksApi.updateTask(auto.id, {
    status: 'in_progress',
    assignee: '测试负责人',
    dueAt: '2030-01-01T00:00',
    description: '用户手写描述',
  });
  const r3 = tasksApi.syncTasksFromCharacters();
  const after = tasksApi.tasks.value.find((t) => t.id === auto.id);
  check('用户编辑后再同步仍不新建', r3.created === 0);
  check('用户编辑的 status 未被覆盖', after.status === 'in_progress');
  check('用户编辑的 assignee 未被覆盖', after.assignee === '测试负责人');
  check('用户编辑的 dueAt 未被覆盖', after.dueAt === '2030-01-01T00:00');
  check('用户编辑的 description 未被覆盖', after.description === '用户手写描述');

  // ---------- 路径 3：删除角色后任务阻塞并保留来源 ----------
  console.log('\n[3] 删除角色阻塞');
  const target = 'char_demo_006'; // 老汉：未分配责任人，存在自动任务
  const before = tasksApi
    .getTasksByCharacterId(target)
    .filter((t) => !['blocked', 'resolved', 'dismissed'].includes(t.status));
  check('删除前存在未完结关联任务', before.length > 0);
  charsApi.deleteCharacter(target);
  const afterDel = tasksApi.getTasksByCharacterId(target);
  const blockedTask = afterDel.find((t) => t.status === 'blocked');
  check('删除角色后任务不丢失', afterDel.length > 0);
  check('删除角色后未完结任务进入 blocked', !!blockedTask && afterDel.every((t) => ['blocked', 'resolved', 'dismissed'].includes(t.status)));
  check(
    'blocked 任务保留 sourceType/sourceId/story',
    !!blockedTask && blockedTask.sourceType === 'character' && blockedTask.sourceId === target && blockedTask.story === '三打白骨精'
  );

  // ---------- 路径 4：备份恢复（normalize + 重复 id 重建 + 一致性校验） ----------
  console.log('\n[4] 备份恢复');
  const plansApi = planMod.useRehearsalPlans();

  const charRes = charsApi.restoreCharacters([
    { id: 'c_a', name: '测试甲', story: '测试故事', owner: '甲' },
    { id: 'c_a', name: '测试乙', story: '测试故事' },
    { id: 'c_b', name: '测试丙', story: '测试故事' },
  ]);
  check('角色恢复数量正确', charRes.count === 3);
  check('角色重复 id 重建计数', charRes.reissuedCount === 1);
  check('恢复后角色 id 唯一', new Set(charsApi.characters.value.map((c) => c.id)).size === 3);

  const planRes = plansApi.restorePlans([
    { id: 'p_a', name: '测试场次', story: '测试故事', characters: [{ characterId: 'c_b', order: 1 }] },
    { id: 'p_a', name: '重复场次', story: '测试故事' },
  ]);
  check('计划恢复数量与重复 id 重建计数', planRes.count === 2 && planRes.reissuedCount === 1);

  const validPlanId = plansApi.rehearsalPlans.value[0].id;
  const taskRes = tasksApi.restoreTasks([
    { id: 't_a', sourceType: 'character', sourceId: 'c_b', story: '测试故事', characterId: 'c_b', title: '任务1', severity: 'high', status: 'open' },
    { id: 't_a', sourceType: 'manual', sourceId: '', story: '测试故事', title: '任务2-重复id', junkField: 'should-be-dropped' },
    { id: 't_b', sourceType: 'character', sourceId: 'ghost', story: '测试故事', characterId: 'ghost_char', title: '孤儿角色任务', status: 'open' },
    { id: 't_c', sourceType: 'rehearsal', sourceId: 'ghost', story: '测试故事', planId: 'ghost_plan', title: '孤儿计划任务', status: 'open' },
    { id: 't_d', sourceType: 'rehearsal', sourceId: validPlanId, story: '测试故事', planId: validPlanId, title: '有效计划任务', status: 'open' },
  ]);
  check('任务恢复数量正确', taskRes.count === 5);
  check('任务重复 id 重建计数', taskRes.reissuedCount === 1);
  check('任务字段保持 camelCase schema 白名单', !('junkField' in tasksApi.tasks.value.find((t) => t.title === '任务2-重复id')));

  const blockedCount = tasksApi.validateTaskConsistency(
    new Set(charsApi.characters.value.map((c) => c.id)),
    new Set(plansApi.rehearsalPlans.value.map((p) => p.id))
  );
  check('一致性校验阻塞孤儿任务数量=2', blockedCount === 2);
  const orphanChar = tasksApi.tasks.value.find((t) => t.title === '孤儿角色任务');
  check(
    '孤儿角色任务 blocked 且保留来源',
    orphanChar.status === 'blocked' && orphanChar.sourceType === 'character' && orphanChar.sourceId === 'ghost' && orphanChar.story === '测试故事'
  );
  const orphanPlan = tasksApi.tasks.value.find((t) => t.title === '孤儿计划任务');
  check('孤儿计划任务 blocked 且保留 planId 来源', orphanPlan.status === 'blocked' && orphanPlan.planId === 'ghost_plan');
  check('有效关联任务保持 open', tasksApi.tasks.value.find((t) => t.title === '有效计划任务').status === 'open');
} finally {
  rmSync(entry, { force: true });
  rmSync(bundle, { force: true });
}

console.log(`\n自检完成：${passed} 通过，${failed} 失败`);
process.exit(failed > 0 ? 1 : 0);
