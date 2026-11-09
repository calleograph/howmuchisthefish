import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { ChartContainer, ChartTooltipContent, Recharts } from '@/components/ui/chart'
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
      <div>
        <h1 className="text-2xl font-semibold">Обзор</h1>
        <p className="text-muted-foreground">Сводная статистика по всем кампаниям</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard title="Кампании" value={data?.totalCampaigns} icon={Megaphone} loading={isLoading} />
        <StatCard title="Сотрудники" value={data?.totalEmployees} icon={Users} loading={isLoading} />
        <StatCard title="Группы" value={data?.totalGroups} icon={Users} loading={isLoading} />
      </div>

      <div>
        <h2 className="mb-3 text-lg font-semibold">События кампаний</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          <StatCard title="Отправлено" value={data?.events.sent} icon={Mail} loading={isLoading} />
          <StatCard title="Открыто" value={data?.events.opened} icon={MailOpen} loading={isLoading} />
          <StatCard
            title="Переходов по ссылке"
            value={data?.events.clicked}
            icon={MousePointerClick}
            loading={isLoading}
          />
          <StatCard
            title="Отправлено форм"
            value={data?.events.submitted}
            icon={FileWarning}
            loading={isLoading}
            tone="warning"
          />
          {/* "Скомпрометировано" = уникальные сотрудники, введшие данные
              формы (не количество попыток) — факт ввода, не проверенная
              реальная компрометация (это задача безопасников, не отчёта). */}
          <StatCard
            title="Ввели пароль (скомпрометировано)"
            value={data?.events.compromised}
            icon={KeyRound}
            loading={isLoading}
            tone="danger"
          />
          {/* Положительная метрика (в отличие от остальных — чем выше, тем
              лучше): сотрудник сам распознал подозрительное письмо. */}
          <StatCard
            title="Сообщили о фишинге"
            value={data?.events.reportedPhishing}
            icon={ShieldCheck}
            loading={isLoading}
            tone="success"
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
}: {
  title: string
  value?: number
  icon: React.ElementType
  loading: boolean
  tone?: 'warning' | 'success' | 'danger'
}) {
  const iconClass =
    tone === 'warning'
      ? 'size-4 text-warning'
      : tone === 'success'
        ? 'size-4 text-success'
        : tone === 'danger'
          ? 'size-4 text-destructive'
          : 'size-4 text-muted-foreground'
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        <Icon className={iconClass} />
      </CardHeader>
      <CardContent>
        {loading ? <Skeleton className="h-8 w-12" /> : <div className="text-3xl font-semibold">{value ?? 0}</div>}
      </CardContent>
    </Card>
  )
}
