import { useState } from 'react'
import { NavLink } from 'react-router'
import { useLangue } from '../../commun/i18n'
import { Icone } from '../../commun/Icone'
import { FeuilleMenu } from './Feuilles'

/**
 * Navigation principale : la carte, les affiches à découvrir, le scanner (au centre, mis en avant),
 * l'agenda et « Plus » (langue, accessibilité, consignes, mentions), accessible depuis toutes les pages.
 */
export function NavBas() {
  const { t } = useLangue()
  const [menu, setMenu] = useState(false)
  return (
    <>
      <nav className="nav-bas" aria-label="Navigation principale">
        <NavLink to="/" end>
          <Icone nom="carte" taille={21} />
          {t('nav.explorer')}
        </NavLink>
        <NavLink to="/affiches">
          <Icone nom="affiche" taille={21} />
          {t('nav.affiches')}
        </NavLink>
        <NavLink to="/scanner" className="nav-scan">
          <span className="orbe-scan">
            <Icone nom="scan" taille={22} />
          </span>
          {t('nav.scanner')}
        </NavLink>
        <NavLink to="/agenda">
          <Icone nom="calendrier" taille={21} />
          {t('nav.agenda')}
        </NavLink>
        <button type="button" onClick={() => setMenu(true)} aria-haspopup="dialog">
          <Icone nom="menu" taille={21} />
          {t('nav.plus')}
        </button>
      </nav>
      <FeuilleMenu ouverte={menu} onFermer={() => setMenu(false)} />
    </>
  )
}
