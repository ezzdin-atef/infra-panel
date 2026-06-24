import type { FastifyInstance } from 'fastify'
import { schema } from '@repo/database'

export interface AuditParams {
  userId?: string | null
  action: string
  resourceType?: string
  resourceId?: string
  resourceName?: string
  metadata?: Record<string, unknown>
  ipAddress?: string
  status?: 'success' | 'error'
}

export async function logActivity(db: FastifyInstance['db'], params: AuditParams): Promise<void> {
  try {
    await db.insert(schema.activityLogs).values({
      userId: params.userId ?? null,
      action: params.action,
      resourceType: params.resourceType ?? null,
      resourceId: params.resourceId ?? null,
      resourceName: params.resourceName ?? null,
      metadata: params.metadata ?? null,
      ipAddress: params.ipAddress ?? null,
      status: params.status ?? 'success',
    })
  } catch {
    // Audit failures must never crash the main request
  }
}
