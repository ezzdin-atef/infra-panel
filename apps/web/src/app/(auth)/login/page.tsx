import { LoginForm } from '@/components/auth/login-form'

export default function LoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="w-full max-w-sm space-y-6 rounded-xl border border-gray-800 bg-gray-900 p-8 shadow-xl">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Infra Panel</h1>
          <p className="text-sm text-gray-400">Sign in to your account</p>
        </div>
        <LoginForm />
      </div>
    </div>
  )
}
