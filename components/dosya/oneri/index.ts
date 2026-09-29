/**
 * KonsRücü — Öneri bileşenleri (S18, S19) · components/dosya/oneri
 *
 * Dosya sayfasına bağlama (Bağla aşaması):
 *   import { oneriPaneliYukle } from '@/lib/konsrucu/oneri/yukle'
 *   const panel = await oneriPaneliYukle(dosya.id)   // null → dosya aktif müvekkilde değil
 *   {panel && <>
 *     <AiCikarim veri={panel.aiCikarim} />
 *     <Bulduklarimiz veri={panel.bulduklarimiz} />
 *     <RucuSebebiSec veri={panel.rucuSebebi} />
 *     <EksikEvrak veri={panel.eksikEvrak} />
 *     <YetkiliIcraSec veri={panel.yetkiliIcra} />
 *   </>}
 */
export { AiCikarim } from './ai-cikarim'
export { Bulduklarimiz } from './bulduklarimiz'
export { OneriSatiri } from './oneri-satiri'
export { KaynakGoster, type KaynakHedefi } from './kaynak-goster'
export { RucuSebebiSec } from './rucu-sebebi-sec'
export { EksikEvrak } from './eksik-evrak'
export { YetkiliIcraSec } from './yetkili-icra-sec'
