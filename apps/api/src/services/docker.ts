import Dockerode from 'dockerode'

let _docker: Dockerode | null = null

export function getDocker(): Dockerode {
  if (!_docker) {
    _docker = process.platform === 'win32'
      ? new Dockerode({ socketPath: '//./pipe/docker_engine' })
      : new Dockerode({ socketPath: '/var/run/docker.sock' })
  }
  return _docker
}

export async function checkDockerHealth(): Promise<{ healthy: boolean; version?: string; error?: string }> {
  try {
    const docker = getDocker()
    const info = await docker.version()
    return { healthy: true, version: info.Version }
  } catch (e) {
    return { healthy: false, error: e instanceof Error ? e.message : 'Unknown error' }
  }
}
