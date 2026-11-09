import { useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Plus, Mail, Link2, Flag } from 'lucide-react'
import { toast } from 'sonner'
import { ReportButton } from '@/components/ReportButton'

interface Template {
  id: string
  name: string
  subject: string
  variables: string[]
  updatedAt: string
}

const DEFAULT_MJML = `<mjml>
  <mj-body>
    <mj-section>
      <mj-column>
        <mj-text>Здравствуйте, {{firstName}} {{lastName}}!</mj-text>
        <mj-text>Текст письма…</mj-text>
        <mj-button href="{{landingPageUrl}}">Перейти</mj-button>
      </mj-column>
    </mj-section>
  </mj-body>
</mjml>`

export default function TemplatesPage() {
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [subject, setSubject] = useState('')
  const [mjmlSource, setMjmlSource] = useState(DEFAULT_MJML)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Вставляет переменную-ссылку в позицию курсора — быстрее, чем вручную
  // набирать {{landingPageUrl}}/{{reportPhishingUrl}} посреди готового
  // корпоративного письма с кучей другого текста и разметки.
  function insertAtCursor(token: string) {
    const el = textareaRef.current
    if (!el) {
      setMjmlSource((prev) => prev + token)
      return
    }
    const start = el.selectionStart
    const end = el.selectionEnd
    const next = mjmlSource.slice(0, start) + token + mjmlSource.slice(end)
    setMjmlSource(next)
    requestAnimationFrame(() => {
      el.focus()
      el.setSelectionRange(start + token.length, start + token.length)
    })
  }

  const { data, isLoading } = useQuery({
    queryKey: ['templates'],
    queryFn: () => api.get<Template[]>('/templates').then((r) => r.data),
  })

  const createMutation = useMutation({
    mutationFn: () => api.post('/templates', { name, subject, mjmlSource }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['templates'] })
      toast.success('Шаблон создан')
      setOpen(false)
      setName('')
      setSubject('')
      setMjmlSource(DEFAULT_MJML)
    },
    onError: (err: any) => toast.error(err.response?.data?.message ?? 'Не удалось создать шаблон'),
  })

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Почтовые шаблоны</h1>
          <p className="text-muted-foreground">Письма для учебных кампаний (формат MJML)</p>
        </div>
        <div className="flex gap-2">
          <ReportButton type="templates" label="Отчёт по шаблонам" />
          <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger
            render={
              <Button>
                <Plus className="size-4" />
                Новый шаблон
              </Button>
            }
          />
          <DialogContent className="max-w-[640px]">
            <DialogHeader>
              <DialogTitle>Новый почтовый шаблон</DialogTitle>
            </DialogHeader>
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <Label htmlFor="tpl-name">Название</Label>
                <Input id="tpl-name" value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="tpl-subject">Тема письма</Label>
                <Input id="tpl-subject" value={subject} onChange={(e) => setSubject(e.target.value)} />
              </div>
              <div className="flex flex-col gap-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Label htmlFor="tpl-mjml">
                    MJML-исходник. Переменные: <code>{'{{firstName}}'}</code>, <code>{'{{lastName}}'}</code>
                  </Label>
                  <div className="flex gap-1">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => insertAtCursor('{{landingPageUrl}}')}
                    >
                      <Link2 className="size-3.5" />
                      Ссылка на лендинг
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => insertAtCursor('{{reportPhishingUrl}}')}
                    >
                      <Flag className="size-3.5" />
                      Сообщить о фишинге
                    </Button>
                  </div>
                </div>
                <Textarea
                  id="tpl-mjml"
                  ref={textareaRef}
                  className="min-h-[240px] font-mono text-sm"
                  value={mjmlSource}
                  onChange={(e) => setMjmlSource(e.target.value)}
                />
              </div>
              <Button
                onClick={() => createMutation.mutate()}
                disabled={!name || !subject || createMutation.isPending}
              >
                {createMutation.isPending ? 'Сохранение…' : 'Создать шаблон'}
              </Button>
            </div>
          </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {isLoading && <p className="text-muted-foreground">Загрузка…</p>}
        {!isLoading && data?.length === 0 && (
          <p className="text-muted-foreground">Шаблонов пока нет — создайте первый.</p>
        )}
        {data?.map((tpl) => (
          <Card key={tpl.id}>
            <CardHeader className="flex flex-row items-start justify-between pb-2">
              <CardTitle className="text-base">{tpl.name}</CardTitle>
              <Mail className="size-4 shrink-0 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <p className="mb-2 truncate text-sm text-muted-foreground">{tpl.subject}</p>
              <div className="flex flex-wrap gap-1">
                {tpl.variables.map((v) => (
                  <code key={v} className="rounded bg-muted px-1 py-0.5 text-xs">
                    {`{{${v}}}`}
                  </code>
                ))}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
