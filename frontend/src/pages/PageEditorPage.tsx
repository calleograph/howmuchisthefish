import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  ArrowLeft,
  Globe,
  Monitor,
  Save,
  ShieldAlert,
  Smartphone,
} from 'lucide-react'
import { toast } from 'sonner'

interface LandingPage {
  id: string
  name: string
  slug: string
  htmlSource: string
  formEnabled: boolean
  capturesCredentials: boolean
  sourceUrl: string | null
  domainId: string | null
}

interface Domain {
  id: string
  hostname: string
  verificationStatus: 'PENDING' | 'VERIFIED' | 'FAILED'
}

const DEFAULT_HTML = `<!doctype html>
<html>
  <body>
    <h1>Заголовок учебной страницы</h1>
    <form>
      <input name="login" type="text" placeholder="Логин">
      <input name="password" type="password" placeholder="Пароль">
      <button type="submit">Отправить</button>
    </form>
    <div id="sap-thank-you" hidden>Спасибо, это было учебное упражнение по информационной безопасности.</div>
  </body>
</html>`

/**
 * Полноэкранный редактор учебной страницы — заменяет прежний узкий (640px)
 * модальный диалог (найдено скриншотами пользователя как критичная UX-
 * проблема: HTML-textarea в 240px высотой без полноценного предпросмотра).
 * Визуальный WYSIWYG-режим НЕ входит в эту итерацию — отдельная крупная
 * задача, см. docs/FUNCTIONAL_GAP_MATRIX.md §3. Черновики/версии/
 * дублирование/архивирование тоже отложены — тот же §3, следующий шаг.
 */
