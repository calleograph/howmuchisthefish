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
  reportedPhishing: number
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

  const total = stats?.totalTargets ?? 0

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-semibold">{campaign?.name ?? 'Кампания'}</h1>
        <div className="flex gap-2">
          <Button
            variant="outline"
            render={
              <a href={`/api/reports/campaigns/${id}/export-users.csv`} target="_blank" rel="noreferrer">
                <Download className="size-4" />
                Сводка по сотрудникам
              </a>
            }
          />
          <Button
            variant="outline"
            render={
              <a href={`/api/reports/campaigns/${id}/export.csv`} target="_blank" rel="noreferrer">
                <Download className="size-4" />
                Журнал событий
              </a>
            }
          />
        </div>
      </div>

      {/* grid-cols-3 вместо -5: 6 карточек делятся без остатка (2 ровных
          ряда), на -5 шестая карточка вставала одна в новой строке. */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <RingMetric label="Получателей" value={stats?.totalTargets} plain />
        <RingMetric label="Отправлено" value={stats?.sent} total={total} />
        <RingMetric label="Открыто" value={stats?.opened} total={total} />
        <RingMetric label="Переходов" value={stats?.clicked} total={total} />
        <RingMetric label="Отправлено форм" value={stats?.submitted} total={total} tone="warning" />
        {/* Положительная метрика — чем выше, тем лучше, отдельный акцент
            зелёным кольцом среди остальных "негативных" показателей. */}
        <RingMetric label="Сообщили о фишинге" value={stats?.reportedPhishing} total={total} tone="success" />
      </div>
    </div>
  )
}

const TONE_STROKE: Record<'default' | 'warning' | 'success', string> = {
  default: 'var(--color-primary)',
  warning: 'var(--color-warning)',
  success: 'var(--color-success)',
}

function RingMetric({
  label,
  value,
  total,
  tone = 'default',
  plain = false,
}: {
  label: string
  value?: number
  total?: number
  tone?: 'default' | 'warning' | 'success'
  plain?: boolean
}) {
  const v = value ?? 0
  // Клики/отправки форм могут превышать totalTargets (один человек может
  // открыть письмо или отправить форму несколько раз) — pct здесь означает
  // "долю получателей, совершивших действие", не "долю событий", поэтому
  // ограничиваем 100%, иначе кольцо получает отрицательный strokeDashoffset.
  const pct = total && total > 0 ? Math.min(100, Math.round((v / total) * 100)) : 0
  const radius = 28
  const circumference = 2 * Math.PI * radius
  const offset = circumference * (1 - pct / 100)

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
      </CardHeader>
      <CardContent className="flex items-center gap-4">
        {plain ? (
          <div className="text-3xl font-semibold">{v}</div>
        ) : (
          <>
            <svg width="64" height="64" viewBox="0 0 64 64" className="shrink-0 -rotate-90">
              <circle cx="32" cy="32" r={radius} fill="none" strokeWidth="6" className="stroke-muted" />
              <circle
                cx="32"
                cy="32"
                r={radius}
                fill="none"
                strokeWidth="6"
                strokeLinecap="round"
                stroke={TONE_STROKE[tone]}
                strokeDasharray={circumference}
                strokeDashoffset={offset}
              />
              <text
                x="32"
                y="32"
                textAnchor="middle"
                dominantBaseline="central"
                className="rotate-90 fill-foreground text-[13px] font-semibold"
                style={{ transformOrigin: '32px 32px' }}
              >
                {pct}%
              </text>
            </svg>
            <div className="text-2xl font-semibold">{v}</div>
          </>
        )}
      </CardContent>
    </Card>
  )
}
