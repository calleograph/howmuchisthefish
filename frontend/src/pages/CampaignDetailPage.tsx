import { useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Download } from 'lucide-react'

interface Stats {
  totalTargets: number
  sent: number
  opened: number
  clicked: number
  submitted: number
}

export default function CampaignDetailPage() {
  const { id } = useParams<{ id: string }>()

  const { data: campaign } = useQuery({
    queryKey: ['campaigns', id],
    queryFn: () => api.get(`/campaigns/${id}`).then((r) => r.data),
  })
  const { data: stats } = useQuery({
    queryKey: ['campaigns', id, 'stats'],
    queryFn: () => api.get<Stats>(`/campaigns/${id}/stats`).then((r) => r.data),
  })

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-semibold">{campaign?.name ?? 'Кампания'}</h1>
        <Button
          variant="outline"
          render={
            <a href={`/api/reports/campaigns/${id}/export.csv`} target="_blank" rel="noreferrer">
              <Download className="size-4" />
              Экспорт CSV
            </a>
          }
        />
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
        <Metric label="Получателей" value={stats?.totalTargets} />
        <Metric label="Отправлено" value={stats?.sent} />
        <Metric label="Открыто" value={stats?.opened} />
        <Metric label="Переходов" value={stats?.clicked} />
        <Metric label="Отправлено форм" value={stats?.submitted} tone="warning" />
      </div>
    </div>
  )
}

function Metric({ label, value, tone }: { label: string; value?: number; tone?: 'warning' }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className={tone === 'warning' ? 'text-3xl font-semibold text-warning' : 'text-3xl font-semibold'}>
          {value ?? 0}
        </div>
      </CardContent>
    </Card>
  )
}
