// 巡检任务中心自检脚本（无第三方测试框架，纯 Node 断言）
// 覆盖四条路径：
//   1) normalize —— InspectionTask camelCase schema、枚举兜底、丢弃多余字段
//   2) 同步补缺 —— syncTasksFromCharacters 只补缺不覆盖用户已编辑字段
//   3) 删除角色后任务阻塞 —— blockTasksByCharacterDeletion 保留来源、置 blocked
//   4) 备份恢复 —— restore* + reissueDuplicateIds + validateTaskConsistency
//
// 运行：npm run selfcheck
//
// 注意：composables 为模块级单例，脚本按顺序复用同一状态并显式重置 tasks.value。

// ---- 环境桩：localStorage（jsdom 无关，仅内存实现）----
const store = {};
globalThis.localStorage = {
  getItem: (k) => (k in store ? store[k] : null),
  setItem: (k, v) => { store[k] = String(v); },
  removeItem: (k) => { delete store[k]; },
  clear: () => { for (const k of Object.keys(store)) delete store[k]; },
};

// ---- 极简断言 ----
let passed = 0;
let failed = 0;
const failures = [];
function assert(cond, msg) {
  if (cond) { passed++; }
  else { failed++; failures.push(msg); console.error('  ✗ ' + msg); }
}
function section(name) { console.log('\n▶ ' + name); }
function ok(msg) { console.log('  ✓ ' + msg); }

const TYPES = '../src/types/index.ts';

