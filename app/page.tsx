import { redirect } from 'next/navigation'

// Kök → dashboard. Giriş yoksa middleware /login'e yönlendirir.
export default function Home() {
  redirect('/dashboard')
}
