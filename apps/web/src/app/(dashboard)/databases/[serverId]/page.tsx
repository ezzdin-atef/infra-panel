import { ServerDetail } from '@/components/databases/server-detail'

export default async function ServerDetailPage({ params }: { params: Promise<{ serverId: string }> }) {
  const { serverId } = await params
  return <ServerDetail serverId={serverId} />
}
