import { createRouter, createWebHistory } from 'vue-router'
import WorkstationDashboard from '@/pages/WorkstationDashboard.vue'
import HomePage from '@/pages/HomePage.vue'
import StoryChecklist from '@/pages/StoryChecklist.vue'
import HandoverBoard from '@/pages/HandoverBoard.vue'
import RehearsalPlanList from '@/pages/RehearsalPlanList.vue'
import RehearsalPlanDetail from '@/pages/RehearsalPlanDetail.vue'
import InspectionCenter from '@/pages/InspectionCenter.vue'

// 定义路由配置
const routes = [
  {
    path: '/',
    name: 'dashboard',
    component: WorkstationDashboard,
  },
  {
    path: '/characters',
    name: 'home',
    component: HomePage,
  },
  {
    path: '/checklist',
    name: 'checklist',
    component: StoryChecklist,
  },
  {
    path: '/handover',
    name: 'handover',
    component: HandoverBoard,
  },
  {
    path: '/rehearsal',
    name: 'rehearsal-list',
    component: RehearsalPlanList,
  },
  {
    path: '/rehearsal/:id',
    name: 'rehearsal-detail',
    component: RehearsalPlanDetail,
  },
  {
    path: '/inspection',
    name: 'inspection',
    component: InspectionCenter,
  },
  {
    path: '/about',
    name: 'about',
    component: {
      template: '<div class="text-center text-xl p-8">About Page - Coming Soon</div>',
    },
  },
]

// 创建路由实例
const router = createRouter({
  history: createWebHistory(),
  routes,
})

export default router
