import { useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Card } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Upload, Search, Plus, UsersRound } from 'lucide-react'
import { toast } from 'sonner'

interface Employee {
  id: string
  email: string
  firstName: string
  lastName: string
  department: string | null
  position: string | null
  isActive: boolean
  groups: { group: { id: string; name: string } }[]
}

interface ImportResult {
  totalRows: number
  created: number
  updated: number
  skipped: number
  errors: { row: number; email?: string; reason: string }[]
}

export default function EmployeesPage() {
  const [search, setSearch] = useState('')
  const [groupDialogOpen, setGroupDialogOpen] = useState(false)
  const [groupName, setGroupName] = useState('')
  const fileInput = useRef<HTMLInputElement>(null)
  const queryClient = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ['employees', search],
    queryFn: () =>
      api
        .get<{ items: Employee[]; total: number }>('/employees', { params: { search, pageSize: 50 } })
        .then((r) => r.data),
  })

  const createGroupMutation = useMutation({
    mutationFn: () => api.post('/groups', { name: groupName }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['groups'] })
      toast.success('Группа создана')
      setGroupDialogOpen(false)
      setGroupName('')
    },
    onError: (err: any) => toast.error(err.response?.data?.message ?? 'Не удалось создать группу'),
  })

  const importMutation = useMutation({
    mutationFn: (file: File) => {
      const form = new FormData()
      form.append('file', file)
      return api.post<ImportResult>('/employees/import-csv', form).then((r) => r.data)
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['employees'] })
      if (result.errors.length > 0) {
        toast.warning(
          `Импортировано: ${result.created} создано, ${result.updated} обновлено. Пропущено ${result.skipped} строк — см. детали.`,
        )
        console.table(result.errors)
      } else {
        toast.success(`Импортировано: ${result.created} создано, ${result.updated} обновлено`)
      }
    },
    onError: () => toast.error('Не удалось импортировать файл'),
  })

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) importMutation.mutate(file)
    e.target.value = ''
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Сотрудники</h1>
          <p className="text-muted-foreground">Список целей для учебных кампаний</p>
        </div>
        <div className="flex gap-2">
          <Dialog open={groupDialogOpen} onOpenChange={setGroupDialogOpen}>
            <DialogTrigger
              render={
                <Button variant="outline">
                  <UsersRound className="size-4" />
                  Новая группа
                </Button>
              }
            />
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Новая группа</DialogTitle>
              </DialogHeader>
              <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-2">
                  <Label htmlFor="group-name">Название</Label>
                  <Input id="group-name" value={groupName} onChange={(e) => setGroupName(e.target.value)} />
                </div>
                <Button
                  onClick={() => createGroupMutation.mutate()}
                  disabled={!groupName || createGroupMutation.isPending}
                >
                  <Plus className="size-4" />
                  Создать
                </Button>
              </div>
            </DialogContent>
          </Dialog>
          <input ref={fileInput} type="file" accept=".csv" hidden onChange={handleFileChange} />
          <Button onClick={() => fileInput.current?.click()} disabled={importMutation.isPending}>
            <Upload className="size-4" />
            {importMutation.isPending ? 'Импорт…' : 'Импорт из CSV'}
          </Button>
        </div>
      </div>

      <div className="relative max-w-[320px]">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Поиск по email или имени…"
          className="pl-8"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* overflow-visible: Card по умолчанию overflow-hidden, что обрезало
          собственный overflow-x-auto контейнер Table — на узких экранах
          таблица теряла колонки вместо горизонтальной прокрутки. min-w на
          таблице гарантирует, что есть что прокручивать. */}
      <Card className="overflow-visible">
        <Table className="min-w-[640px]">
          <TableHeader>
            <TableRow>
              <TableHead>Сотрудник</TableHead>
              <TableHead>Отдел</TableHead>
              <TableHead>Группы</TableHead>
              <TableHead>Статус</TableHead>
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
            {!isLoading && data?.items.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-muted-foreground">
                  Сотрудники не найдены. Импортируйте список из CSV.
                </TableCell>
              </TableRow>
            )}
            {data?.items.map((emp) => (
              <TableRow key={emp.id}>
                <TableCell>
                  <div className="font-medium">
                    {emp.firstName} {emp.lastName}
                  </div>
                  <div className="text-sm text-muted-foreground">{emp.email}</div>
                </TableCell>
                <TableCell>{emp.department ?? '—'}</TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    {emp.groups.map((g) => (
                      <Badge key={g.group.id} variant="secondary">
                        {g.group.name}
                      </Badge>
                    ))}
                    {emp.groups.length === 0 && <span className="text-muted-foreground">—</span>}
                  </div>
                </TableCell>
                <TableCell>
                  <Badge variant={emp.isActive ? 'default' : 'outline'}>
                    {emp.isActive ? 'Активен' : 'Неактивен'}
                  </Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  )
}
