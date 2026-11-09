import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Plus, Play, Pause, Square } from 'lucide-react'
import { toast } from 'sonner'
import { Link } from 'react-router-dom'

type TargetMode = 'group' | 'segment' | 'random'
const SEGMENT_CONDITION_LABEL: Record<string, string> = {
  EMAIL_OPENED: 'открыли письмо',
  LINK_CLICKED: 'перешли по ссылке',
  FORM_SUBMITTED: 'отправили форму',
  NOT_OPENED: 'не открыли письмо',
}

interface Campaign {
  id: string
  name: string
  status: 'DRAFT' | 'SCHEDULED' | 'RUNNING' | 'PAUSED' | 'FINISHED' | 'FAILED'
  _count: { targets: number; events: number }
}

const STATUS_LABEL: Record<Campaign['status'], string> = {
  DRAFT: 'Черновик',
  SCHEDULED: 'Запланирована',
  RUNNING: 'Выполняется',
  PAUSED: 'Приостановлена',
  FINISHED: 'Завершена',
  FAILED: 'Сбой',
}

const STATUS_VARIANT: Record<Campaign['status'], 'default' | 'secondary' | 'destructive' | 'outline'> = {
  DRAFT: 'outline',
  SCHEDULED: 'secondary',
  RUNNING: 'default',
  PAUSED: 'secondary',
  FINISHED: 'secondary',
  FAILED: 'destructive',
}

