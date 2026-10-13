import { Moon, Sun } from 'lucide-react';
import { useI18n } from '../lib/i18n';
import { useTheme } from '../lib/theme';

const OPTIONS = [
  { id: 'light', icon: Sun },
  { id: 'dark', icon: Moon },
];

export default function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const { t } = useI18n();

  return (
    <div role="radiogroup" aria-label={t('theme.label')} className="inline-flex items-center rounded-sm border border-line bg-white p-0.5">
      {OPTIONS.map(({ id, icon: Icon }) => (
        <button
          key={id}
          role="radio"
          aria-checked={theme === id}
          aria-label={t(`theme.${id}`)}
          title={t(`theme.${id}`)}
          onClick={() => setTheme(id)}
          className={`flex size-7 items-center justify-center rounded-sm transition ${theme === id ? 'bg-ink text-white' : 'text-ink-soft hover:text-ink'}`}
        >
          <Icon className="size-3.5" />
        </button>
      ))}
    </div>
  );
}
