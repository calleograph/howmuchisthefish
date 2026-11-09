import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { Plus, Globe, RefreshCw, Trash2, Copy } from 'lucide-react'
import { toast } from 'sonner'
import { ReportButton } from '@/components/ReportButton'

interface Domain {
  id: string
  hostname: string
  verificationStatus: 'PENDING' | 'VERIFIED' | 'FAILED'
  lastCheckedAt: string | null
  lastCheckError: string | null
  createdAt: string
  _count: { pages: number }
}

interface VerificationInstructions {
  recordType: string
  recordName: string
  recordValue: string
  status: Domain['verificationStatus']
}

const STATUS_LABEL: Record<Domain['verificationStatus'], string> = {
  PENDING: 'Ожидает проверки',
  VERIFIED: 'Подтверждён',
  FAILED: 'Проверка не прошла',
}

const STATUS_VARIANT: Record<Domain['verificationStatus'], 'default' | 'secondary' | 'destructive' | 'outline'> = {
  PENDING: 'outline',
  VERIFIED: 'default',
  FAILED: 'destructive',
}

export default function DomainsPage() {
  const queryClient = useQueryClient()
  const [createOpen, setCreateOpen] = useState(false)
  const [hostname, setHostname] = useState('')
  const [detailId, setDetailId] = useState<string | null>(null)

  const { data: domains, isLoading } = useQuery({
    queryKey: ['domains'],
    queryFn: () => api.get<Domain[]>('/domains').then((r) => r.data),
  })

  const { data: tlsManaged } = useQuery({
    queryKey: ['domains', 'tls-managed'],
    queryFn: () => api.get<{ tlsManaged: boolean }>('/domains/tls-managed').then((r) => r.data.tlsManaged),
  })

  const createMutation = useMutation({
    mutationFn: () => api.post<Domain>('/domains', { hostname }),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['domains'] })
      toast.success('Домен добавлен — подтвердите владение через DNS-запись')
      setCreateOpen(false)
      setHostname('')
      setDetailId(res.data.id)
    },
    onError: (err: any) => toast.error(err.response?.data?.message ?? 'Не удалось добавить домен'),
  })

  const removeMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/domains/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['domains'] })
      toast.success('Домен удалён')
    },
    onError: (err: any) => toast.error(err.response?.data?.message ?? 'Не удалось удалить домен'),
  })

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Домены</h1>
          <p className="text-muted-foreground">
            Домены, которыми ваша организация вправе распоряжаться, для публикации учебных страниц вместо общего
            адреса системы.
            {tlsManaged === false && (
              <>
                {' '}
                HTTPS-сертификат для подтверждённого домена нужно настроить в вашем reverse-proxy самостоятельно —
                автоматический выпуск доступен только при встроенном HTTPS (Caddy).
              </>
            )}
          </p>
        </div>
        <div className="flex gap-2">
          <ReportButton type="domains" label="Отчёт по доменам" />
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger
            render={
              <Button>
                <Plus className="size-4" />
                Добавить домен
              </Button>
            }
          />
          <DialogContent className="max-w-[480px]">
            <DialogHeader>
              <DialogTitle>Новый домен</DialogTitle>
            </DialogHeader>
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <Label htmlFor="hostname">Домен</Label>
                <Input
                  id="hostname"
                  placeholder="training.example-org.com"
                  value={hostname}
                  onChange={(e) => setHostname(e.target.value)}
                />
                <p className="text-sm text-muted-foreground">
                  Без схемы и пути — только имя домена. После добавления нужно подтвердить владение TXT-записью.
                </p>
              </div>
              <Button
                onClick={() => createMutation.mutate()}
                disabled={!hostname || createMutation.isPending}
              >
                Добавить
              </Button>
            </div>
          </DialogContent>
        </Dialog>
        </div>
      </div>

      {isLoading ? (
        <p className="text-muted-foreground">Загрузка…</p>
      ) : !domains?.length ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
            <Globe className="size-10 text-muted-foreground" />
            <p className="font-medium">Доменов пока нет</p>
            <p className="max-w-md text-sm text-muted-foreground">
              Учебные страницы без собственного домена публикуются по общему адресу системы. Добавьте домен, чтобы
              использовать для кампании похожий на цель адрес.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {domains.map((d) => (
            <Card key={d.id}>
              <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
                <CardTitle className="min-w-0 truncate text-base font-medium">{d.hostname}</CardTitle>
                <Badge variant={STATUS_VARIANT[d.verificationStatus]}>{STATUS_LABEL[d.verificationStatus]}</Badge>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                <p className="text-sm text-muted-foreground">
                  {d._count.pages > 0
                    ? `Используется ${d._count.pages} учебными страницами`
                    : 'Пока не привязан ни к одной странице'}
                </p>
                {d.verificationStatus === 'FAILED' && d.lastCheckError && (
                  <p className="text-sm text-destructive">{d.lastCheckError}</p>
                )}
                <div className="mt-auto flex gap-2">
                  {d.verificationStatus !== 'VERIFIED' && (
                    <Button variant="outline" size="sm" onClick={() => setDetailId(d.id)}>
                      Настроить DNS
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="ml-auto text-destructive hover:text-destructive"
                    onClick={() => {
                      if (d._count.pages > 0) {
                        toast.error('Сначала отвяжите страницы от этого домена')
                        return
                      }
                      removeMutation.mutate(d.id)
                    }}
                    aria-label="Удалить домен"
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <VerificationDialog domainId={detailId} onClose={() => setDetailId(null)} />
    </div>
  )
}

function VerificationDialog({ domainId, onClose }: { domainId: string | null; onClose: () => void }) {
  const queryClient = useQueryClient()

  const { data: instructions } = useQuery({
    queryKey: ['domains', domainId, 'verification-instructions'],
    queryFn: () =>
      api
        .get<VerificationInstructions>(`/domains/${domainId}/verification-instructions`)
        .then((r) => r.data),
    enabled: !!domainId,
  })

  const verifyMutation = useMutation({
    mutationFn: () => api.post<Domain>(`/domains/${domainId}/verify`),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['domains'] })
      queryClient.invalidateQueries({ queryKey: ['domains', domainId, 'verification-instructions'] })
      if (res.data.verificationStatus === 'VERIFIED') {
        toast.success('Домен подтверждён')
      } else {
        toast.error(res.data.lastCheckError ?? 'TXT-запись пока не найдена')
      }
    },
    onError: (err: any) => toast.error(err.response?.data?.message ?? 'Не удалось проверить домен'),
  })

  function copy(value: string) {
    navigator.clipboard.writeText(value).then(
      () => toast.success('Скопировано'),
      () => toast.error('Не удалось скопировать'),
    )
  }

  return (
    <Dialog open={!!domainId} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-[560px]">
        <DialogHeader>
          <DialogTitle>Подтверждение владения доменом</DialogTitle>
        </DialogHeader>
        {instructions && (
          <div className="flex flex-col gap-4">
            <p className="text-sm text-muted-foreground">
              Опубликуйте в DNS-зоне домена следующую TXT-запись, затем нажмите «Проверить». Обновление DNS может
              занять некоторое время.
            </p>
            <div className="flex flex-col gap-2 rounded-lg border bg-muted/30 p-3 text-sm">
              <Field label="Тип" value={instructions.recordType} />
              <Field label="Имя" value={instructions.recordName} onCopy={() => copy(instructions.recordName)} />
              <Field label="Значение" value={instructions.recordValue} onCopy={() => copy(instructions.recordValue)} />
            </div>
            <Button onClick={() => verifyMutation.mutate()} disabled={verifyMutation.isPending}>
              <RefreshCw className="size-4" />
              {verifyMutation.isPending ? 'Проверка…' : 'Проверить'}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

function Field({ label, value, onCopy }: { label: string; value: string; onCopy?: () => void }) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-16 shrink-0 text-muted-foreground">{label}</span>
      <code className="min-w-0 flex-1 truncate rounded bg-background px-2 py-1">{value}</code>
      {onCopy && (
        <Button variant="ghost" size="icon-sm" onClick={onCopy} aria-label={`Скопировать ${label}`}>
          <Copy className="size-3.5" />
        </Button>
      )}
    </div>
  )
}
