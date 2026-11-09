import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ArrowLeft, ArrowRight, Check } from 'lucide-react'
import { toast } from 'sonner'

type TargetMode = 'group' | 'segment' | 'random'
const SEGMENT_CONDITION_LABEL: Record<string, string> = {
  EMAIL_OPENED: 'открыли письмо',
  LINK_CLICKED: 'перешли по ссылке',
  FORM_SUBMITTED: 'отправили форму',
  NOT_OPENED: 'не открыли письмо',
}

interface NamedOption {
  id: string
  name: string
}

const STEPS = [
  { key: 'basics', label: 'Основная информация' },
  { key: 'recipients', label: 'Получатели' },
  { key: 'template', label: 'Почтовый шаблон' },
  { key: 'page', label: 'Учебная страница' },
  { key: 'smtp', label: 'SMTP-подключение' },
  { key: 'schedule', label: 'Расписание' },
  { key: 'review', label: 'Проверка и запуск' },
] as const

/**
 * Полноэкранный мастер создания кампании — заменяет узкий модальный диалог
 * (задание §6: "вместо маленького сжатого окна сделай полноценный мастер
 * создания кампании", пошаговая навигация, отдельная страница шириной
 * 1000-1200px). Домен не отдельный шаг — он выбирается при редактировании
 * самой учебной страницы (PageEditorPage.tsx), здесь только отображается
 * как часть сводки на шаге "Учебная страница" для прозрачности.
 */
