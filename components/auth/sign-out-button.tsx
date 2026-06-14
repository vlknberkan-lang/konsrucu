import { LogOut } from 'lucide-react'
import { signOutAction } from '@/app/actions/auth'

/** Çıkış — server action (oturumu sunucuda kapatır, cookie'yi kesin siler). */
export function SignOutButton() {
  return (
    <form action={signOutAction}>
      <button
        type="submit"
        className="inline-flex items-center gap-2 rounded-[10px] border border-border bg-card px-3.5 py-2 text-sm font-medium text-muted-foreground transition hover:border-kr/40 hover:text-foreground"
      >
        <LogOut className="h-4 w-4" /> Çıkış
      </button>
    </form>
  )
}
