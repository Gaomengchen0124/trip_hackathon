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
test('both POI categories are required after a tradeoff', () => {
  assert.equal(validateSelection(pois, ['ip', 'classic']), '')
  assert.ok(validateSelection(pois, ['ip']))
  assert.ok(
    validateSelection(
      pois,
      applyTradeoff(['ip', 'classic'], ['ip'], 'overload', pois)
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
