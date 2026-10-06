/** Mirrors src/api/contract.md at upstream 32ec57c; no additional backend fields. */
export interface IP {
  ipId: string
  name: string
  author: string
  kind: 'novel' | 'film' | 'poetry' | 'history'
  cover: string
  aliases: string[]
}
export interface Line {
  lineId: string
  ipId: string
  title: string
  city: string
  cover: string
  recommendDays: number
}
export interface Quote {
  kind: '原著' | '台词'
  brief: string
  full: string
  source: string
}
interface PoiBase {
  poiId: string
  lineId: string
  name: string
  lng: number
  lat: number
  cluster: string
  durationNormal: number
  durationRush: number
  intro: string
  realPhoto: string
  skipNote?: string
}
export type POI = PoiBase &
  (
    | { type: 'ip'; tier: 'S' | 'A' | 'B'; quotes: Quote[] }
    | { type: 'classic'; tier?: never; quotes?: Quote[] }
  )
export type Slot = '上午' | '中午' | '晚上'
export interface TimeRange {
  startDate: string
  startSlot: Slot
  endDate: string
  endSlot: Slot
}
export interface PlanItem {
  poiId: string
  order: number
  duration: number
}
export interface PlanDay {
  day: number
  items: PlanItem[]
}
export type PlanStatus = 'ok' | 'overload' | 'under70'
export interface PlanResult {
  status: PlanStatus
  days: PlanDay[]
  suggestions: { poiId: string; reason: string }[]
  totalMin: number
}
/** UI-only second argument of confirmed(status, selection), not an API payload. */
export interface TradeoffSelection {
  action: 'apply' | 'keep'
  poiIds: string[]
}
