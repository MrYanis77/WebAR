import { NavLink } from 'react-router'
import { useLangue } from '../../commun/i18n'
import { Icone } from '../../commun/Icone'

export function NavBas() {
  const { t } = useLangue()
  return (
    <nav className="nav-bas" aria-label="Navigation principale">
      <NavLink to="/" end>
        <Icone nom="carte" taille={20} />
        {t('nav.explorer')}
      </NavLink>
      <NavLink to="/scanner" className="nav-scan">
        <span className="orbe-scan">
          <Icone nom="scan" taille={21} />
        </span>
        {t('nav.scanner')}
      </NavLink>
      <NavLink to="/agenda">
        <Icone nom="calendrier" taille={20} />
        {t('nav.agenda')}
      </NavLink>
    </nav>
  )
}
