<script setup lang="ts">
import { ref, reactive, watch, computed } from 'vue';
import { X, Plus, Trash2 } from 'lucide-vue-next';
import type { Character, AccessoryGap, RiskLevel, CharacterStatus, HandoverStatus } from '../types';
import { STATUS_LABELS, RISK_LABELS } from '../types';
import { useCharacters } from '../composables/useCharacters';
import { useToast } from '../composables/useToast';

const props = defineProps<{
  visible: boolean;
  editCharacter: Character | null;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'saved', character: Character): void;
}>();

const { addCharacter, updateCharacter } = useCharacters();
const { success, error } = useToast();

interface FormState {
  name: string;
  story: string;
  linkCount: number;
  accessoryStatus: string;
  demoOrder: number;
  owner: string;
  riskLevel: RiskLevel;
  riskNote: string;
  repairNote: string;
  status: CharacterStatus;
  missingAccessories: AccessoryGap[];
  operationReminders: string[];
  handoverStatus: HandoverStatus;
  handoverNote: string;
}

const defaultForm: FormState = {
  name: '',
  story: '',
  linkCount: 5,
  accessoryStatus: '',
  demoOrder: 1,
  owner: '',
  riskLevel: 'low',
  riskNote: '',
  repairNote: '',
  status: 'pending_assembly',
  missingAccessories: [],
  operationReminders: [],
  handoverStatus: 'not_checked',
  handoverNote: '',
};

const form = reactive<FormState>({ ...defaultForm });
const errors = reactive<Record<string, string>>({});
const newAccessoryName = ref('');
const newAccessoryRequired = ref(1);
const newAccessoryAvailable = ref(0);
const newReminder = ref('');

const isEdit = computed(() => !!props.editCharacter);

watch(() => props.visible, (v) => {
  if (v) {
    if (props.editCharacter) {
      Object.assign(form, {
        name: props.editCharacter.name,
        story: props.editCharacter.story,
        linkCount: props.editCharacter.linkCount,
        accessoryStatus: props.editCharacter.accessoryStatus,
        demoOrder: props.editCharacter.demoOrder,
        owner: props.editCharacter.owner,
        riskLevel: props.editCharacter.riskLevel,
        riskNote: props.editCharacter.riskNote,
        repairNote: props.editCharacter.repairNote,
        status: props.editCharacter.status,
        missingAccessories: JSON.parse(JSON.stringify(props.editCharacter.missingAccessories)),
        operationReminders: [...props.editCharacter.operationReminders],
        handoverStatus: props.editCharacter.handoverStatus,
        handoverNote: props.editCharacter.handoverNote,
      });
    } else {
      Object.assign(form, JSON.parse(JSON.stringify(defaultForm)));
    }
    Object.keys(errors).forEach(k => delete errors[k]);
    newAccessoryName.value = '';
    newAccessoryRequired.value = 1;
    newAccessoryAvailable.value = 0;
    newReminder.value = '';
  }
});

function validate(): boolean {
  Object.keys(errors).forEach(k => delete errors[k]);
  if (!form.name.trim()) errors.name = '请输入角色名';
  if (!form.story.trim()) errors.story = '请输入所属故事';
  if (form.linkCount < 0) errors.linkCount = '连杆数量不能为负数';
  if (form.demoOrder < 1) errors.demoOrder = '演示顺序必须大于0';
  return Object.keys(errors).length === 0;
}

function handleSave() {
  if (!validate()) return;

  if (isEdit.value && props.editCharacter) {
    const result = updateCharacter(props.editCharacter.id, { ...form });
    if (result) {
      success(`角色「${form.name}」已更新`);
      emit('saved', result);
      emit('close');
    } else {
      error('更新失败');
    }
  } else {
    const result = addCharacter({ ...form });
    success(`角色「${form.name}」已创建`);
    emit('saved', result);
    emit('close');
  }
}

function addAccessory() {
  if (!newAccessoryName.value.trim()) return;
  form.missingAccessories.push({
    name: newAccessoryName.value.trim(),
    required: Math.max(1, newAccessoryRequired.value),
    available: Math.max(0, newAccessoryAvailable.value),
  });
  newAccessoryName.value = '';
  newAccessoryRequired.value = 1;
  newAccessoryAvailable.value = 0;
}

function removeAccessory(idx: number) {
  form.missingAccessories.splice(idx, 1);
}

function addReminder() {
  if (!newReminder.value.trim()) return;
  form.operationReminders.push(newReminder.value.trim());
  newReminder.value = '';
}

function removeReminder(idx: number) {
  form.operationReminders.splice(idx, 1);
}
</script>

