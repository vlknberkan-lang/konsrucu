import { Rail } from 'konsrucu'

// The 72px module rail (midnight surface, "K" mark, destinations, user chip).
// usePathname is shimmed to /akilli-giris, so the inbox destination is active.
export const Default = () => (
  <div style={{ height: 600, display: 'flex' }}>
    <Rail userInit="BB" />
  </div>
)
