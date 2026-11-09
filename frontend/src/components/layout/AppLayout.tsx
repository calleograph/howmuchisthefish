import { useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '@/hooks/use-auth'
import { Button } from '@/components/ui/button'
import {
  LayoutDashboard,
  Users,
  Mail,
  FileText,
  Megaphone,
  BarChart3,
  Settings,
  ShieldCheck,
  LogOut,
  Menu,
  X,
} from 'lucide-react'
import { cn } from '@/lib/utils'

// Tailwind spacing scale: класс-N = N * 4px (встроенный --spacing: 0.25rem).
// gap-4 = 16px, gap-2 = 8px, size-6 = 24px и т.д. — класс пишем как
// (желаемые px / 4), не как число пикселей напрямую.

const NAV_ITEMS = [
  { to: '/', label: 'Обзор', icon: LayoutDashboard, end: true },
  { to: '/campaigns', label: 'Кампании', icon: Megaphone },
  { to: '/employees', label: 'Сотрудники', icon: Users },
  { to: '/templates', label: 'Шаблоны писем', icon: Mail },
  { to: '/pages', label: 'Учебные страницы', icon: FileText },
  { to: '/reports', label: 'Аналитика', icon: BarChart3 },
  { to: '/settings', label: 'Настройки', icon: Settings },
]

export default function AppLayout() {
  const { user, logout } = useAuth()
  const [mobileNavOpen, setMobileNavOpen] = useState(false)

  return (
    <div className="flex min-h-screen flex-col lg:flex-row">
      {/* Мобильная шапка: видна только < lg, несёт гамбургер-кнопку вместо
          постоянного сайдбара — на узких экранах фиксированные 240px сайдбара
          сжимали контент до нечитаемой колонки. */}
      <header className="flex items-center justify-between gap-2 border-b bg-sidebar px-4 py-3 lg:hidden">
        <div className="flex min-w-0 items-center gap-2">
          <ShieldCheck className="size-6 shrink-0 text-sidebar-primary" />
          <span className="min-w-0 truncate font-semibold">HowMuchIsTheFish</span>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="min-h-[44px] min-w-[44px] shrink-0"
          onClick={() => setMobileNavOpen((v) => !v)}
          aria-label="Меню"
        >
          {mobileNavOpen ? <X className="size-5" /> : <Menu className="size-5" />}
        </Button>
      </header>

      {mobileNavOpen && (
        <nav className="flex flex-col gap-1 border-b bg-sidebar px-4 py-4 lg:hidden">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              onClick={() => setMobileNavOpen(false)}
              className={({ isActive }) =>
                cn(
                  'flex min-h-[44px] items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                    : 'text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
                )
              }
            >
              <item.icon className="size-4" />
              {item.label}
            </NavLink>
          ))}
          <div className="mt-2 flex flex-col gap-2 border-t pt-4">
            <div className="px-2 text-sm">
              <div className="font-medium">{user?.email}</div>
              <div className="text-muted-foreground">{roleLabel(user?.role)}</div>
            </div>
            <Button variant="ghost" className="min-h-[44px] justify-start gap-2" onClick={logout}>
              <LogOut className="size-4" />
              Выйти
            </Button>
          </div>
        </nav>
      )}

      {/* Постоянный сайдбар — только ≥ lg (1024px). */}
      <aside className="hidden w-60 shrink-0 flex-col border-r bg-sidebar px-4 py-6 lg:flex">
        <div className="mb-8 flex items-center gap-2 px-2">
          <ShieldCheck className="size-6 text-sidebar-primary" />
          <span className="font-semibold leading-tight">
            HowMuchIs
            <br />
            TheFish
          </span>
        </div>
        <nav className="flex flex-col gap-1">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                cn(
                  'flex min-h-[44px] items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                    : 'text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
                )
              }
            >
              <item.icon className="size-4" />
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="mt-auto flex flex-col gap-2 border-t pt-4">
          <div className="px-2 text-sm">
            <div className="font-medium">{user?.email}</div>
            <div className="text-muted-foreground">{roleLabel(user?.role)}</div>
          </div>
          <Button variant="ghost" className="justify-start gap-2" onClick={logout}>
            <LogOut className="size-4" />
            Выйти
          </Button>
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto bg-background p-4 sm:p-6 lg:p-8">
        <Outlet />
      </main>
    </div>
  )
}

function roleLabel(role?: string) {
  switch (role) {
    case 'ADMIN':
      return 'Администратор'
    case 'EDITOR':
      return 'Редактор'
    case 'VIEWER':
      return 'Наблюдатель'
    default:
      return ''
  }
}
