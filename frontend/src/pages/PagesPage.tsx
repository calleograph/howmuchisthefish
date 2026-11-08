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
import { Plus, FileText } from 'lucide-react'
import { toast } from 'sonner'

interface LandingPage {
  id: string
  name: string
  slug: string
  formEnabled: boolean
  updatedAt: string
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
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [formEnabled, setFormEnabled] = useState(true)
  const [htmlSource, setHtmlSource] = useState(DEFAULT_HTML)

  const { data, isLoading } = useQuery({
    queryKey: ['pages'],
    queryFn: () => api.get<LandingPage[]>('/pages').then((r) => r.data),
  })

  const createMutation = useMutation({
    mutationFn: () => api.post('/pages', { name, slug, htmlSource, formEnabled }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pages'] })
      toast.success('Страница создана')
      setOpen(false)
      setName('')
      setSlug('')
      setHtmlSource(DEFAULT_HTML)
    },
    onError: (err: any) => toast.error(err.response?.data?.message ?? 'Не удалось создать страницу'),
  })

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Учебные страницы</h1>
          <p className="text-muted-foreground">
            Страницы, на которые ведут ссылки из писем. Значения полей форм не сохраняются — только факт отправки.
          </p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
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
              <div className="flex items-center gap-2">
                <Switch id="pg-form" checked={formEnabled} onCheckedChange={setFormEnabled} />
                <Label htmlFor="pg-form">Страница содержит форму для отслеживания отправки</Label>
              </div>
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
          <Card key={page.id}>
            <CardHeader className="flex flex-row items-start justify-between pb-2">
              <CardTitle className="text-base">{page.name}</CardTitle>
              <FileText className="size-4 shrink-0 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <code className="text-sm text-muted-foreground">/lp/{page.slug}</code>
              <div className="mt-2">
                <Badge variant={page.formEnabled ? 'default' : 'secondary'}>
                  {page.formEnabled ? 'С отслеживанием формы' : 'Без формы'}
                </Badge>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
