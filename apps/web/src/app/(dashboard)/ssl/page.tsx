import { SslCertificateList } from '@/components/ssl/ssl-certificate-list'

export default function SslPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">SSL Certificates</h1>
        <p className="text-sm text-gray-400">Manage Let&apos;s Encrypt SSL certificates via Certbot</p>
      </div>
      <SslCertificateList />
    </div>
  )
}
