import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Mail, MailOpen, MousePointerClick, FileWarning, Users, Megaphone } from 'lucide-react'

interface Overview {
  totalCampaigns: number
  totalEmployees: number
  totalGroups: number
  events: { sent: number; opened: number; clicked: number; submitted: number }
}

export default function DashboardPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['reports', 'overview'],
    queryFn: () => api.get<Overview>('/reports/overview').then((r) => r.data),
  })

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
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
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
        </div>
      </div>
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
  tone?: 'warning'
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        <Icon className={tone === 'warning' ? 'size-4 text-warning' : 'size-4 text-muted-foreground'} />
      </CardHeader>
      <CardContent>
        {loading ? <Skeleton className="h-8 w-12" /> : <div className="text-3xl font-semibold">{value ?? 0}</div>}
      </CardContent>
    </Card>
  )
}