export default function CampaignWizardPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [stepIndex, setStepIndex] = useState(0)

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
  const [sendRateLimit, setSendRateLimit] = useState('10')
  const [scheduledAt, setScheduledAt] = useState('')

  const { data: campaigns } = useQuery({
    queryKey: ['campaigns'],
    queryFn: () => api.get<{ id: string; name: string }[]>('/campaigns').then((r) => r.data),
  })
  const { data: templates } = useQuery({
    queryKey: ['templates'],
    queryFn: () => api.get<NamedOption[]>('/templates').then((r) => r.data),
  })
  const { data: pages } = useQuery({
    queryKey: ['pages'],
    queryFn: () =>
      api.get<(NamedOption & { slug: string; domainId: string | null })[]>('/pages').then((r) => r.data),
  })
  const { data: smtps } = useQuery({
    queryKey: ['smtps'],
    queryFn: () => api.get<NamedOption[]>('/smtps').then((r) => r.data),
  })
  const { data: groups } = useQuery({
    queryKey: ['groups'],
    queryFn: () => api.get<NamedOption[]>('/groups').then((r) => r.data),
  })
  const { data: domains } = useQuery({
    queryKey: ['domains'],
    queryFn: () => api.get<{ id: string; hostname: string }[]>('/domains').then((r) => r.data),
  })

  const selectedPage = pages?.find((p) => p.id === pageId)
  const selectedPageDomain = selectedPage?.domainId
    ? domains?.find((d) => d.id === selectedPage.domainId)
    : null

  const createMutation = useMutation({
    mutationFn: async () => {
      const res = await api.post<{ id: string }>('/campaigns', {
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
      })
      if (scheduledAt) {
        await api.post(`/campaigns/${res.data.id}/schedule`, {
          scheduledAt: new Date(scheduledAt).toISOString(),
        })
      }
      return res.data
    },
    onSuccess: (campaign) => {
      queryClient.invalidateQueries({ queryKey: ['campaigns'] })
      toast.success(scheduledAt ? 'Кампания создана и запланирована' : 'Кампания создана')
      navigate(`/campaigns/${campaign.id}`)
    },
    onError: (err: any) => toast.error(err.response?.data?.message ?? 'Не удалось создать кампанию'),
  })

  const step = STEPS[stepIndex]
  const canLeaveBasics = !!name
  const canLeaveRecipients =
    (targetMode === 'group' && !!groupId) ||
    (targetMode === 'segment' && !!segmentCampaignId) ||
    (targetMode === 'random' && !!randomCount)
  const canLeaveTemplate = !!templateId
  const canLeavePage = !!pageId
  const canLeaveSmtp = !!smtpConfigId
  const stepValid: Record<(typeof STEPS)[number]['key'], boolean> = {
    basics: canLeaveBasics,
    recipients: canLeaveRecipients,
    template: canLeaveTemplate,
    page: canLeavePage,
    smtp: canLeaveSmtp,
    schedule: true,
    review: true,
  }

  function goNext() {
    if (!stepValid[step.key]) {
      toast.error('Заполните обязательные поля перед продолжением')
      return
    }
    setStepIndex((i) => Math.min(i + 1, STEPS.length - 1))
  }
  function goBack() {
    if (stepIndex === 0) {
      navigate('/campaigns')
      return
    }
    setStepIndex((i) => i - 1)
  }

  return (
    <div className="mx-auto flex max-w-[1100px] flex-col gap-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate('/campaigns')} aria-label="Назад к кампаниям">
          <ArrowLeft className="size-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-semibold">Новая кампания</h1>
          <p className="text-muted-foreground">
            Шаг {stepIndex + 1} из {STEPS.length}: {step.label}
          </p>
        </div>
      </div>

      {/* Индикатор шагов — кликабельны только уже пройденные, чтобы нельзя
          было перепрыгнуть вперёд мимо обязательных полей. */}
      <div className="flex flex-wrap gap-2">
        {STEPS.map((s, i) => (
          <button
            key={s.key}
            type="button"
            disabled={i > stepIndex}
            onClick={() => i <= stepIndex && setStepIndex(i)}
            className={`flex min-h-[44px] items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${
              i === stepIndex
                ? 'border-primary bg-primary text-primary-foreground'
                : i < stepIndex
                  ? 'border-success/40 bg-success/10 text-success cursor-pointer'
                  : 'border-border text-muted-foreground cursor-not-allowed opacity-50'
            }`}
          >
            {i < stepIndex ? <Check className="size-3.5" /> : <span>{i + 1}</span>}
            {s.label}
          </button>
        ))}
      </div>

      <Card>
        <CardContent className="flex flex-col gap-4 py-6">
          {step.key === 'basics' && (
            <div className="flex flex-col gap-2">
              <Label htmlFor="wiz-name">Название кампании</Label>
              <Input
                id="wiz-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Например: Проверка парольной политики — ноябрь 2026"
              />
            </div>
          )}

          {step.key === 'recipients' && (
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
          )}

          {step.key === 'template' && (
            <SelectField label="Почтовый шаблон" value={templateId} onChange={setTemplateId} options={templates} />
          )}

          {step.key === 'page' && (
            <div className="flex flex-col gap-3">
              <SelectField label="Учебная страница" value={pageId} onChange={setPageId} options={pages} />
              {selectedPage && (
                <p className="text-sm text-muted-foreground">
                  Адрес: <code>/lp/{selectedPage.slug}</code>
                  {selectedPageDomain ? ` — на домене ${selectedPageDomain.hostname}` : ' — на общем адресе системы'}
                </p>
              )}
            </div>
          )}

          {step.key === 'smtp' && (
            <div className="flex flex-col gap-4">
              <SelectField label="SMTP-подключение" value={smtpConfigId} onChange={setSmtpConfigId} options={smtps} />
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
            </div>
          )}

          {step.key === 'schedule' && (
            <div className="flex flex-col gap-2">
              <Label htmlFor="scheduled-at">Запланировать запуск на (необязательно)</Label>
              <Input
                id="scheduled-at"
                type="datetime-local"
                value={scheduledAt}
                onChange={(e) => setScheduledAt(e.target.value)}
              />
              <p className="text-sm text-muted-foreground">
                Оставьте пустым, чтобы сохранить кампанию как черновик и запустить её вручную позже.
              </p>
            </div>
          )}

          {step.key === 'review' && (
            <div className="flex flex-col gap-3 text-sm">
              <SummaryRow label="Название" value={name} />
              <SummaryRow
                label="Получатели"
                value={
                  targetMode === 'group'
                    ? `Группа: ${groups?.find((g) => g.id === groupId)?.name ?? '—'}`
                    : targetMode === 'segment'
                      ? `Сегмент кампании «${campaigns?.find((c) => c.id === segmentCampaignId)?.name ?? '—'}» — ${SEGMENT_CONDITION_LABEL[segmentCondition]}`
                      : `Случайная выборка: ${randomCount} чел.${randomGroupId ? ` из группы ${groups?.find((g) => g.id === randomGroupId)?.name}` : ''}`
                }
              />
              <SummaryRow label="Почтовый шаблон" value={templates?.find((t) => t.id === templateId)?.name ?? '—'} />
              <SummaryRow
                label="Учебная страница"
                value={`${selectedPage?.name ?? '—'} (/lp/${selectedPage?.slug ?? ''}${selectedPageDomain ? `, домен ${selectedPageDomain.hostname}` : ''})`}
              />
              <SummaryRow label="SMTP" value={smtps?.find((s) => s.id === smtpConfigId)?.name ?? '—'} />
              <SummaryRow label="Скорость отправки" value={`${sendRateLimit} писем/мин`} />
              <SummaryRow
                label="Расписание"
                value={scheduledAt ? new Date(scheduledAt).toLocaleString('ru-RU') : 'Черновик — запуск вручную'}
              />
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex justify-between">
        <Button variant="outline" onClick={goBack}>
          <ArrowLeft className="size-4" />
          {stepIndex === 0 ? 'Отмена' : 'Назад'}
        </Button>
        {step.key === 'review' ? (
          <Button onClick={() => createMutation.mutate()} disabled={createMutation.isPending}>
            {createMutation.isPending ? 'Создание…' : 'Создать кампанию'}
          </Button>
        ) : (
          <Button onClick={goNext}>
            Далее
            <ArrowRight className="size-4" />
          </Button>
        )}
      </div>
    </div>
  )
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 border-b py-2 last:border-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium">{value}</span>
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
