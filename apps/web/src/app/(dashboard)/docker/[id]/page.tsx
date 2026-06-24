import { ContainerDetail } from '@/components/docker/container-detail'

export default async function ContainerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <ContainerDetail id={id} />
}
