import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Plus, FileText, Globe, ShieldAlert } from 'lucide-react'
import { toast } from 'sonner'

interface LandingPage {
  id: string
  name: string
  slug: string
  formEnabled: boolean
  capturesCredentials: boolean
  screenshotPath: string | null
  sourceUrl: string | null
  domainId: string | null
  updatedAt: string
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

export default function PagesPage() {
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [sourceTab, setSourceTab] = useState<'manual' | 'clone'>('manual')
  const [cloneUrl, setCloneUrl] = useState('')
  const [sourceUrl, setSourceUrl] = useState('')
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [formEnabled, setFormEnabled] = useState(true)
  const [capturesCredentials, setCapturesCredentials] = useState(false)
  const [htmlSource, setHtmlSource] = useState(DEFAULT_HTML)
  const [domainId, setDomainId] = useState<string>('')

  const { data: domains } = useQuery({
    queryKey: ['domains'],
    queryFn: () => api.get<Domain[]>('/domains').then((r) => r.data),
  })
  const verifiedDomains = domains?.filter((d) => d.verificationStatus === 'VERIFIED') ?? []

  const { data, isLoading } = useQuery({
    queryKey: ['pages'],
    queryFn: () => api.get<LandingPage[]>('/pages').then((r) => r.data),
  })

  function resetForm() {
    setSourceTab('manual')
    setCloneUrl('')
    setSourceUrl('')
    setName('')
    setSlug('')
    setFormEnabled(true)
    setCapturesCredentials(false)
    setHtmlSource(DEFAULT_HTML)
    setDomainId('')
  }

  const cloneMutation = useMutation({
    mutationFn: () => api.post<{ htmlSource: string; sourceUrl: string }>('/pages/clone-preview', { url: cloneUrl }).then((r) => r.data),
    onSuccess: (result) => {
      setHtmlSource(result.htmlSource)
      setSourceUrl(result.sourceUrl)
      toast.success('Страница загружена — проверьте разметку перед сохранением')
    },
    onError: (err: any) => toast.error(err.response?.data?.message ?? 'Не удалось загрузить страницу'),
  })

  const createMutation = useMutation({
    mutationFn: () =>
      api.post('/pages', {
        name,
        slug,
        htmlSource,
        formEnabled,
        capturesCredentials,
        sourceUrl: sourceUrl || undefined,
        domainId: domainId || undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pages'] })
      toast.success('Страница создана')
      setOpen(false)
      resetForm()
    },
    onError: (err: any) => toast.error(err.response?.data?.message ?? 'Не удалось создать страницу'),
  })

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Учебные страницы</h1>
          <p className="text-muted-foreground">
            Страницы, на которые ведут ссылки из писем. По умолчанию сохраняется только факт отправки формы.
          </p>
        </div>
        <Dialog
          open={open}
          onOpenChange={(v) => {
            setOpen(v)
            if (!v) resetForm()
          }}
        >
          <DialogTrigger
            render={
              <Button>
                <Plus className="size-4" />
                Новая страница
              </Button>
            }
          />
          <DialogContent className="max-w-[640px]">
            <DialogHeader>
              <DialogTitle>Новая учебная страница</DialogTitle>
            </DialogHeader>
            <div className="flex flex-col gap-4">
              <Tabs value={sourceTab} onValueChange={(v) => setSourceTab((v as typeof sourceTab) ?? 'manual')}>
                <TabsList>
                  <TabsTrigger value="manual">Ручной ввод HTML</TabsTrigger>
                  <TabsTrigger value="clone">Клонировать по адресу</TabsTrigger>
                </TabsList>
                <TabsContent value="clone" className="flex flex-col gap-3 pt-3">
                  <p className="text-sm text-muted-foreground">
                    Загружает страницу через headless-браузер (работает и для SPA/JS-форм), переписывает форму на
                    безопасную отправку. Ресурсы (CSS/JS/картинки) продолжают подгружаться с исходного сайта — пока
                    он доступен.
                  </p>
                  <div className="flex gap-2">
                    <Input
                      placeholder="https://example.com/login"
                      value={cloneUrl}
                      onChange={(e) => setCloneUrl(e.target.value)}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => cloneMutation.mutate()}
                      disabled={!cloneUrl || cloneMutation.isPending}
                    >
                      <Globe className="size-4" />
                      {cloneMutation.isPending ? 'Загрузка…' : 'Загрузить'}
                    </Button>
                  </div>
                </TabsContent>
              </Tabs>

              <div className="flex flex-col gap-2">
                <Label htmlFor="pg-name">Название</Label>
                <Input id="pg-name" value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="pg-slug">
                  Адрес (slug) — только a-z, 0-9 и дефис, будет доступна по /lp/{'{slug}'}
                </Label>
                <Input
                  id="pg-slug"
                  value={slug}
                  onChange={(e) => setSlug(e.target.value.toLowerCase())}
                  placeholder="owa-password-update"
                />
              </div>
              {verifiedDomains.length > 0 && (
                <div className="flex flex-col gap-2">
                  <Label>Домен публикации</Label>
                  <Select value={domainId} onValueChange={(v) => setDomainId(v ?? '')}>
                    <SelectTrigger>
                      <SelectValue placeholder="Общий адрес системы">
                        {(v: string) =>
                          verifiedDomains.find((d) => d.id === v)?.hostname ?? 'Общий адрес системы'
                        }
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
                </div>
              )}
              <div className="flex items-center gap-2">
                <Switch id="pg-form" checked={formEnabled} onCheckedChange={setFormEnabled} />
                <Label htmlFor="pg-form">Страница содержит форму для отслеживания отправки</Label>
              </div>

              {formEnabled && (
                <div className="flex flex-col gap-2 rounded-lg border border-warning/40 bg-warning/5 p-3">
                  <div className="flex items-center gap-2">
                    <Switch
                      id="pg-capture"
                      checked={capturesCredentials}
                      onCheckedChange={setCapturesCredentials}
                    />
                    <Label htmlFor="pg-capture" className="flex items-center gap-1.5">
                      <ShieldAlert className="size-4 text-warning" />
                      Сохранять введённые значения (зашифрованно)
                    </Label>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Выключено по умолчанию. Если включить — значения полей формы (включая пароли) шифруются
                    отдельным ключом и доступны администратору только через явный запрос на расшифровку с записью в
                    журнал. Используйте только когда нужно точно установить факт компрометации.
                  </p>
                </div>
              )}

              <div className="flex flex-col gap-2">
                <Label htmlFor="pg-html">HTML страницы</Label>
                <Textarea
                  id="pg-html"
                  className="min-h-[240px] font-mono text-sm"
                  value={htmlSource}
                  onChange={(e) => setHtmlSource(e.target.value)}
                />
              </div>
              <Button
                onClick={() => createMutation.mutate()}
                disabled={!name || !slug || createMutation.isPending}
              >
                {createMutation.isPending ? 'Сохранение…' : 'Создать страницу'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {isLoading && <p className="text-muted-foreground">Загрузка…</p>}
        {!isLoading && data?.length === 0 && (
          <p className="text-muted-foreground">Страниц пока нет — создайте первую.</p>
        )}
        {data?.map((page) => (
          <Card key={page.id} className="overflow-hidden">
            {/* Превью опционально (требует отдельного screenshot-service,
                см. docs/CONFIGURATION.md) — без него просто placeholder,
                не ошибка. */}
            <div className="flex aspect-video items-center justify-center border-b bg-muted">
              {page.screenshotPath ? (
                <img
                  src={`/api/pages/${page.id}/screenshot`}
                  alt={`Превью страницы ${page.name}`}
                  className="h-full w-full object-cover object-top"
                />
              ) : (
                <FileText className="size-8 text-muted-foreground" />
              )}
            </div>
            <CardHeader className="flex flex-row items-start justify-between pb-2">
              <CardTitle className="text-base">{page.name}</CardTitle>
            </CardHeader>
            <CardContent>
              <code className="text-sm text-muted-foreground">/lp/{page.slug}</code>
              <div className="mt-2 flex flex-wrap gap-1">
                <Badge variant={page.formEnabled ? 'default' : 'secondary'}>
                  {page.formEnabled ? 'С отслеживанием формы' : 'Без формы'}
                </Badge>
                {page.capturesCredentials && (
                  <Badge className="gap-1 bg-warning text-warning-foreground">
                    <ShieldAlert className="size-3" />
                    Захват значений
                  </Badge>
                )}
                {page.domainId && (
                  <Badge variant="outline" className="gap-1">
                    <Globe className="size-3" />
                    Свой домен
                  </Badge>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
