import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Plus, Server, CheckCircle2, XCircle, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { UpdateTab } from './settings/UpdateTab'
import { ReportButton } from '@/components/ReportButton'

interface SmtpConfig {
  id: string
  name: string
  host: string
  port: number
  secure: boolean
  fromAddress: string
  hasPassword: boolean
  lastTestOk: boolean | null
}

export default function SettingsPage() {
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [host, setHost] = useState('')
  const [port, setPort] = useState('587')
  const [secure, setSecure] = useState(true)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [fromAddress, setFromAddress] = useState('')

  const { data: smtps } = useQuery({
    queryKey: ['smtps'],
    queryFn: () => api.get<SmtpConfig[]>('/smtps').then((r) => r.data),
  })

  const createMutation = useMutation({
    mutationFn: () =>
      api.post('/smtps', {
        name,
        host,
        port: Number(port),
        secure,
        username: username || undefined,
        password: password || undefined,
        fromAddress,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['smtps'] })
      toast.success('SMTP-подключение добавлено')
      setOpen(false)
    },
    onError: (err: any) => toast.error(err.response?.data?.message ?? 'Не удалось сохранить'),
  })

  const testMutation = useMutation({
    mutationFn: ({ id, toAddress }: { id: string; toAddress: string }) =>
      api.post(`/smtps/${id}/test`, { toAddress }).then((r) => r.data),
    onSuccess: (result, vars) => {
      queryClient.invalidateQueries({ queryKey: ['smtps'] })
      if (result.ok) toast.success(`Тестовое письмо отправлено на ${vars.toAddress}`)
      else toast.error(`Ошибка подключения: ${result.error}`)
    },
  })

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Настройки</h1>
        <p className="text-muted-foreground">SMTP-подключения и обслуживание системы</p>
      </div>

      <Tabs defaultValue="smtp">
        <TabsList>
          <TabsTrigger value="smtp">SMTP</TabsTrigger>
          <TabsTrigger value="maintenance">Обслуживание</TabsTrigger>
          <TabsTrigger value="update">Обновление</TabsTrigger>
        </TabsList>

        <TabsContent value="smtp" className="flex flex-col gap-4">
          <div className="flex justify-end gap-2">
            <ReportButton type="smtp" label="Отчёт по SMTP" />
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger
                render={
                  <Button>
                    <Plus className="size-4" />
                    Новое подключение
                  </Button>
                }
              />
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Новое SMTP-подключение</DialogTitle>
                </DialogHeader>
                <div className="flex flex-col gap-4">
                  <Field label="Название" value={name} onChange={setName} />
                  <Field label="Хост" value={host} onChange={setHost} placeholder="smtp.example.com" />
                  <Field label="Порт" value={port} onChange={setPort} />
                  <div className="flex items-center gap-2">
                    <Switch checked={secure} onCheckedChange={setSecure} />
                    <Label>TLS/STARTTLS</Label>
                  </div>
                  <Field label="Пользователь (опционально)" value={username} onChange={setUsername} />
                  <Field label="Пароль (опционально)" value={password} onChange={setPassword} type="password" />
                  <Field
                    label="Адрес отправителя"
                    value={fromAddress}
                    onChange={setFromAddress}
                    placeholder="security-training@example.local"
                  />
                  <Button
                    onClick={() => createMutation.mutate()}
                    disabled={!name || !host || !fromAddress || createMutation.isPending}
                  >
                    {createMutation.isPending ? 'Сохранение…' : 'Сохранить'}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {smtps?.map((smtp) => (
              <Card key={smtp.id}>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Server className="size-4" />
                    {smtp.name}
                  </CardTitle>
                  {smtp.lastTestOk === true && <CheckCircle2 className="size-4 text-success" />}
                  {smtp.lastTestOk === false && <XCircle className="size-4 text-destructive" />}
                </CardHeader>
                <CardContent className="flex flex-col gap-2">
                  <p className="text-sm text-muted-foreground">
                    {smtp.host}:{smtp.port} {smtp.secure && <Badge variant="outline">TLS</Badge>}
                  </p>
                  <p className="text-sm">От: {smtp.fromAddress}</p>
                  <TestButton
                    smtpId={smtp.id}
                    onTest={(toAddress) => testMutation.mutate({ id: smtp.id, toAddress })}
                  />
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="maintenance">
          <MaintenanceTab />
        </TabsContent>

        <TabsContent value="update">
          <UpdateTab />
        </TabsContent>
      </Tabs>
    </div>
  )
}

const PURGE_TARGET_LABEL: Record<string, string> = {
  audit_logs: 'Журнал действий администраторов',
  campaign_events: 'События кампаний (открытия, переходы, отправки форм)',
}

function MaintenanceTab() {
  const [target, setTarget] = useState<'audit_logs' | 'campaign_events'>('campaign_events')
  const [olderThanDays, setOlderThanDays] = useState('90')
  const [confirmOpen, setConfirmOpen] = useState(false)

  const days = Number(olderThanDays) || 0
  const { data: preview, isFetching: previewLoading } = useQuery({
    queryKey: ['maintenance', 'purge-preview', target, days],
    queryFn: () =>
      api
        .get<{ count: number }>('/admin/maintenance/purge-preview', { params: { target, olderThanDays: days } })
        .then((r) => r.data),
    enabled: days > 0,
  })

  const purgeMutation = useMutation({
    mutationFn: () => api.delete<{ deleted: number }>('/admin/maintenance/purge', { data: { target, olderThanDays: days } }),
    onSuccess: (res) => {
      toast.success(`Удалено записей: ${res.data.deleted}`)
      setConfirmOpen(false)
    },
    onError: (err: any) => toast.error(err.response?.data?.message ?? 'Не удалось удалить записи'),
  })

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle className="text-base">Очистка старых записей журнала</CardTitle>
        <ReportButton type="audit-log" label="Отчёт по журналу" />
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <p className="text-sm text-muted-foreground">
          Удаляет записи старше указанного срока. Это ручное, по требованию, решение — полноценная настраиваемая
          политика хранения появится позже. Операция необратима.
        </p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-[1fr_auto]">
          <div className="flex flex-col gap-2">
            <Label>Что очистить</Label>
            <Select value={target} onValueChange={(v) => setTarget((v as typeof target) ?? 'campaign_events')}>
              <SelectTrigger>
                <SelectValue placeholder="Выберите">
                  {(v: string) => PURGE_TARGET_LABEL[v] ?? v}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {Object.entries(PURGE_TARGET_LABEL).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="purge-days">Старше, дней</Label>
            <Input
              id="purge-days"
              type="number"
              min={1}
              className="w-28"
              value={olderThanDays}
              onChange={(e) => setOlderThanDays(e.target.value)}
            />
          </div>
        </div>

        <p className="text-sm">
          {previewLoading
            ? 'Подсчёт…'
            : preview
              ? `Будет удалено записей: ${preview.count}`
              : 'Укажите срок, чтобы увидеть количество записей под удаление'}
        </p>

        <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
          <DialogTrigger
            render={
              <Button variant="destructive" disabled={!preview || preview.count === 0} className="w-fit">
                <Trash2 className="size-4" />
                Удалить
              </Button>
            }
          />
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Подтвердите удаление</DialogTitle>
            </DialogHeader>
            <div className="flex flex-col gap-4">
              <p className="text-sm">
                Будет безвозвратно удалено <strong>{preview?.count ?? 0}</strong> записей
                («{PURGE_TARGET_LABEL[target]}», старше {days} дней). Это действие нельзя отменить.
              </p>
              <Button variant="destructive" onClick={() => purgeMutation.mutate()} disabled={purgeMutation.isPending}>
                {purgeMutation.isPending ? 'Удаление…' : 'Да, удалить безвозвратно'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  )
}

function Field({
  label,
  value,
  onChange,
  type = 'text',
  placeholder,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  type?: string
  placeholder?: string
}) {
  return (
    <div className="flex flex-col gap-2">
      <Label>{label}</Label>
      <Input type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
    </div>
  )
}

function TestButton({ onTest }: { smtpId: string; onTest: (toAddress: string) => void }) {
  const [toAddress, setToAddress] = useState('')
  return (
    <div className="flex gap-2">
      <Input
        placeholder="test@example.local"
        value={toAddress}
        onChange={(e) => setToAddress(e.target.value)}
        className="h-8"
      />
      <Button size="sm" variant="outline" disabled={!toAddress} onClick={() => onTest(toAddress)}>
        Тест
      </Button>
    </div>
  )
}