export default function PageEditorPage() {
  const { id } = useParams<{ id: string }>()
  const isNew = !id
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [htmlSource, setHtmlSource] = useState(DEFAULT_HTML)
  const [formEnabled, setFormEnabled] = useState(true)
  const [capturesCredentials, setCapturesCredentials] = useState(false)
  const [domainId, setDomainId] = useState<string>('')
  const [sourceUrl, setSourceUrl] = useState<string | null>(null)
  const [previewWidth, setPreviewWidth] = useState<'desktop' | 'mobile'>('desktop')
  const [cloneOpen, setCloneOpen] = useState(false)
  const [cloneUrl, setCloneUrl] = useState('')

  const { data: existing } = useQuery({
    queryKey: ['pages', id],
    queryFn: () => api.get<LandingPage>(`/pages/${id}`).then((r) => r.data),
    enabled: !isNew,
  })

  // Инициализация формы из загруженных данных — только один раз, чтобы не
  // затирать правки пользователя при фоновом refetch react-query.
  useEffect(() => {
    if (!existing) return
    setName(existing.name)
    setSlug(existing.slug)
    setHtmlSource(existing.htmlSource)
    setFormEnabled(existing.formEnabled)
    setCapturesCredentials(existing.capturesCredentials)
    setDomainId(existing.domainId ?? '')
    setSourceUrl(existing.sourceUrl)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [existing?.id])

  const { data: domains } = useQuery({
    queryKey: ['domains'],
    queryFn: () => api.get<Domain[]>('/domains').then((r) => r.data),
  })
  const verifiedDomains = domains?.filter((d) => d.verificationStatus === 'VERIFIED') ?? []

  const cloneMutation = useMutation({
    mutationFn: () =>
      api
        .post<{ htmlSource: string; sourceUrl: string }>('/pages/clone-preview', { url: cloneUrl })
        .then((r) => r.data),
    onSuccess: (result) => {
      setHtmlSource(result.htmlSource)
      setSourceUrl(result.sourceUrl)
      setCloneOpen(false)
      setCloneUrl('')
      toast.success('Страница загружена — проверьте разметку и сохраните')
    },
    onError: (err: any) => toast.error(err.response?.data?.message ?? 'Не удалось загрузить страницу'),
  })

  const body = {
    name,
    slug,
    htmlSource,
    formEnabled,
    capturesCredentials,
    sourceUrl: sourceUrl || undefined,
    domainId: domainId || undefined,
  }

  const saveMutation = useMutation({
    mutationFn: () =>
      isNew ? api.post<LandingPage>('/pages', body) : api.patch<LandingPage>(`/pages/${id}`, body),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['pages'] })
      toast.success(isNew ? 'Страница создана' : 'Изменения сохранены')
      if (isNew) navigate(`/pages/${res.data.id}/edit`, { replace: true })
    },
    onError: (err: any) => toast.error(err.response?.data?.message ?? 'Не удалось сохранить страницу'),
  })

  return (
    <div className="flex min-h-0 flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate('/pages')} aria-label="Назад к страницам">
            <ArrowLeft className="size-4" />
          </Button>
          <div className="min-w-0">
            <h1 className="truncate text-xl font-semibold">{isNew ? 'Новая учебная страница' : name || 'Учебная страница'}</h1>
            {!isNew && <code className="text-sm text-muted-foreground">/lp/{slug}</code>}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Dialog open={cloneOpen} onOpenChange={setCloneOpen}>
            <DialogTrigger render={<Button variant="outline"><Globe className="size-4" />Клонировать по адресу</Button>} />
            <DialogContent className="max-w-[480px]">
              <DialogHeader>
                <DialogTitle>Клонировать страницу по адресу</DialogTitle>
              </DialogHeader>
              <div className="flex flex-col gap-3">
                <p className="text-sm text-muted-foreground">
                  Загружает страницу через headless-браузер (работает и для SPA/JS-форм), переписывает форму на
                  безопасную отправку. Ресурсы (CSS/JS/картинки) продолжают подгружаться с исходного сайта — пока он
                  доступен.
                </p>
                <Input
                  placeholder="https://example.com/login"
                  value={cloneUrl}
                  onChange={(e) => setCloneUrl(e.target.value)}
                />
                <Button onClick={() => cloneMutation.mutate()} disabled={!cloneUrl || cloneMutation.isPending}>
                  {cloneMutation.isPending ? 'Загрузка…' : 'Загрузить'}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
          <Button
            onClick={() => saveMutation.mutate()}
            disabled={!name || !slug || saveMutation.isPending}
          >
            <Save className="size-4" />
            {saveMutation.isPending ? 'Сохранение…' : 'Сохранить'}
          </Button>
        </div>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 lg:grid-cols-[320px_1fr]">
        {/* Настройки — слева на десктопе, сверху на узких экранах. */}
        <div className="flex flex-col gap-4 overflow-y-auto lg:order-1">
          <Field label="Название">
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label={`Адрес (slug) — будет доступна по /lp/{slug}`}>
            <Input
              value={slug}
              onChange={(e) => setSlug(e.target.value.toLowerCase())}
              placeholder="owa-password-update"
            />
          </Field>
          {verifiedDomains.length > 0 && (
            <Field label="Домен публикации">
              <Select value={domainId} onValueChange={(v) => setDomainId(v ?? '')}>
                <SelectTrigger>
                  <SelectValue placeholder="Общий адрес системы">
                    {(v: string) => verifiedDomains.find((d) => d.id === v)?.hostname ?? 'Общий адрес системы'}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {verifiedDomains.map((d) => (
                    <SelectItem key={d.id} value={d.id}>
                      {d.hostname}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          )}
          <div className="flex items-center gap-2">
            <Switch id="pg-form" checked={formEnabled} onCheckedChange={setFormEnabled} />
            <Label htmlFor="pg-form">Отслеживать отправку формы</Label>
          </div>
          {formEnabled && (
            <div className="flex flex-col gap-2 rounded-lg border border-warning/40 bg-warning/5 p-3">
              <div className="flex items-center gap-2">
                <Switch id="pg-capture" checked={capturesCredentials} onCheckedChange={setCapturesCredentials} />
                <Label htmlFor="pg-capture" className="flex items-center gap-1.5">
                  <ShieldAlert className="size-4 text-warning" />
                  Сохранять введённые значения
                </Label>
              </div>
              <p className="text-sm text-muted-foreground">
                Выключено по умолчанию. Значения полей формы шифруются отдельным ключом, доступны только через явный
                запрос на расшифровку с записью в журнал.
              </p>
            </div>
          )}
          {sourceUrl && (
            <p className="truncate text-sm text-muted-foreground" title={sourceUrl}>
              Источник: {sourceUrl}
            </p>
          )}
        </div>

        {/* Редактор HTML + предпросмотр — основная рабочая область. */}
        <div className="grid min-h-0 grid-cols-1 gap-4 lg:order-2 xl:grid-cols-2">
          <div className="flex min-h-0 flex-col gap-2">
            <Label htmlFor="pg-html">HTML страницы</Label>
            <Textarea
              id="pg-html"
              className="min-h-[400px] flex-1 font-mono text-sm"
              value={htmlSource}
              onChange={(e) => setHtmlSource(e.target.value)}
            />
          </div>
          <div className="flex min-h-0 flex-col gap-2">
            <div className="flex items-center justify-between">
              <Label>Предпросмотр</Label>
              <div className="flex gap-1">
                <Button
                  type="button"
                  variant={previewWidth === 'desktop' ? 'secondary' : 'ghost'}
                  size="icon-sm"
                  onClick={() => setPreviewWidth('desktop')}
                  aria-label="Предпросмотр: десктоп"
                >
                  <Monitor className="size-4" />
                </Button>
                <Button
                  type="button"
                  variant={previewWidth === 'mobile' ? 'secondary' : 'ghost'}
                  size="icon-sm"
                  onClick={() => setPreviewWidth('mobile')}
                  aria-label="Предпросмотр: мобильный"
                >
                  <Smartphone className="size-4" />
                </Button>
              </div>
            </div>
            <div className="flex min-h-[400px] flex-1 items-start justify-center overflow-auto rounded-lg border bg-muted/30 p-3">
              <iframe
                title="Предпросмотр учебной страницы"
                srcDoc={htmlSource}
                // allow-same-origin сознательно опущен вместе с
                // allow-scripts — предпросматриваемый HTML может быть
                // произвольным (ручной ввод или результат граббера),
                // sandbox без allow-same-origin не даёт скрипту внутри
                // достать cookie/localStorage родительского origin.
                sandbox="allow-scripts"
                className="h-full min-h-[400px] rounded border bg-background shadow-sm transition-[width] duration-200"
                style={{ width: previewWidth === 'mobile' ? 390 : '100%' }}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <Label>{label}</Label>
      {children}
    </div>
  )
}
