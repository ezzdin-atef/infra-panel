import { Worker } from 'bullmq'
import { env } from '@repo/config'

const worker = new Worker(
  'infra-tasks',
  async (job) => {
    console.log(`Processing job ${job.id} of type ${job.name}`)
  },
  { connection: { url: env.REDIS_URL, maxRetriesPerRequest: null } }
)

worker.on('completed', (job) => {
  console.log(`Job ${job.id} completed`)
})

worker.on('failed', (job, err) => {
  console.error(`Job ${job?.id} failed:`, err)
})

console.log('Worker started')