async function main() {
  const types = await import(new URL(TYPES, import.meta.url).href);
  const {
    normalizeInspectionTask,
    reissueDuplicateIds,
    normalizeCharacter,
    normalizeRehearsalPlan,
    isBackupBundle,
    BACKUP_BUNDLE_VERSION,
  } = types;

  const { useInspectionTasks } = await import(new URL('../src/composables/useInspectionTasks.ts', import.meta.url).href);
  const { useCharacters } = await import(new URL('../src/composables/useCharacters.ts', import.meta.url).href);
  const { useRehearsalPlans } = await import(new URL('../src/composables/useRehearsalPlans.ts', import.meta.url).href);

  const tasksApi = useInspectionTasks();
  const charsApi = useCharacters();
  const plansApi = useRehearsalPlans();

  // ============ 路径 1：normalize ============
  section('路径1 · normalizeInspectionTask（camelCase schema / 枚举兜底 / 丢弃多余字段）');
  {
    const raw = {
      id: 't_norm_1',
      sourceType: 'character',
      sourceId: 'char_x',
      story: '三打白骨精',
      characterId: 'char_x',
      planId: '',
      title: '补齐孙悟空的金箍棒',
      description: '缺件说明',
      severity: 'nonsense',          // 非法枚举 → 兜底 medium
      status: 'weird',               // 非法枚举 → 兜底 open
      assignee: '张师傅',
      dueAt: '',
      resolvedAt: '',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      // 多余的旧角色检查字段，必须被丢弃，不得进入任务
      accessoryStatus: '不该出现',
      handoverNote: '不该塞进任务',
      missingAccessories: [{ name: 'x', required: 1, available: 0 }],
    };
    const t = normalizeInspectionTask(raw);
    const keys = Object.keys(t).sort().join(',');
    const expectedKeys = [
      'assignee','characterId','createdAt','description','dueAt','id','planId',
      'resolvedAt','severity','sourceId','sourceType','status','story','title','updatedAt',
    ].sort().join(',');
    assert(keys === expectedKeys, `字段集合应恰为 InspectionTask 15 字段，实际: ${keys}`);
    assert(!('accessoryStatus' in t), '多余字段 accessoryStatus 应被丢弃');
    assert(!('handoverNote' in t), '多余字段 handoverNote 应被丢弃');
    assert(!('missingAccessories' in t), '多余字段 missingAccessories 应被丢弃');
    assert(t.severity === 'medium', `非法 severity 应兜底为 medium，实际 ${t.severity}`);
    assert(t.status === 'open', `非法 status 应兜底为 open，实际 ${t.status}`);
    assert(t.title === '补齐孙悟空的金箍棒', 'PRD 缺件标题格式应保留');

    // 缺 id 时应生成 id；sourceType 非法应兜底 manual
    const t2 = normalizeInspectionTask({ sourceType: 'ufo' });
    assert(typeof t2.id === 'string' && t2.id.length > 0, '缺 id 应自动生成');
    assert(t2.sourceType === 'manual', `非法 sourceType 应兜底 manual，实际 ${t2.sourceType}`);
    ok('normalize 通过');
  }

  // ============ 路径 2：同步补缺（不覆盖用户编辑） ============
  section('路径2 · syncTasksFromCharacters 只补缺、不覆盖用户已编辑字段');
  {
    tasksApi.tasks.value = []; // 清空任务，隔离本段

    const char = normalizeCharacter({
      id: 'c_sync_1',
      name: '测试角色',
      story: '测试故事',
      owner: '',                                  // 无责任人 → 生成分配任务
      riskLevel: 'critical',                      // 高风险 → 生成复核任务
      missingAccessories: [{ name: '道具A', required: 2, available: 0 }], // 缺件 → 生成补齐任务
    });

    const created1 = tasksApi.syncTasksFromCharacters([char]);
    assert(created1 === 3, `首次应创建 3 个任务（缺件/高风险/缺责任人），实际 ${created1}`);

    const missTitle = types.normalizeInspectionTask ? '补齐测试角色的道具A' : '';
    const missTask = tasksApi.tasks.value.find(t => t.title === '补齐测试角色的道具A');
    const riskTask = tasksApi.tasks.value.find(t => t.title === '复核测试角色风险说明');
    const ownerTask = tasksApi.tasks.value.find(t => t.title === '分配测试角色责任人');
    assert(!!missTask, 'PRD 缺件标题「补齐{角色名}的{配件名}」应存在: ' + missTitle);
    assert(!!riskTask, 'PRD 高风险标题「复核{角色名}风险说明」应存在');
    assert(!!ownerTask, 'PRD 未分配标题「分配{角色名}责任人」应存在');
    assert(riskTask.severity === 'critical', 'critical 角色的复核任务严重度应为 critical');

    // 用户编辑其中一个任务
    tasksApi.updateTask(missTask.id, {
      status: 'in_progress',
      assignee: '用户甲',
      dueAt: '2026-02-02T00:00:00.000Z',
      description: '用户手写描述',
    });

    // 再次同步：不得新增、不得覆盖用户编辑
    const created2 = tasksApi.syncTasksFromCharacters([char]);
    assert(created2 === 0, `重复同步不应新增任务，实际新增 ${created2}`);
    const after = tasksApi.tasks.value.find(t => t.id === missTask.id);
    assert(after.status === 'in_progress', 'status 不应被覆盖');
    assert(after.assignee === '用户甲', 'assignee 不应被覆盖');
    assert(after.dueAt === '2026-02-02T00:00:00.000Z', 'dueAt 不应被覆盖');
    assert(after.description === '用户手写描述', 'description 不应被覆盖');
    ok('同步补缺 + 不覆盖用户编辑 通过');
  }

  // ============ 路径 3：删除角色后任务阻塞 ============
  section('路径3 · 删除角色 → 关联任务进入 blocked 且保留来源');
  {
    tasksApi.tasks.value = [];
    const t = tasksApi.addTask({
      sourceType: 'character',
      sourceId: 'c_del_1',
      story: '测试故事',
      characterId: 'c_del_1',
      planId: '',
      title: '复核将被删除角色风险说明',
      description: '原描述',
      severity: 'high',
      status: 'open',
    });
    const n = tasksApi.blockTasksByCharacterDeletion('c_del_1', '将被删除角色');
    assert(n === 1, `应阻塞 1 个任务，实际 ${n}`);
    const after = tasksApi.tasks.value.find(x => x.id === t.id);
    assert(after.status === 'blocked', '任务应变为 blocked');
    assert(after.sourceType === 'character' && after.sourceId === 'c_del_1', '应保留 sourceType/sourceId');
    assert(after.story === '测试故事' && after.characterId === 'c_del_1', '应保留 story/characterId');
    assert(after.description.includes('原描述'), '原描述应保留');
    assert(/删除|阻塞|来源信息已保留/.test(after.description), '应追加保留说明');
    ok('删除角色阻塞 通过');
  }

  // ============ 路径 4：备份恢复（reissue + normalize + 一致性校验） ============
  section('路径4 · 备份恢复：restore + 重复id重建 + 一致性校验 blocked');
  {
    // 构造一个 version 2 备份包
    const bundle = {
      version: 2,
      exportedAt: new Date().toISOString(),
      characters: [
        { id: 'dupc', name: '角色甲', story: '故事Z' },
        { id: 'dupc', name: '角色乙(重复id)', story: '故事Z' }, // 重复 id → 重建
      ],
      rehearsalPlans: [
        { id: 'planZ', name: '计划Z', story: '故事Z', characters: [] },
      ],
      inspectionTasks: [
        // 幽灵 characterId → 恢复后应 blocked
        { id: 'tk_ghost', sourceType: 'character', sourceId: 'ghost', story: '故事Z', characterId: 'ghost', planId: '', title: '幽灵任务', description: 'D', severity: 'high', status: 'open', assignee: '', dueAt: '', resolvedAt: '', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' },
        // 幽灵 planId → 恢复后应 blocked
        { id: 'tk_ghost2', sourceType: 'rehearsal', sourceId: 'ghostplan', story: '故事Z', characterId: 'dupc', planId: 'ghostplan', title: '幽灵计划任务', description: '', severity: 'medium', status: 'open', assignee: '', dueAt: '', resolvedAt: '', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' },
        // 重复 id（与幽灵任务同 id）+ 多余旧字段 → id 重建、字段丢弃
        { id: 'tk_ghost', accessoryStatus: '脏字段', sourceType: 'manual', sourceId: '', story: '故事Z', characterId: 'dupc', planId: '', title: '正常任务', description: '正常', severity: 'low', status: 'open', assignee: '乙', dueAt: '', resolvedAt: '', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' },
      ],
    };

    assert(isBackupBundle(bundle), 'isBackupBundle 应识别 version 2 备份包');
    assert(BACKUP_BUNDLE_VERSION === 2, 'BACKUP_BUNDLE_VERSION 应为 2');

    // reissueDuplicateIds 单元验证
    const dupProbe = reissueDuplicateIds(
      [{ id: 'a' }, { id: 'a' }, { id: 'b' }],
      () => 'new_' + Math.random().toString(36).slice(2, 8),
    );
    assert(dupProbe.reissued === 1, `reissueDuplicateIds 应重建 1 个，实际 ${dupProbe.reissued}`);
    const ids = dupProbe.items.map(i => i.id);
    assert(new Set(ids).size === 3, '重建后 id 应全部唯一');

    // 恢复三类数据（模拟 TopBar.restoreFromBundle 流程）
    const cr = charsApi.restoreCharacters(bundle.characters);
    const pr = plansApi.restorePlans(bundle.rehearsalPlans);
    const tr = tasksApi.restoreTasks(bundle.inspectionTasks);
    assert(cr.count === 2, `角色恢复数应为 2，实际 ${cr.count}`);
    assert(cr.reissued === 1, `角色重复 id 应重建 1 个，实际 ${cr.reissued}`);
    assert(tr.count === 3, `任务恢复数应为 3，实际 ${tr.count}`);
    assert(tr.reissued === 1, `任务重复 id 应重建 1 个，实际 ${tr.reissued}`);

    // 恢复后任务不得残留脏字段
    const normalTask = tasksApi.tasks.value.find(t => t.title === '正常任务');
    assert(!!normalTask && !('accessoryStatus' in normalTask), '恢复后多余字段应被丢弃');
    assert(new Set(tasksApi.tasks.value.map(t => t.id)).size === 3, '恢复后任务 id 应唯一');

    // 一致性校验
    const validCharacterIds = new Set(charsApi.characters.value.map(c => c.id));
    const validPlanIds = new Set(plansApi.rehearsalPlans.value.map(p => p.id));
    const blocked = tasksApi.validateTaskConsistency(validCharacterIds, validPlanIds);
    assert(blocked === 2, `应有 2 个悬空任务被 blocked，实际 ${blocked}`);

    const ghost = tasksApi.tasks.value.find(t => t.title === '幽灵任务');
    const ghost2 = tasksApi.tasks.value.find(t => t.title === '幽灵计划任务');
    assert(ghost.status === 'blocked', '幽灵 characterId 任务应 blocked');
    assert(ghost.sourceType === 'character' && ghost.sourceId === 'ghost' && ghost.story === '故事Z', 'blocked 任务应保留 sourceType/sourceId/story');
    assert(/不存在|阻塞|来源信息已保留/.test(ghost.description), 'blocked 任务应追加保留说明');
    assert(ghost2.status === 'blocked', '幽灵 planId 任务应 blocked');

    const normalAfter = tasksApi.tasks.value.find(t => t.title === '正常任务');
    assert(normalAfter.status === 'open', '有效关联的正常任务不应被 blocked');
    ok('备份恢复 通过');
  }

  console.log(`\n==== 自检结果：${passed} 通过, ${failed} 失败 ====`);
  if (failed > 0) {
    console.error('失败项：\n - ' + failures.join('\n - '));
    process.exit(1);
  }
  process.exit(0);
}

main().catch((err) => {
  console.error('自检脚本异常：', err);
  process.exit(1);
});
