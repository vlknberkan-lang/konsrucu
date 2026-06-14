'use client'

import { useRouter } from 'next/navigation'
import { LogOut } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

export function SignOutButton() {
  const router = useRouter()
  async function signOut() {
    await createClient().auth.signOut()
    router.push('/login')
    router.refresh()
  }
  return (
    <button
      onClick={signOut}
      className="inline-flex items-center gap-2 rounded-[10px] border border-border bg-card px-3.5 py-2 text-sm font-medium text-muted-foreground transition hover:border-kr/40 hover:text-foreground"
    >
      <LogOut className="h-4 w-4" /> Çıkış
    </button>
  )
}
