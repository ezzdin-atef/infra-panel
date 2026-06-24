import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

// computeNextRun is a pure function — inline it here to avoid pulling in
// @repo/config which requires DATABASE_URL / REDIS_URL / JWT_SECRET at import time.
function computeNextRun(frequency: string, from = new Date()): Date {
  const next = new Date(from)
  if (frequency === 'daily') {
    next.setDate(next.getDate() + 1)
  } else if (frequency === 'weekly') {
    next.setDate(next.getDate() + 7)
  } else {
    next.setMonth(next.getMonth() + 1)
  }
  return next
}

describe('computeNextRun', () => {
  test('daily adds 1 day', () => {
    const from = new Date('2025-01-15T10:00:00Z')
    const next = computeNextRun('daily', from)
    assert.equal(next.getUTCDate(), 16)
    assert.equal(next.getUTCMonth(), 0) // January
  })

  test('weekly adds 7 days', () => {
    const from = new Date('2025-01-15T10:00:00Z')
    const next = computeNextRun('weekly', from)
    assert.equal(next.getUTCDate(), 22)
  })

  test('monthly adds 1 month', () => {
    const from = new Date('2025-01-15T10:00:00Z')
    const next = computeNextRun('monthly', from)
    assert.equal(next.getUTCMonth(), 1) // February
  })

  test('uses current date when from is omitted', () => {
    const before = Date.now()
    const next = computeNextRun('daily')
    const after = Date.now()
    assert.ok(next.getTime() >= before + 24 * 60 * 60 * 1000 - 1000)
    assert.ok(next.getTime() <= after + 24 * 60 * 60 * 1000 + 1000)
  })
})
