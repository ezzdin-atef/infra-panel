import { Worker } from 'bullmq'
import IORedis from 'ioredis'
import { env } from '@repo/config'

const connection = new IORedis(env.REDIS_URL, { maxRetriesPerRequest: null })

const worker = new Worker(
  'infra-tasks',
  async (job) => {
    console.log(`Processing job ${job.id} of type ${job.name}`)
  },
  { connection }
)

worker.on('completed', (job) => {
  console.log(`Job ${job.id} completed`)
})

worker.on('failed', (job, err) => {
  console.error(`Job ${job?.id} failed:`, err)
})

console.log('Worker started')
