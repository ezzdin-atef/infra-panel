import { buildApp } from './app'
import { env } from '@repo/config'

async function main() {
  const app = await buildApp()

  try {
    await app.listen({ port: env.API_PORT, host: env.API_HOST })
    app.log.info(`API listening on ${env.API_HOST}:${env.API_PORT}`)
  } catch (err) {
    app.log.error(err)
    process.exit(1)
  }
}

main()
