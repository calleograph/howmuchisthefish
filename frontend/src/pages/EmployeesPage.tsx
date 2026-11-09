import { useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, downloadFile } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Card } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Upload, Download, Search, Plus, UsersRound, Users, UserX } from 'lucide-react'
import { toast } from 'sonner'
import { Link } from 'react-router-dom'
import { CustomFieldsTab } from './employees/CustomFieldsTab'

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

interface Group {
  id: string
  name: string
  description: string | null
  parentGroupId: string | null
  totalMemberCount: number
  _count: { members: number }
}

export default function EmployeesPage() {
  const [search, setSearch] = useState('')
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const fileInput = useRef<HTMLInputElement>(null)
  const queryClient = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ['employees', search],
    queryFn: () =>
      api
        .get<{ items: Employee[]; total: number }>('/employees', { params: { search, pageSize: 50 } })
        .then((r) => r.data),
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

  const bulkDeactivateMutation = useMutation({
    mutationFn: (employeeIds: string[]) => api.post('/employees/bulk/deactivate', { employeeIds }),
    onSuccess: (_, employeeIds) => {
      queryClient.invalidateQueries({ queryKey: ['employees'] })
      toast.success(`Деактивировано: ${employeeIds.length}`)
      setSelectedIds([])
    },
    onError: (err: any) => toast.error(err.response?.data?.message ?? 'Не удалось деактивировать выбранных'),
  })

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) importMutation.mutate(file)
    e.target.value = ''
  }

  function toggleSelected(id: string, checked: boolean) {
    setSelectedIds((prev) => (checked ? [...prev, id] : prev.filter((x) => x !== id)))
  }
  const allVisibleSelected = !!data?.items.length && data.items.every((e) => selectedIds.includes(e.id))
  function toggleSelectAll(checked: boolean) {
    if (!data) return
    setSelectedIds(checked ? data.items.map((e) => e.id) : [])
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Сотрудники</h1>
          <p className="text-muted-foreground">Цели для учебных кампаний, группы, доп. поля</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => downloadFile('/employees/export.csv', 'employees.csv')}>
            <Download className="size-4" />
            Экспорт CSV
          </Button>
          <input ref={fileInput} type="file" accept=".csv" hidden onChange={handleFileChange} />
          <Button onClick={() => fileInput.current?.click()} disabled={importMutation.isPending}>
            <Upload className="size-4" />
            {importMutation.isPending ? 'Импорт…' : 'Импорт из CSV'}
          </Button>
        </div>
      </div>

      <Tabs defaultValue="employees">
        <TabsList>
          <TabsTrigger value="employees">Сотрудники</TabsTrigger>
          <TabsTrigger value="groups">Группы</TabsTrigger>
          <TabsTrigger value="custom-fields">Доп. поля</TabsTrigger>
        </TabsList>

        <TabsContent value="employees" className="flex flex-col gap-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative max-w-[320px]">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Поиск по email или имени…"
                className="pl-8"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            {selectedIds.length > 0 && (
              <div className="flex items-center gap-2 rounded-lg border bg-muted/30 px-3 py-2">
                <span className="text-sm text-muted-foreground">Выбрано: {selectedIds.length}</span>
                <Button
                  variant="outline"
                  size="sm"
                  className="text-destructive hover:text-destructive"
                  disabled={bulkDeactivateMutation.isPending}
                  onClick={() => {
                    if (
                      confirm(`Деактивировать ${selectedIds.length} сотрудников? Их можно будет снова активировать позже.`)
                    ) {
                      bulkDeactivateMutation.mutate(selectedIds)
                    }
                  }}
                >
                  <UserX className="size-3.5" />
                  Деактивировать
                </Button>
              </div>
            )}
          </div>

          {/* overflow-visible: Card по умолчанию overflow-hidden, что обрезало
              собственный overflow-x-auto контейнер Table — на узких экранах
              таблица теряла колонки вместо горизонтальной прокрутки. min-w на
              таблице гарантирует, что есть что прокручивать. */}
          <Card className="overflow-visible">
            <Table className="min-w-[640px]">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <label className="flex min-h-[44px] min-w-[44px] cursor-pointer items-center justify-center">
                      <Checkbox checked={allVisibleSelected} onCheckedChange={(c) => toggleSelectAll(!!c)} />
                    </label>
                  </TableHead>
                  <TableHead>Сотрудник</TableHead>
                  <TableHead>Отдел</TableHead>
                  <TableHead>Группы</TableHead>
                  <TableHead>Статус</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground">
                      Загрузка…
                    </TableCell>
                  </TableRow>
                )}
                {!isLoading && data?.items.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground">
                      Сотрудники не найдены. Импортируйте список из CSV.
                    </TableCell>
                  </TableRow>
                )}
                {data?.items.map((emp) => (
                  <TableRow key={emp.id}>
                    <TableCell>
                      <label className="flex min-h-[44px] min-w-[44px] cursor-pointer items-center justify-center">
                        <Checkbox
                          checked={selectedIds.includes(emp.id)}
                          onCheckedChange={(c) => toggleSelected(emp.id, !!c)}
                        />
                      </label>
                    </TableCell>
                    <TableCell>
                      <Link to={`/employees/${emp.id}`} className="font-medium hover:underline">
                        {emp.firstName} {emp.lastName}
                      </Link>
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
        </TabsContent>

        <TabsContent value="groups">
          <GroupsTab />
        </TabsContent>

        <TabsContent value="custom-fields">
          <CustomFieldsTab />
        </TabsContent>
      </Tabs>
    </div>
  )
}

function GroupsTab() {
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [parentGroupId, setParentGroupId] = useState('')

  const { data: groups, isLoading } = useQuery({
    queryKey: ['groups'],
    queryFn: () => api.get<Group[]>('/groups').then((r) => r.data),
  })

  function resetForm() {
    setEditingId(null)
    setName('')
    setDescription('')
    setParentGroupId('')
  }

  function openEdit(group: Group) {
    setEditingId(group.id)
    setName(group.name)
    setDescription(group.description ?? '')
    setParentGroupId(group.parentGroupId ?? '')
    setOpen(true)
  }

  const saveMutation = useMutation({
    mutationFn: () => {
      const payload = { name, description: description || undefined, parentGroupId: parentGroupId || undefined }
      return editingId ? api.patch(`/groups/${editingId}`, payload) : api.post('/groups', payload)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['groups'] })
      toast.success(editingId ? 'Группа обновлена' : 'Группа создана')
      setOpen(false)
      resetForm()
    },
    onError: (err: any) => toast.error(err.response?.data?.message ?? 'Не удалось сохранить группу'),
  })

  // Кандидаты в родители — сама группа и её потомки исключены (цикл всё
  // равно отклонит backend, но проще не предлагать заведомо невалидный выбор).
  const parentCandidates = groups?.filter((g) => g.id !== editingId) ?? []

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <Dialog
          open={open}
          onOpenChange={(v) => {
            setOpen(v)
            if (!v) resetForm()
          }}
        >
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
              <DialogTitle>{editingId ? 'Изменить группу' : 'Новая группа'}</DialogTitle>
            </DialogHeader>
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <Label htmlFor="group-name">Название</Label>
                <Input id="group-name" value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="group-description">Описание</Label>
                <Input id="group-description" value={description} onChange={(e) => setDescription(e.target.value)} />
              </div>
              <div className="flex flex-col gap-2">
                <Label>Родительская группа</Label>
                <Select value={parentGroupId} onValueChange={(v) => setParentGroupId(v ?? '')}>
                  <SelectTrigger>
                    <SelectValue placeholder="Нет (группа верхнего уровня)">
                      {(v: string) => parentCandidates.find((g) => g.id === v)?.name ?? 'Нет (группа верхнего уровня)'}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {parentCandidates.map((g) => (
                      <SelectItem key={g.id} value={g.id}>
                        {g.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-sm text-muted-foreground">
                  Вложенные группы наследуют таргетинг — кампания на родительскую группу охватит все дочерние.
                </p>
              </div>
              <Button onClick={() => saveMutation.mutate()} disabled={!name || saveMutation.isPending}>
                <Plus className="size-4" />
                {editingId ? 'Сохранить' : 'Создать'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <Card className="overflow-visible">
        <Table className="min-w-[560px]">
          <TableHeader>
            <TableRow>
              <TableHead>Название</TableHead>
              <TableHead>Родитель</TableHead>
              <TableHead>Прямых участников</TableHead>
              <TableHead>Всего (с вложенными)</TableHead>
              <TableHead className="text-right">Действия</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground">
                  Загрузка…
                </TableCell>
              </TableRow>
            )}
            {!isLoading && groups?.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground">
                  <Users className="mx-auto mb-2 size-6 text-muted-foreground" />
                  Групп пока нет
                </TableCell>
              </TableRow>
            )}
            {groups?.map((g) => (
              <TableRow key={g.id} className="cursor-pointer" onClick={() => openEdit(g)}>
                <TableCell className="font-medium">{g.name}</TableCell>
                <TableCell className="text-muted-foreground">
                  {groups.find((p) => p.id === g.parentGroupId)?.name ?? '—'}
                </TableCell>
                <TableCell>{g._count.members}</TableCell>
                <TableCell>
                  {g.totalMemberCount !== g._count.members ? (
                    <Badge variant="secondary">{g.totalMemberCount}</Badge>
                  ) : (
                    g.totalMemberCount
                  )}
                </TableCell>
                <TableCell className="text-right">
                  <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); openEdit(g) }}>
                    Изменить
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
