import { defineStore } from 'pinia'
import * as api from '../api/adapter'

/**
 * 全局状态：当前路线、勾选点位、时间参数、规划结果。
 * S4 抽屉的开关状态留在 CustomizeView 内部，不进全局。
 */
export const usePlanStore = defineStore('plan', {
  state: () => ({
    lineId: null,
    line: null,
    ip: null,
    pois: [], // 当前路线的全部候选点（ip + classic）
    checkedIds: [], // 用户勾选的 poiId
    timeRange: { startDate: '', startSlot: '上午', endDate: '', endSlot: '晚上' },
    hoursPerDay: 8, // 6 / 8 / 10
    result: null, // PlanResult，见 api/contract.md
    submitting: false,
  }),
  getters: {
    checkedPois: (s) => s.pois.filter((p) => s.checkedIds.includes(p.poiId)),
    ipPois: (s) => s.pois.filter((p) => p.type === 'ip'),
    classicPois: (s) => s.pois.filter((p) => p.type === 'classic'),
  },
  actions: {
    async loadLine(lineId) {
      const { line, ip, pois } = await api.getLineDetail(lineId)
      this.lineId = lineId
      this.line = line
      this.ip = ip
      this.pois = pois
      this.checkedIds = []
      this.result = null
    },
    togglePoi(poiId) {
      const i = this.checkedIds.indexOf(poiId)
      if (i >= 0) this.checkedIds.splice(i, 1)
      else this.checkedIds.push(poiId)
    },
    setTimeRange(patch) {
      this.timeRange = { ...this.timeRange, ...patch }
    },
    setHours(h) {
      this.hoursPerDay = h
    },
    /** 提交规划。返回 status：'ok' 直接出结果；'overload' / 'under70' 需要弹 S4 抽屉 */
    async submit() {
      this.submitting = true
      try {
        this.result = await api.plan({
          lineId: this.lineId,
          poiIds: [...this.checkedIds],
          timeRange: { ...this.timeRange },
          hoursPerDay: this.hoursPerDay,
        })
        return this.result.status
      } finally {
        this.submitting = false
      }
    },
    /** 重新规划：清空选择与结果（返回菜单"不保留"） */
    reset() {
      this.checkedIds = []
      this.result = null
    },
  },
})
