import { useState } from 'react';
import { Link, NavLink, Outlet } from 'react-router-dom';
import { Clock, LayoutDashboard, LogOut, MapPin, Menu, Phone, X } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { useI18n } from '../lib/i18n';
import { STUDIO, telUrl } from '../lib/studio';
import ThemeToggle from './ThemeToggle';

const NAV = [
  { to: '/designs', key: 'nav.designs' },
  { to: '/artists', key: 'nav.artists' },
  { to: '/try-on', key: 'nav.tryOn' },
  { to: '/book', key: 'nav.book' },
];

function LanguageToggle() {
  const { lang, toggleLang, t } = useI18n();
  return (
    <button
      onClick={toggleLang}
      aria-label={t('nav.language')}
      className="inline-flex items-center rounded-full border border-line bg-white p-0.5 text-xs font-medium"
    >
      {[
        ['en', 'ENG'],
        ['my', 'မြန်မာ'],
      ].map(([code, label]) => (
        <span key={code} className={`rounded-full px-2.5 py-1 transition ${lang === code ? 'bg-ink text-white' : 'text-ink-soft'}`}>
          {label}
        </span>
      ))}
    </button>
  );
}

const navClass = ({ isActive }) =>
  `rounded-full px-3 py-1.5 text-sm transition ${isActive ? 'bg-blush-100 text-rose-700' : 'text-ink-soft hover:text-ink'}`;

export function Logo() {
  return (
    <Link to="/" className="flex items-center gap-2">
      <img src="/favicon.svg" alt="" className="size-7" />
      <span className="font-display text-lg font-semibold">Lacquer &amp; Co.</span>
    </Link>
  );
}

export default function Layout() {
  const { user, isAdmin, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const { t } = useI18n();

  const account = user ? (
    <>
      {isAdmin && (
        <NavLink to="/admin" className={navClass} onClick={() => setOpen(false)}>
          <span className="inline-flex items-center gap-1.5">
            <LayoutDashboard className="size-4" /> {t('nav.admin')}
          </span>
        </NavLink>
      )}
      <NavLink to="/my-bookings" className={navClass} onClick={() => setOpen(false)}>
        {t('nav.myBookings')}
      </NavLink>
      <button className="btn-ghost px-3 py-1.5" onClick={logout} aria-label={t('nav.logout')}>
        <LogOut className="size-4" />
      </button>
    </>
  ) : (
    <>
      <NavLink to="/login" className={navClass} onClick={() => setOpen(false)}>
        {t('nav.login')}
      </NavLink>
      <Link to="/book" className="btn-primary px-4 py-1.5" onClick={() => setOpen(false)}>
        {t('nav.bookNow')}
      </Link>
    </>
  );

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-30 border-b border-line bg-blush-50/85 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
          <Logo />
          <nav className="hidden items-center gap-1 md:flex">
            {NAV.map((n) => (
              <NavLink key={n.to} to={n.to} className={navClass}>
                {t(n.key)}
              </NavLink>
            ))}
          </nav>
          <div className="hidden items-center gap-2 md:flex">
            <ThemeToggle />
            <LanguageToggle />
            {account}
          </div>
          <div className="flex items-center gap-2 md:hidden">
            <ThemeToggle />
            <LanguageToggle />
            <button className="btn-ghost p-2" onClick={() => setOpen(!open)} aria-label={t('nav.menu')} aria-expanded={open}>
              {open ? <X className="size-5" /> : <Menu className="size-5" />}
            </button>
          </div>
        </div>
        {open && (
          <nav className="flex flex-col gap-1 border-t border-line px-4 py-3 md:hidden">
            {NAV.map((n) => (
              <NavLink key={n.to} to={n.to} className={navClass} onClick={() => setOpen(false)}>
                {t(n.key)}
              </NavLink>
            ))}
            <div className="mt-2 flex flex-wrap items-center gap-1 border-t border-line pt-3">{account}</div>
          </nav>
        )}
      </header>

      <main className="flex-1">
        <Outlet />
      </main>

      <footer className="border-t border-line bg-white">
        <div className="mx-auto grid max-w-6xl gap-px bg-line px-px md:grid-cols-3">
          <div className="bg-white p-6 md:py-10 md:pr-8 md:pl-4">
            <Logo />
            <p className="mt-3 max-w-xs text-sm text-ink-soft">{t('footer.tagline')}</p>
          </div>
          <nav className="bg-white p-6 md:px-8 md:py-10" aria-label={t('footer.explore')}>
            <h3 className="font-sans text-xs font-medium tracking-widest text-ink-soft uppercase">{t('footer.explore')}</h3>
            <ul className="mt-3 space-y-2 text-sm">
              {NAV.map((n) => (
                <li key={n.to}>
                  <Link to={n.to} className="hover:text-rose-600">
                    {t(n.key)}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
          <div className="bg-white p-6 md:py-10 md:pr-4 md:pl-8">
            <h3 className="font-sans text-xs font-medium tracking-widest text-ink-soft uppercase">{t('footer.visit')}</h3>
            <ul className="mt-3 space-y-2.5 text-sm">
              <li className="flex gap-2.5">
                <MapPin className="mt-0.5 size-4 shrink-0 text-rose-500" /> {STUDIO.address}
              </li>
              <li className="flex gap-2.5">
                <Clock className="mt-0.5 size-4 shrink-0 text-rose-500" /> {STUDIO.hours[0].days}, {STUDIO.hours[0].time}
              </li>
              <li className="flex gap-2.5">
                <Phone className="mt-0.5 size-4 shrink-0 text-rose-500" />
                <a href={telUrl()} className="hover:text-rose-600">
                  {STUDIO.phone}
                </a>
              </li>
            </ul>
          </div>
        </div>
        <p className="border-t border-line py-5 text-center text-xs text-ink-soft">
          © {new Date().getFullYear()} Lacquer &amp; Co. {t('brand.footer')}
        </p>
      </footer>
    </div>
  );
}
