import { useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useMutation, useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import {
  CheckCircle2,
  XCircle,
  ArrowLeft,
  Eye,
  EyeOff,
  Globe,
  Monitor,
} from 'lucide-react'
import { toast } from 'sonner'

type ActionType = 'EMAIL_SENT' | 'EMAIL_OPENED' | 'LINK_CLICKED' | 'FORM_SUBMITTED' | 'REPORTED_PHISHING'

interface Action {
  type: ActionType
  occurred: boolean
  at: string | null
  ipAddress: string | null
  userAgent: string | null
  isSuspiciousAutomated: boolean | null
}

interface CapturedVariant {
  fieldName: string
  valueHash: string
  firstSeenAt: string
  credentialId: string
}

interface CampaignHistory {
  campaignId: string
  campaignName: string
  campaignStatus: string
  actions: Action[]
  capturedVariants: CapturedVariant[]
}

interface EmployeeDetail {
  employeeId: string
  email: string
  fullName: string
  department: string | null
  position: string | null
  groups: string[]
  campaigns: CampaignHistory[]
}

const ACTION_LABEL: Record<ActionType, string> = {
  EMAIL_SENT: 'Письмо отправлено',
  EMAIL_OPENED: 'Письмо открыто',
  LINK_CLICKED: 'Переход по ссылке',
  FORM_SUBMITTED: 'Форма отправлена',
  REPORTED_PHISHING: 'Сообщил о фишинге',
}

export default function EmployeeDetailPage() {
  const { id } = useParams<{ id: string }>()

  const { data, isLoading } = useQuery({
    queryKey: ['employees', id, 'detail'],
    queryFn: () => api.get<EmployeeDetail>(`/reports/employees/${id}/detail`).then((r) => r.data),
    enabled: !!id,
  })

  return (
    <div className="flex flex-col gap-6">
      <div>
        {/* -mx-2 компенсирует px-2, чтобы текст остался на исходном месте,
            а тап-зона выросла до стандартных 44px (было 20px по высоте). */}
        <Link
          to="/employees"
          className="-mx-2 mb-2 inline-flex min-h-11 items-center gap-1 px-2 text-sm text-muted-foreground hover:underline"
        >
          <ArrowLeft className="size-3.5" />
          Назад к сотрудникам
        </Link>
        {isLoading ? (
          <Skeleton className="h-8 w-64" />
        ) : (
          <>
            <h1 className="text-2xl font-semibold">{data?.fullName}</h1>
            <p className="text-muted-foreground">
              {data?.email}
              {data?.department ? ` · ${data.department}` : ''}
              {data?.position ? ` · ${data.position}` : ''}
            </p>
            {data && data.groups.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1">
                {data.groups.map((g) => (
                  <Badge key={g} variant="secondary">
                    {g}
                  </Badge>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {isLoading && <Skeleton className="h-64 w-full" />}
      {!isLoading && data?.campaigns.length === 0 && (
        <p className="text-muted-foreground">Этот сотрудник ещё не участвовал в кампаниях.</p>
      )}
      {data?.campaigns.map((campaign) => (
        <CampaignHistoryCard key={campaign.campaignId} campaign={campaign} />
      ))}
    </div>
  )
}

function CampaignHistoryCard({ campaign }: { campaign: CampaignHistory }) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">
            <Link to={`/campaigns/${campaign.campaignId}`} className="hover:underline">
              {campaign.campaignName}
            </Link>
          </CardTitle>
          <Badge variant="outline">{campaign.campaignStatus}</Badge>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex flex-col divide-y">
          {campaign.actions.map((action) => (
            <ActionRow key={action.type} action={action} />
          ))}
        </div>

        {campaign.capturedVariants.length > 0 && (
          <div className="mt-2 rounded-lg border border-warning/40 bg-warning/5 p-3">
            <div className="mb-2 text-sm font-medium">
              Введено уникальных вариантов: {campaign.capturedVariants.length}
            </div>
            <div className="flex flex-col gap-2">
              {campaign.capturedVariants.map((variant) => (
                <CredentialRevealRow
                  key={variant.valueHash}
                  campaignId={campaign.campaignId}
                  variant={variant}
                />
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function ActionRow({ action }: { action: Action }) {
  return (
    <div className="flex flex-col gap-1 py-2 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-2">
        {action.occurred ? (
          <CheckCircle2 className="size-4 shrink-0 text-success" />
        ) : (
          <XCircle className="size-4 shrink-0 text-muted-foreground" />
        )}
        <span className={action.occurred ? 'font-medium' : 'text-muted-foreground'}>
          {ACTION_LABEL[action.type]}
        </span>
        {action.isSuspiciousAutomated && (
          <Badge variant="outline" className="text-xs">
            похоже на сканер
          </Badge>
        )}
      </div>
      {action.occurred && (
        <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
          <span>{new Date(action.at!).toLocaleString('ru-RU')}</span>
          {action.ipAddress && (
            <span className="flex items-center gap-1">
              <Globe className="size-3.5" />
              {action.ipAddress}
            </span>
          )}
          {action.userAgent && (
            <span className="flex max-w-[280px] items-center gap-1 truncate" title={action.userAgent}>
              <Monitor className="size-3.5 shrink-0" />
              {action.userAgent}
            </span>
          )}
        </div>
      )}
    </div>
  )
}

function CredentialRevealRow({ campaignId, variant }: { campaignId: string; variant: CapturedVariant }) {
  const [revealed, setRevealed] = useState<string | null>(null)

  const revealMutation = useMutation({
    mutationFn: () =>
      api
        .get<{ fieldName: string; value: string }>(`/campaigns/${campaignId}/events/credentials/${variant.credentialId}`)
        .then((r) => r.data),
    onSuccess: (result) => setRevealed(result.value),
    onError: (err: any) => toast.error(err.response?.data?.message ?? 'Не удалось расшифровать значение'),
  })

  return (
    <div className="flex items-center justify-between gap-2 rounded-md bg-background px-3 py-2 text-sm">
      <div className="flex items-center gap-2">
        <span className="text-muted-foreground">{variant.fieldName}:</span>
        {revealed !== null ? (
          <code className="rounded bg-muted px-1.5 py-0.5">{revealed}</code>
        ) : (
          <span className="text-muted-foreground">••••••••</span>
        )}
      </div>
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground">
          {new Date(variant.firstSeenAt).toLocaleString('ru-RU')}
        </span>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => (revealed !== null ? setRevealed(null) : revealMutation.mutate())}
          disabled={revealMutation.isPending}
        >
          {revealed !== null ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
          {revealed !== null ? 'Скрыть' : 'Показать'}
        </Button>
      </div>
    </div>
  )
}
