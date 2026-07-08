/**
 * KonsRücü — vitest global setup. Saf fonksiyon testleri DB'ye/Supabase'e GİTMEZ; ancak test edilen
 * modüller (durum.ts → prisma, masraf-cikar.ts → supabase/admin) import edilirken PrismaClient/env
 * okur. Gerçek bağlantı kurulmaz — yalnız construct'ın patlamaması için sahte, iyi biçimli değerler.
 * Var olan gerçek env'i EZMEZ (?? = ile), böylece ileride entegrasyon testi eklenebilir.
 */
process.env.DATABASE_URL ??= 'postgresql://user:pass@localhost:5432/konsrucu_test'
process.env.DIRECT_URL ??= process.env.DATABASE_URL
process.env.NEXT_PUBLIC_SUPABASE_URL ??= 'http://localhost:54321'
process.env.SUPABASE_SERVICE_ROLE_KEY ??= 'test-service-role-key'
