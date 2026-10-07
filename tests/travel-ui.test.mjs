import test from 'node:test'
import assert from 'node:assert/strict'
import {
  validateTimeRange,
  validateSelection,
  applyTradeoff,
  assetUrl
} from '../src/utils/travel-ui.js'
const range = {
  startDate: '2026-10-10',
  startSlot: '上午',
  endDate: '2026-10-10',
  endSlot: '晚上'
}
const pois = [
  { poiId: 'ip', type: 'ip' },
  { poiId: 'classic', type: 'classic' },
  { poiId: 'extra', type: 'ip' }
]
test('rejects empty, nonexistent and reversed dates, reversed slots and unsupported hours', () => {
  assert.equal(validateTimeRange(range, 8), '')
  for (const patch of [
    { startDate: '' },
    { startDate: '2026-02-30' },
    { endDate: '2026-10-09' },
    { startSlot: '晚上', endSlot: '上午' },
    { endSlot: '午夜' }
  ])
    assert.ok(validateTimeRange({ ...range, ...patch }, 8))
  assert.ok(validateTimeRange(range, 7))
})
// 定稿规则：至少保留一个点位，不要求 IP 和城市景点两类都选。
test('at least one known POI must remain after a tradeoff', () => {
  assert.equal(validateSelection(pois, ['ip']), '')
  assert.equal(validateSelection(pois, ['classic']), '')
  assert.ok(validateSelection(pois, []))
  assert.ok(validateSelection(pois, ['unknown']))
  assert.equal(
    validateSelection(
      pois,
      applyTradeoff(['ip', 'classic'], ['classic'], 'overload', pois)
    ),
    ''
  )
  assert.ok(
    validateSelection(
      pois,
      applyTradeoff(['ip', 'classic'], ['ip', 'classic'], 'overload', pois)
    )
  )
})
test('tradeoff respects known ids and does not mutate selections', () => {
  const ids = ['ip', 'classic']
  assert.deepEqual(
    applyTradeoff(ids, ['extra', 'extra', 'unknown'], 'under70', pois),
    ['ip', 'classic', 'extra']
  )
  assert.deepEqual(applyTradeoff(ids, ['classic'], 'overload', pois), ['ip'])
  assert.deepEqual(ids, ['ip', 'classic'])
})
test('assets resolve against Vite base and reject executable URLs', () => {
  assert.equal(assetUrl('img/photo.jpg', '/trip/'), '/trip/img/photo.jpg')
  assert.equal(
    assetUrl('https://example.com/photo.jpg'),
    'https://example.com/photo.jpg'
  )
  for (const src of [
    'javascript:alert(1)',
    'data:text/html,hello',
    '//example.com/a',
    ''
  ])
    assert.equal(assetUrl(src), '')
})
