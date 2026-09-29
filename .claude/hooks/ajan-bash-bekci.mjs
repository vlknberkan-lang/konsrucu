#!/usr/bin/env node
/**
 * Alt ajan Bash bekçisi — PreToolUse kancası (.claude/settings.json, matcher "Bash").
 * "Güvenme, zorla": `.claude/agents/<ad>.md` tanımında Write/Edit aracı OLMAYAN (salt okuma) proje ajanı Bash'ten
 * yazamaz — git'e yazan komutlar, dosya silme/taşıma/kopyalama, dosyaya yönlendirme, yerinde düzenleme, Prisma
 * şema/DB komutları, `YAZ=1` ile veri betikleri, ağır/derleme komutları engellenir (çıkış 2 = araç çağrısı reddedilir,
 * stderr ajana gider). Ana oturum (agent_type yok), yerleşik ajanlar (general-purpose, Explore, Plan…) ve
 * tanımında Write/Edit olan ajanlar etkilenmez. Kaynak: konstraERP (bir verifier sır maskeleyicisini ezmişti).
 */
import fs from 'node:fs'
import path from 'node:path'

const okuStdin = () => { try { return fs.readFileSync(0, 'utf8') } catch { return '' } }

let girdi = {}
try { girdi = JSON.parse(okuStdin() || '{}') } catch { process.exit(0) }

const ajan = girdi.agent_type
const komut = String(girdi.tool_input?.command ?? '')
if (!ajan || !komut) process.exit(0)

const kok = girdi.cwd || process.cwd()
const tanim = path.join(kok, '.claude', 'agents', `${ajan}.md`)
if (!fs.existsSync(tanim)) process.exit(0) // yerleşik ya da proje dışı ajan

const bas = fs.readFileSync(tanim, 'utf8').split(/\r?\n---/)[0]
const araclar = (/^tools:\s*(.+)$/m.exec(bas)?.[1] ?? '').split(',').map((s) => s.trim())
if (araclar.includes('Write') || araclar.includes('Edit')) process.exit(0) // yazma yetkili ajan

// Salt okuma ajanın Bash'ten yapamayacakları. /dev/null ve 2>&1 yönlendirmesi serbest.
// [kalıp, neden, tırnakİçiDahil]: komut kalıpları tırnak DIŞI metinde aranır (grep "=>" / grep "rm " yanlış alarm vermesin);
// satır içi kod ve veri betiği işaretleri tırnak içinde de aranır (node -e "…update(…)").
const tirnaksiz = komut.replace(/'[^']*'|"(?:\\.|[^"\\])*"/g, '""')
const YASAK = [
  [/\bgit\s+(commit|push|add|reset|checkout|restore|stash|merge|rebase|cherry-pick|revert|clean|rm|mv|tag|branch\s+-[dDmM]|update-index|apply|am)\b/, 'git geçmişine ya da çalışma ağacına yazan git komutu'],
  [/(^|[\s;&|(])(rm|rmdir|mv|cp|del|move|touch|mkdir|chmod|ln|truncate|dd)\s/, 'dosya silme/taşıma/kopyalama/oluşturma'],
  [/\bsed\s+(-[a-zA-Z]*i|--in-place)/, 'yerinde dosya düzenleme (sed -i)'],
  [/\btee\b/, 'dosyaya yazma (tee)'],
  [/(^|[^0-9&<>])>{1,2}\s*(?!\/dev\/null|&)[^\s&|;]/, 'dosyaya yönlendirme (> dosya)'],
  [/\bprisma\s+(db\s+(push|execute|seed)|migrate|generate)\b/, 'Prisma şema/DB komutu'],
  [/\bnpm\s+run\s+(-s\s+)?(db:|build|seed|prisma:|yedek)/, 'DB / derleme / seed / yedek betiği'],
  [/--(apply|uygula)\b/, 'veri yazan betik (--apply / --uygula)', true],
  [/\bvercel\b/, 'Vercel komutu (deploy / env)'],
  [/\bnext\s+build\b|\bnpm\s+run\s+(-s\s+)?dev\b|\bnext\s+dev\b/, 'derleme / geliştirme sunucusu'],
  [/\bYAZ=1\b|\bDUYURU=1\b|\bKAPAT=1\b/, 'veri yazan betik (YAZ=1)', true],
  [/\.(create|createMany|update|updateMany|upsert|delete|deleteMany)\s*\(|\$executeRaw|\$queryRawUnsafe\s*\(\s*['"`]\s*(insert|update|delete|drop|alter|truncate)/i, 'veritabanına yazan satır içi kod', true],
  [/\b(curl|wget|Invoke-WebRequest)\b[^\n]*(-X\s*(POST|PUT|PATCH|DELETE)|--data|-d\s)/i, 'dış servise yazan istek', true],
  [/\bpython[0-9.]*\b[^\n]*(open\([^)]*['"][wa]|\.write\(|os\.remove|shutil\.)/, 'dosyaya yazan python', true],
  [/\bnode\b[^\n]*(writeFileSync|appendFileSync|unlinkSync|rmSync|renameSync|copyFileSync|mkdirSync)/, 'dosyaya yazan node', true],
]

for (const [re, neden, tirnakIci] of YASAK) {
  if (re.test(tirnakIci ? komut : tirnaksiz)) {
    process.stderr.write(
      `Engellendi (ajan-bash-bekci): "${ajan}" salt okuma ajanı — ${neden}. ` +
        'Bu ajan yalnız okur ve bulgu döner; yazma işini ana oturum yapar. Gerekirse bulguna "yazılması gereken" diye ekle.\n',
    )
    process.exit(2)
  }
}
process.exit(0)
