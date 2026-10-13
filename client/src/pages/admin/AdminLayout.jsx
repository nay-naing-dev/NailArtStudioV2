import { NavLink, Outlet, Link } from 'react-router-dom';
import { CalendarDays, ExternalLink, LayoutDashboard, LogOut, Palette } from 'lucide-react';
import { useAuth } from '../../lib/auth';
import { Logo } from '../../components/Layout';

const NAV = [
  { to: '/admin', label: 'Overview', icon: LayoutDashboard, end: true },
  { to: '/admin/appointments', label: 'Appointments', icon: CalendarDays },
  { to: '/admin/designs', label: 'Designs', icon: Palette },
];

const linkClass = ({ isActive }) =>
  `flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm whitespace-nowrap transition ${
    isActive ? 'bg-ink text-white' : 'text-ink-soft hover:bg-blush-100 hover:text-ink'
  }`;

export default function AdminLayout() {
  const { user, logout } = useAuth();
  return (
    <div className="min-h-screen md:flex">
      <aside className="border-b border-line bg-white md:sticky md:top-0 md:flex md:h-screen md:w-60 md:flex-col md:border-r md:border-b-0">
        <div className="flex h-16 items-center px-4">
          <Logo />
        </div>
        <nav className="flex gap-1 overflow-x-auto px-3 pb-3 md:flex-1 md:flex-col md:pb-0">
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.end} className={linkClass}>
              <n.icon className="size-4" /> {n.label}
            </NavLink>
          ))}
        </nav>
        <div className="hidden border-t border-line p-3 md:block">
          <Link to="/" className="flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm text-ink-soft hover:bg-blush-100">
            <ExternalLink className="size-4" /> View site
          </Link>
          <button onClick={logout} className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-sm text-ink-soft hover:bg-blush-100">
            <LogOut className="size-4" /> Log out
          </button>
          <p className="mt-2 truncate px-3 text-xs text-ink-soft">{user?.email}</p>
        </div>
      </aside>
      <main className="min-w-0 flex-1 px-4 py-8 md:px-8">
        <Outlet />
      </main>
    </div>
  );
}
