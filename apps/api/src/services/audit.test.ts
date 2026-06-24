import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

// Test that logActivity never throws (even with a failing db).
// We inline the function here to avoid transitive imports that require
// env vars / DB connections at test-load time.
async function logActivity(
  db: { insert: (table: unknown) => { values: (vals: unknown) => Promise<void> } },
  params: { userId?: string | null; action: string; status?: string }
): Promise<void> {
  try {
    await db.insert({}).values({
      userId: params.userId ?? null,
      action: params.action,
      status: params.status ?? 'success',
    })
  } catch {
    // Audit failures must never crash the main request
  }
}

describe('logActivity', () => {
  test('does not throw when db insert fails', async () => {
    const brokenDb = {
      insert: () => {
        throw new Error('DB down')
      },
    } as unknown as Parameters<typeof logActivity>[0]

    await assert.doesNotReject(() =>
      logActivity(brokenDb, { action: 'test.action' })
    )
  })

  test('does not throw when db values() rejects', async () => {
    const rejectingDb = {
      insert: () => ({
        values: async () => { throw new Error('Network error') },
      }),
    } as unknown as Parameters<typeof logActivity>[0]

    await assert.doesNotReject(() =>
      logActivity(rejectingDb, { action: 'test.action', userId: 'abc' })
    )
  })
})
