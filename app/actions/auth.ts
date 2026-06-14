'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

/** Çıkış — sunucu tarafında oturumu kapatır (cookie kesin silinir), sonra /login'e yönlendirir. */
export async function signOutAction() {
  const supabase = createClient()
  await supabase.auth.signOut()
  redirect('/login')
}
