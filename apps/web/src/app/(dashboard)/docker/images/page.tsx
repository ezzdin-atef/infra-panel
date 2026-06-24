import { ImageList } from '@/components/docker/image-list'

export default function ImagesPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Images</h1>
        <p className="text-sm text-gray-400">Manage Docker images</p>
      </div>
      <ImageList />
    </div>
  )
}