export default function CampaignsPage() {
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [templateId, setTemplateId] = useState('')
  const [pageId, setPageId] = useState('')
  const [smtpConfigId, setSmtpConfigId] = useState('')

  const [targetMode, setTargetMode] = useState<TargetMode>('group')
  const [groupId, setGroupId] = useState('')
  const [segmentCampaignId, setSegmentCampaignId] = useState('')
  const [segmentCondition, setSegmentCondition] = useState('LINK_CLICKED')
  const [randomCount, setRandomCount] = useState('10')
  const [randomGroupId, setRandomGroupId] = useState('')

  // Растянутая отправка: сколько писем в минуту уходит из очереди — явный
  // контрол поверх уже существующего sendRateLimit/pg-boss startAfter,
  // вместо недокументированного дефолта (найдено как UX-пробел у донора).
  const [sendRateLimit, setSendRateLimit] = useState('10')

  const { data: campaigns, isLoading } = useQuery({
    queryKey: ['campaigns'],
    queryFn: () => api.get<Campaign[]>('/campaigns').then((r) => r.data),
  })
  const { data: templates } = useQuery({
    queryKey: ['templates'],
    queryFn: () => api.get<{ id: string; name: string }[]>('/templates').then((r) => r.data),
  })
  const { data: pages } = useQuery({
    queryKey: ['pages'],
    queryFn: () => api.get<{ id: string; name: string }[]>('/pages').then((r) => r.data),
  })
  const { data: smtps } = useQuery({
    queryKey: ['smtps'],
    queryFn: () => api.get<{ id: string; name: string }[]>('/smtps').then((r) => r.data),
  })
  const { data: groups } = useQuery({
    queryKey: ['groups'],
    queryFn: () => api.get<{ id: string; name: string }[]>('/groups').then((r) => r.data),
  })

  const createMutation = useMutation({
    mutationFn: () =>
      api.post('/campaigns', {
        name,
        templateId,
        pageId,
        smtpConfigId,
        sendRateLimit: sendRateLimit ? Number(sendRateLimit) : undefined,
        groupIds: targetMode === 'group' && groupId ? [groupId] : undefined,
        segment:
          targetMode === 'segment' && segmentCampaignId
            ? { sourceCampaignId: segmentCampaignId, condition: segmentCondition }
            : undefined,
        random:
          targetMode === 'random' && randomCount
            ? { count: Number(randomCount), groupId: randomGroupId || undefined }
            : undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['campaigns'] })
      toast.success('Кампания создана')
      setOpen(false)
      setName('')
    },
    onError: (err: any) => toast.error(err.response?.data?.message ?? 'Не удалось создать кампанию'),
  })

  const actionMutation = useMutation({
    mutationFn: ({ id, action }: { id: string; action: string }) => api.post(`/campaigns/${id}/${action}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['campaigns'] })
      toast.success('Статус кампании обновлён')
    },
    onError: (err: any) => toast.error(err.response?.data?.message ?? 'Действие недопустимо'),
  })

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Кампании</h1>
          <p className="text-muted-foreground">Учебные фишинговые рассылки</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger
            render={
              <Button>
                <Plus className="size-4" />
                Новая кампания
              </Button>
            }
          />
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Новая кампания</DialogTitle>
            </DialogHeader>
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <Label>Название</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <SelectField label="Почтовый шаблон" value={templateId} onChange={setTemplateId} options={templates} />
              <SelectField label="Учебная страница" value={pageId} onChange={setPageId} options={pages} />
              <SelectField label="SMTP-подключение" value={smtpConfigId} onChange={setSmtpConfigId} options={smtps} />

              <div className="flex flex-col gap-2">
                <Label>Получатели</Label>
                <Tabs value={targetMode} onValueChange={(v) => setTargetMode((v as TargetMode) ?? 'group')}>
                  <TabsList>
                    <TabsTrigger value="group">Группа</TabsTrigger>
                    <TabsTrigger value="segment">По результатам кампании</TabsTrigger>
                    <TabsTrigger value="random">Случайная выборка</TabsTrigger>
                  </TabsList>
                  <TabsContent value="group" className="pt-3">
                    <SelectField label="Группа получателей" value={groupId} onChange={setGroupId} options={groups} />
                  </TabsContent>
                  <TabsContent value="segment" className="flex flex-col gap-4 pt-3">
                    <p className="text-sm text-muted-foreground">
                      Таргетинг по результатам прошлой кампании — например, повторное обучение тех, кто кликнул по
                      ссылке в кампании X.
                    </p>
                    <SelectField
                      label="Кампания-источник"
                      value={segmentCampaignId}
                      onChange={setSegmentCampaignId}
                      options={campaigns}
                    />
                    <div className="flex flex-col gap-2">
                      <Label>Условие</Label>
                      <Select value={segmentCondition} onValueChange={(v) => setSegmentCondition(v ?? 'LINK_CLICKED')}>
                        <SelectTrigger>
                          <SelectValue placeholder="Условие">
                            {(v: string) => SEGMENT_CONDITION_LABEL[v] ?? v}
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          {Object.entries(SEGMENT_CONDITION_LABEL).map(([value, text]) => (
                            <SelectItem key={value} value={value}>
                              {text}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </TabsContent>
                  <TabsContent value="random" className="flex flex-col gap-4 pt-3">
                    <p className="text-sm text-muted-foreground">
                      Безопасный пилотный запуск шаблона на небольшой случайной подвыборке перед рассылкой всей
                      компании.
                    </p>
                    <div className="flex flex-col gap-2">
                      <Label htmlFor="random-count">Количество сотрудников</Label>
                      <Input
                        id="random-count"
                        type="number"
                        min={1}
                        value={randomCount}
                        onChange={(e) => setRandomCount(e.target.value)}
                      />
                    </div>
                    <SelectField
                      label="Ограничить группой (опционально)"
                      value={randomGroupId}
                      onChange={setRandomGroupId}
                      options={groups}
                    />
                  </TabsContent>
                </Tabs>
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor="send-rate">Скорость отправки (писем в минуту)</Label>
                <Input
                  id="send-rate"
                  type="number"
                  min={1}
                  value={sendRateLimit}
                  onChange={(e) => setSendRateLimit(e.target.value)}
                />
                <p className="text-sm text-muted-foreground">
                  Письма рассылаются равномерно с этой скоростью, не все разом — так SMTP-релей не получает всплеск
                  нагрузки.
                </p>
              </div>

              <Button
                onClick={() => createMutation.mutate()}
                disabled={!name || !templateId || !pageId || !smtpConfigId || createMutation.isPending}
              >
                {createMutation.isPending ? 'Сохранение…' : 'Создать кампанию'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <Card className="overflow-visible">
        <Table className="min-w-[640px]">
          <TableHeader>
            <TableRow>
              <TableHead>Название</TableHead>
              <TableHead>Статус</TableHead>
              <TableHead>Получателей</TableHead>
              <TableHead className="text-right">Действия</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-muted-foreground">
                  Загрузка…
                </TableCell>
              </TableRow>
            )}
            {campaigns?.map((c) => (
              <TableRow key={c.id}>
                <TableCell>
                  <Link to={`/campaigns/${c.id}`} className="font-medium hover:underline">
                    {c.name}
                  </Link>
                </TableCell>
                <TableCell>
                  <Badge variant={STATUS_VARIANT[c.status]}>{STATUS_LABEL[c.status]}</Badge>
                </TableCell>
                <TableCell>{c._count.targets}</TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1">
                    {c.status === 'DRAFT' && (
                      <Button
                        variant="outline"
                        className="min-h-[44px]"
                        onClick={() => actionMutation.mutate({ id: c.id, action: 'start' })}
                      >
                        <Play className="size-3.5" />
                        Запустить
                      </Button>
                    )}
                    {c.status === 'RUNNING' && (
                      <>
                        <Button
                          variant="outline"
                          className="min-h-[44px]"
                          onClick={() => actionMutation.mutate({ id: c.id, action: 'pause' })}
                        >
                          <Pause className="size-3.5" />
                        </Button>
                        <Button
                          variant="outline"
                          className="min-h-[44px]"
                          onClick={() => actionMutation.mutate({ id: c.id, action: 'finish' })}
                        >
                          <Square className="size-3.5" />
                          Завершить
                        </Button>
                      </>
                    )}
                    {c.status === 'PAUSED' && (
                      <Button
                        variant="outline"
                        className="min-h-[44px]"
                        onClick={() => actionMutation.mutate({ id: c.id, action: 'resume' })}
                      >
                        <Play className="size-3.5" />
                        Продолжить
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  )
}

function SelectField({
  label,
  value,
  onChange,
  options,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  options?: { id: string; name: string }[]
}) {
  return (
    <div className="flex flex-col gap-2">
      <Label>{label}</Label>
      <Select value={value} onValueChange={(v) => onChange(v ?? '')}>
        <SelectTrigger>
          {/* base-ui Select.Value по умолчанию рендерит сам value (id), не label —
              без этой функции-форматера в триггере показывался сырой UUID вместо
              человекочитаемого названия. */}
          <SelectValue placeholder="Выберите…">
            {(v: string) => options?.find((o) => o.id === v)?.name ?? 'Выберите…'}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {options?.map((o) => (
            <SelectItem key={o.id} value={o.id}>
              {o.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