<template>
  <div v-if="visible" class="modal-backdrop" @click.self="emit('close')">
    <div class="modal-content">
      <div class="flex items-center justify-between px-5 py-4 border-b border-rice-200 bg-gradient-to-r from-cinnabar-50 to-rice-50">
        <h2 class="font-serif text-lg font-bold text-ink-900">
          {{ isEdit ? '编辑角色' : '新增角色' }}
        </h2>
        <button
          class="p-1.5 rounded hover:bg-rice-200 text-ink-500 hover:text-ink-700 transition-colors"
          @click="emit('close')"
        >
          <X class="w-5 h-5" />
        </button>
      </div>

      <div class="p-5 overflow-y-auto max-h-[calc(90vh-140px)]">
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label class="label-base">角色名 <span class="text-red-500">*</span></label>
            <input v-model="form.name" class="input-base" placeholder="如：孙悟空" />
            <p v-if="errors.name" class="text-xs text-red-500 mt-1">{{ errors.name }}</p>
          </div>

          <div>
            <label class="label-base">所属故事 <span class="text-red-500">*</span></label>
            <input v-model="form.story" class="input-base" placeholder="如：三打白骨精" />
            <p v-if="errors.story" class="text-xs text-red-500 mt-1">{{ errors.story }}</p>
          </div>

          <div>
            <label class="label-base">演示顺序 <span class="text-red-500">*</span></label>
            <input v-model.number="form.demoOrder" type="number" class="input-base" min="1" />
            <p v-if="errors.demoOrder" class="text-xs text-red-500 mt-1">{{ errors.demoOrder }}</p>
          </div>

          <div>
            <label class="label-base">连杆数量</label>
            <input v-model.number="form.linkCount" type="number" class="input-base" min="0" />
            <p v-if="errors.linkCount" class="text-xs text-red-500 mt-1">{{ errors.linkCount }}</p>
            <p class="text-xs text-ink-400 mt-1">建议范围：1-20</p>
          </div>

          <div>
            <label class="label-base">当前状态</label>
            <select v-model="form.status" class="select-base">
              <option v-for="(label, key) in STATUS_LABELS" :key="key" :value="key">{{ label }}</option>
            </select>
          </div>

          <div>
            <label class="label-base">风险等级</label>
            <select v-model="form.riskLevel" class="select-base">
              <option v-for="(label, key) in RISK_LABELS" :key="key" :value="key">{{ label }}</option>
            </select>
          </div>

          <div>
            <label class="label-base">责任人</label>
            <input v-model="form.owner" class="input-base" placeholder="请输入责任人姓名" />
          </div>

          <div>
            <label class="label-base">配件状态概述</label>
            <input v-model="form.accessoryStatus" class="input-base" placeholder="如：完整、需补件、有缺损" />
          </div>

          <div class="sm:col-span-2">
            <label class="label-base">风险说明</label>
            <textarea v-model="form.riskNote" class="input-base" rows="2" placeholder="描述该角色的潜在风险点"></textarea>
          </div>

          <div class="sm:col-span-2">
            <label class="label-base">修补备注</label>
            <textarea v-model="form.repairNote" class="input-base" rows="2" placeholder="记录修补计划、待办事项等"></textarea>
          </div>
        </div>

        <div class="mt-5">
          <label class="label-base">配件清单</label>
          <div class="border border-ink-200 rounded-md overflow-hidden">
            <table class="w-full text-sm">
              <thead class="bg-rice-100">
                <tr>
                  <th class="text-left px-3 py-2 font-medium text-ink-700">配件名称</th>
                  <th class="text-center px-3 py-2 font-medium text-ink-700 w-20">需求</th>
                  <th class="text-center px-3 py-2 font-medium text-ink-700 w-20">现有</th>
                  <th class="w-10"></th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(acc, idx) in form.missingAccessories" :key="idx" class="border-t border-rice-100">
                  <td class="px-3 py-1.5">
                    <input v-model="acc.name" class="input-base !py-1 !text-sm" />
                  </td>
                  <td class="px-3 py-1.5">
                    <input v-model.number="acc.required" type="number" min="1" class="input-base !py-1 !text-sm !text-center" />
                  </td>
                  <td class="px-3 py-1.5">
                    <input v-model.number="acc.available" type="number" min="0" class="input-base !py-1 !text-sm !text-center" />
                  </td>
                  <td class="px-2 py-1.5">
                    <button class="p-1 text-red-400 hover:text-red-600" @click="removeAccessory(idx)">
                      <Trash2 class="w-4 h-4" />
                    </button>
                  </td>
                </tr>
                <tr class="border-t border-rice-100 bg-ink-50/50">
                  <td class="px-3 py-1.5">
                    <input v-model="newAccessoryName" class="input-base !py-1 !text-sm" placeholder="新增配件名称" @keyup.enter="addAccessory" />
                  </td>
                  <td class="px-3 py-1.5">
                    <input v-model.number="newAccessoryRequired" type="number" min="1" class="input-base !py-1 !text-sm !text-center" />
                  </td>
                  <td class="px-3 py-1.5">
                    <input v-model.number="newAccessoryAvailable" type="number" min="0" class="input-base !py-1 !text-sm !text-center" />
                  </td>
                  <td class="px-2 py-1.5">
                    <button class="p-1 text-bamboo-600 hover:text-bamboo-700" @click="addAccessory">
                      <Plus class="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <div class="mt-5">
          <label class="label-base">操作提醒</label>
          <div class="space-y-2">
            <div
              v-for="(reminder, idx) in form.operationReminders"
              :key="idx"
              class="flex items-center gap-2 bg-rice-50 rounded-md px-3 py-2 border border-rice-100"
            >
              <input v-model="form.operationReminders[idx]" class="flex-1 bg-transparent outline-none text-sm" />
              <button class="p-1 text-red-400 hover:text-red-600" @click="removeReminder(idx)">
                <Trash2 class="w-4 h-4" />
              </button>
            </div>
            <div class="flex items-center gap-2">
              <input
                v-model="newReminder"
                class="input-base flex-1"
                placeholder="添加一条操作提醒"
                @keyup.enter="addReminder"
              />
              <button class="btn-secondary !py-2" @click="addReminder">
                <Plus class="w-4 h-4" />
                添加
              </button>
            </div>
          </div>
        </div>
      </div>

      <div class="flex items-center justify-end gap-2 px-5 py-3 border-t border-rice-200 bg-rice-50/50">
        <button class="btn-secondary" @click="emit('close')">取消</button>
        <button class="btn-primary" @click="handleSave">
          {{ isEdit ? '保存修改' : '创建角色' }}
        </button>
      </div>
    </div>
  </div>
</template>
