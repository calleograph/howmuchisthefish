import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Plus, Trash2, ListPlus } from 'lucide-react'
import { toast } from 'sonner'

interface CustomFieldDef {
  id: string
  key: string
  label: string
  type: 'STRING' | 'NUMBER' | 'BOOLEAN' | 'ENUM'
  options: string[] | null
}

const TYPE_LABEL: Record<CustomFieldDef['type'], string> = {
  STRING: 'Текст',
  NUMBER: 'Число',
  BOOLEAN: 'Да/нет',
  ENUM: 'Список значений',
}

export function CustomFieldsTab() {
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [key, setKey] = useState('')
  const [label, setLabel] = useState('')
  const [type, setType] = useState<CustomFieldDef['type']>('STRING')
  const [optionsInput, setOptionsInput] = useState('')

  const { data: fields, isLoading } = useQuery({
    queryKey: ['custom-fields'],
    queryFn: () => api.get<CustomFieldDef[]>('/custom-fields').then((r) => r.data),
  })

  function resetForm() {
    setKey('')
    setLabel('')
    setType('STRING')
    setOptionsInput('')
  }

  const createMutation = useMutation({
    mutationFn: () =>
      api.post('/custom-fields', {
        key,
        label,
        type,
        options:
          type === 'ENUM'
            ? optionsInput
                .split(',')
                .map((o) => o.trim())
                .filter(Boolean)
            : undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['custom-fields'] })
      toast.success('Поле добавлено')
      setOpen(false)
      resetForm()
    },
    onError: (err: any) => toast.error(err.response?.data?.message ?? 'Не удалось создать поле'),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/custom-fields/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['custom-fields'] })
      toast.success('Поле удалено')
    },
    onError: () => toast.error('Не удалось удалить поле'),
  })

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-4">
        <p className="max-w-prose text-sm text-muted-foreground">
          Дополнительные атрибуты сотрудников (табельный номер, локация офиса и т.п.) — доступны для персонализации
          писем через <code className="rounded bg-muted px-1">{'{{customField.ключ}}'}</code> и для точного таргетинга
          кампаний.
        </p>
        <Dialog
          open={open}
          onOpenChange={(v) => {
            setOpen(v)
            if (!v) resetForm()
          }}
        >
          <DialogTrigger
            render={
              <Button variant="outline" className="shrink-0">
                <ListPlus className="size-4" />
                Новое поле
              </Button>
            }
          />
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Новое доп. поле</DialogTitle>
            </DialogHeader>
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <Label htmlFor="field-key">Ключ</Label>
                <Input
                  id="field-key"
                  placeholder="costCenter"
                  value={key}
                  onChange={(e) => setKey(e.target.value)}
                />
                <p className="text-sm text-muted-foreground">Латиницей, без пробелов — используется в шаблонах</p>
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="field-label">Название</Label>
                <Input
                  id="field-label"
                  placeholder="Код затрат"
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label>Тип</Label>
                <Select value={type} onValueChange={(v) => setType((v as CustomFieldDef['type']) ?? 'STRING')}>
                  <SelectTrigger>
                    <SelectValue placeholder="Тип">{(v: string) => TYPE_LABEL[v as CustomFieldDef['type']]}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(TYPE_LABEL).map(([value, text]) => (
                      <SelectItem key={value} value={value}>
                        {text}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {type === 'ENUM' && (
                <div className="flex flex-col gap-2">
                  <Label htmlFor="field-options">Варианты значений (через запятую)</Label>
                  <Input
                    id="field-options"
                    placeholder="Москва, Санкт-Петербург, Новосибирск"
                    value={optionsInput}
                    onChange={(e) => setOptionsInput(e.target.value)}
                  />
                </div>
              )}
              <Button onClick={() => createMutation.mutate()} disabled={!key || !label || createMutation.isPending}>
                <Plus className="size-4" />
                Создать
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <Card className="overflow-visible">
        <Table className="min-w-[480px]">
          <TableHeader>
            <TableRow>
              <TableHead>Название</TableHead>
              <TableHead>Ключ</TableHead>
              <TableHead>Тип</TableHead>
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
            {!isLoading && fields?.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-muted-foreground">
                  Доп. полей пока нет
                </TableCell>
              </TableRow>
            )}
            {fields?.map((f) => (
              <TableRow key={f.id}>
                <TableCell className="font-medium">{f.label}</TableCell>
                <TableCell>
                  <code className="rounded bg-muted px-1 text-sm">{f.key}</code>
                </TableCell>
                <TableCell>
                  <Badge variant="secondary">{TYPE_LABEL[f.type]}</Badge>
                  {f.type === 'ENUM' && f.options && (
                    <span className="ml-2 text-sm text-muted-foreground">{f.options.join(', ')}</span>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="min-h-[44px] min-w-[44px]"
                    onClick={() => deleteMutation.mutate(f.id)}
                    aria-label="Удалить поле"
                  >
                    <Trash2 className="size-4 text-destructive" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  )
}
