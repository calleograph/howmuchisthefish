import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { cn } from 'cn'
import { api } from '@/lib/api'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { ChartContainer, ChartTooltipContent, Recharts } from '@/components/ui/chart'
import { ReportButton } from '@/components/ReportButton'
import {
  Mail,
  MailOpen,
  MousePointerClick,
  FileWarning,
  Users,
  Megaphone,
  ShieldCheck,
  KeyRound,
} from 'lucide-react'

interface Overview {
  totalCampaigns: number
  totalEmployees: number
  totalGroups: number
  firstCampaignAt: string | null
  events: {
    sent: number
    opened: number
    clicked: number
    submitted: number
    reportedPhishing: number
    compromised: number
  }
}

interface TimelinePoint {
  date: string
  sent: number
  opened: number
  clicked: number
  submitted: number
  reportedPhishing: number
}

const TIMELINE_CONFIG = {
  sent: { label: 'Отправлено', color: 'var(--chart-1)' },
  opened: { label: 'Открыто', color: 'var(--chart-2)' },
  clicked: { label: 'Переходов', color: 'var(--chart-3)' },
  submitted: { label: 'Отправлено форм', color: 'var(--chart-4)' },
  reportedPhishing: { label: 'Сообщили о фишинге', color: 'var(--chart-5)' },
}

export default function DashboardPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['reports', 'overview'],
    queryFn: () => api.get<Overview>('/reports/overview').then((r) => r.data),
  })
  // Без days — backend сам подбирает диапазон от первой кампании, не
  // "последние 30 дней": иначе на системе с данными за прошлый месяц
  // график показал бы пустые нули вместо реальной картины.
  const { data: timeline, isLoading: timelineLoading } = useQuery({
    queryKey: ['reports', 'timeline'],
    queryFn: () => api.get<TimelinePoint[]>('/reports/timeline').then((r) => r.data),
  })

  const hasAnyCampaigns = (data?.totalCampaigns ?? 0) > 0
  const hasTimelineData = (timeline?.length ?? 0) > 0

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Обзор</h1>
          <p className="text-muted-foreground">Сводная статистика по всем кампаниям</p>
        </div>
        <ReportButton type="overview" label="Отчёт по обзору" />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard title="Кампании" value={data?.totalCampaigns} icon={Megaphone} loading={isLoading} to="/campaigns" />
        <StatCard title="Сотрудники" value={data?.totalEmployees} icon={Users} loading={isLoading} to="/employees" />
        <StatCard title="Группы" value={data?.totalGroups} icon={Users} loading={isLoading} to="/employees" />
      </div>

      <div>
        <h2 className="mb-3 text-lg font-semibold">События кампаний</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          <StatCard
            title="Отправлено"
            value={data?.events.sent}
            icon={Mail}
            loading={isLoading}
            to="/reports?filter=sent"
          />
          <StatCard
            title="Открыто"
            value={data?.events.opened}
            icon={MailOpen}
            loading={isLoading}
            to="/reports?filter=opened"
          />
          <StatCard
            title="Переходов по ссылке"
            value={data?.events.clicked}
            icon={MousePointerClick}
            loading={isLoading}
            to="/reports?filter=clicked"
          />
          <StatCard
            title="Отправлено форм"
            value={data?.events.submitted}
            icon={FileWarning}
            loading={isLoading}
            tone="warning"
            to="/reports?filter=submitted"
          />
          {/* "Скомпрометировано" = уникальные сотрудники, введшие данные
              формы (не количество попыток) — факт ввода, не проверенная
              реальная компрометация (это задача безопасников, не отчёта).
              Отдельного фильтра на /reports нет — ближайший эквивалент
              "submitted" (ввод формы), ведёт туда же. */}
          <StatCard
            title="Скомпрометировано"
            value={data?.events.compromised}
            icon={KeyRound}
            loading={isLoading}
            tone="danger"
            to="/reports?filter=submitted"
          />
          {/* Положительная метрика (в отличие от остальных — чем выше, тем
              лучше): сотрудник сам распознал подозрительное письмо. */}
          <StatCard
            title="Сообщили о фишинге"
            value={data?.events.reportedPhishing}
            icon={ShieldCheck}
            loading={isLoading}
            tone="success"
            to="/reports?filter=reportedPhishing"
          />
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Динамика событий</CardTitle>
        </CardHeader>
        <CardContent>
          {timelineLoading ? (
            <Skeleton className="h-[250px] w-full" />
          ) : !hasAnyCampaigns ? (
            // Честный empty-state вместо графика из нулей: пользователь,
            // зашедший впервые, видит понятное объяснение, а не пустую
            // сетку, которую можно принять за неисправность системы.
            <EmptyTimelineState message="Ни одна кампания ещё не запускалась — график появится после первой отправки" />
          ) : !hasTimelineData ? (
            <EmptyTimelineState message="За выбранный период событий не зафиксировано" />
          ) : (
            <ChartContainer config={TIMELINE_CONFIG}>
              <Recharts.LineChart data={timeline}>
                <Recharts.CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <Recharts.XAxis dataKey="date" tick={{ fontSize: 12 }} />
                <Recharts.YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
                <Recharts.Tooltip content={<ChartTooltipContent />} />
                <Recharts.Legend
                  formatter={(value: string) => TIMELINE_CONFIG[value as keyof typeof TIMELINE_CONFIG]?.label ?? value}
                />
                {Object.entries(TIMELINE_CONFIG).map(([key, cfg]) => (
                  <Recharts.Line
                    key={key}
                    type="monotone"
                    dataKey={key}
                    stroke={cfg.color}
                    strokeWidth={2}
                    dot={false}
                  />
                ))}
              </Recharts.LineChart>
            </ChartContainer>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function EmptyTimelineState({ message }: { message: string }) {
  return (
    <div className="flex h-[250px] items-center justify-center text-center text-sm text-muted-foreground">
      {message}
    </div>
  )
}

function StatCard({
  title,
  value,
  icon: Icon,
  loading,
  tone,
  to,
}: {
  title: string
  value?: number
  icon: React.ElementType
  loading: boolean
  tone?: 'warning' | 'success' | 'danger'
  /** Задание §8: каждый показатель должен открывать соответствующую детализацию. */
  to?: string
}) {
  const iconClass =
    tone === 'warning'
      ? 'size-4 text-warning'
      : tone === 'success'
        ? 'size-4 text-success'
        : tone === 'danger'
          ? 'size-4 text-destructive'
          : 'size-4 text-muted-foreground'
  const card = (
    <Card className={cn(to && 'transition-colors hover:border-primary/40')}>
      <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
        {/* min-w-0 — без него flex-ребёнок не сжимается уже контента и
            выталкивает/наезжает на соседнюю иконку. break-words — "Скомпро-
            метировано" длиннее доступной ширины и без пробелов внутри,
            overflow-wrap:normal по умолчанию не переносит такое слово. */}
        <CardTitle className="min-w-0 text-sm font-medium break-words text-muted-foreground">{title}</CardTitle>
        <Icon className={cn('shrink-0', iconClass)} />
      </CardHeader>
      <CardContent>
        {loading ? <Skeleton className="h-8 w-12" /> : <div className="text-3xl font-semibold">{value ?? 0}</div>}
      </CardContent>
    </Card>
  )
  return to ? (
    <Link to={to} className="block">
      {card}
    </Link>
  ) : (
    card
  )
}
