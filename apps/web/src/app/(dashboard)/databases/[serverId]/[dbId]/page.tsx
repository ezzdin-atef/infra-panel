import { DatabaseDetail } from '@/components/databases/database-detail'

export default async function DatabaseDetailPage({ params }: { params: Promise<{ serverId: string; dbId: string }> }) {
  const { serverId, dbId } = await params
  return <DatabaseDetail serverId={serverId} dbId={dbId} />
}
