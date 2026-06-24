import type { FastifyInstance } from 'fastify'
import si from 'systeminformation'
import { authenticate } from '../middleware/authenticate'

export async function metricsRoutes(app: FastifyInstance) {
  app.get('/snapshot', { preHandler: [authenticate] }, async (_request, reply) => {
    const [cpu, mem, disk, time, load, net] = await Promise.all([
      si.currentLoad(),
      si.mem(),
      si.fsSize(),
      si.time(),
      si.currentLoad(),
      si.networkStats(),
    ])

    const primaryDisk = disk[0]

    return reply.send({
      cpu: {
        usage: Math.round(cpu.currentLoad * 10) / 10,
        cores: cpu.cpus?.length ?? 1,
      },
      memory: {
        total: mem.total,
        used: mem.used,
        free: mem.free,
        usagePercent: Math.round((mem.used / mem.total) * 1000) / 10,
      },
      disk: {
        total: primaryDisk?.size ?? 0,
        used: primaryDisk?.used ?? 0,
        free: (primaryDisk?.size ?? 0) - (primaryDisk?.used ?? 0),
        usagePercent:
          primaryDisk
            ? Math.round(((primaryDisk.used) / primaryDisk.size) * 1000) / 10
            : 0,
      },
      uptime: {
        seconds: time.uptime,
        bootTime: time.current - time.uptime * 1000,
      },
      load: {
        avg1: load.avgLoad ?? 0,
        avg5: 0,
        avg15: 0,
      },
      network: net.slice(0, 2).map((n) => ({
        iface: n.iface,
        rxSec: n.rx_sec ?? 0,
        txSec: n.tx_sec ?? 0,
      })),
    })
  })
}
