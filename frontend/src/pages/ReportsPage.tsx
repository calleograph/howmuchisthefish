import { useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { ShieldCheck, X } from 'lucide-react'
import { ReportButton } from '@/components/ReportButton'

interface EmployeeRow {
  employeeId: string
  email: string
  fullName: string
  campaignsReceived: number
  opened: number
  clicked: number
  submitted: number
  reportedPhishing: number
}

// Ключи — то, что DashboardPage.tsx передаёт в ссылке ?filter=; показывают
// только сотрудников, у кого соответствующий счётчик > 0. "sent" — прямого
// поля нет в EmployeeRow, используем campaignsReceived (получил хотя бы
// одно письмо кампании) как наиболее близкий эквивалент.
const FILTER_CONFIG: Record<string, { label: string; field: keyof EmployeeRow }> = {
  sent: { label: 'Отправлено (получили письмо)', field: 'campaignsReceived' },
  opened: { label: 'Открыли письмо', field: 'opened' },
  clicked: { label: 'Перешли по ссылке', field: 'clicked' },
  submitted: { label: 'Отправили форму', field: 'submitted' },
  reportedPhishing: { label: 'Сообщили о фишинге', field: 'reportedPhishing' },
}

interface GroupRow {
  groupId: string
  groupName: string
  memberCount: number
  totalTargets: number
  submitted: number
  submissionRate: number
}

export default function ReportsPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const filterKey = searchParams.get('filter')
  const filter = filterKey ? FILTER_CONFIG[filterKey] : undefined

  const { data: byEmployee } = useQuery({
    queryKey: ['reports', 'by-employee'],
    queryFn: () => api.get<EmployeeRow[]>('/reports/by-employee').then((r) => r.data),
  })
  const { data: byGroup } = useQuery({
    queryKey: ['reports', 'by-group'],
    queryFn: () => api.get<GroupRow[]>('/reports/by-group').then((r) => r.data),
  })

  // Клиентский фильтр поверх уже загруженного byEmployee() — переход с
  // карточек дашборда (DashboardPage.tsx StatCard) по конкретной метрике.
  // Не масштабируется на очень большие объёмы данных (фильтрация после
  // полной загрузки, не на backend) — приемлемо для типичного объёма
  // сотрудников в одной организации, апгрейд на серверный фильтр по
  // необходимости.
  const visibleEmployees = filter ? byEmployee?.filter((row) => (row[filter.field] as number) > 0) : byEmployee

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Аналитика</h1>
          <p className="text-muted-foreground">Срезы по сотрудникам и группам</p>
        </div>
        <div className="flex items-center gap-2">
          <ReportButton type="analytics" label="Отчёт по аналитике" />
        </div>
        {filter && (
          <div className="flex items-center gap-2 rounded-lg border bg-muted/30 px-3 py-2 text-sm">
            <span className="text-muted-foreground">Фильтр:</span>
            <span className="font-medium">{filter.label}</span>
            <Button variant="ghost" size="icon-sm" onClick={() => setSearchParams({})} aria-label="Сбросить фильтр">
              <X className="size-3.5" />
            </Button>
          </div>
        )}
      </div>

      <Tabs defaultValue="employees">
        <TabsList>
          <TabsTrigger value="employees">По сотрудникам</TabsTrigger>
          <TabsTrigger value="groups">По группам</TabsTrigger>
        </TabsList>
        <TabsContent value="employees">
          <Card className="overflow-visible">
            <Table className="min-w-[560px]">
              <TableHeader>
                <TableRow>
                  <TableHead>Сотрудник</TableHead>
                  <TableHead>Кампаний</TableHead>
                  <TableHead>Открыто</TableHead>
                  <TableHead>Переходов</TableHead>
                  <TableHead>Отправлено форм</TableHead>
                  <TableHead>Сообщил о фишинге</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filter && visibleEmployees?.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground">
                      Никто не попадает под фильтр «{filter.label}»
                    </TableCell>
                  </TableRow>
                )}
                {visibleEmployees?.map((row) => (
                  <TableRow key={row.employeeId}>
                    <TableCell>
                      <div className="font-medium">{row.fullName}</div>
                      <div className="text-sm text-muted-foreground">{row.email}</div>
                    </TableCell>
                    <TableCell>{row.campaignsReceived}</TableCell>
                    <TableCell>{row.opened}</TableCell>
                    <TableCell>{row.clicked}</TableCell>
                    <TableCell>
                      {row.submitted > 0 ? (
                        <Badge variant="destructive">{row.submitted}</Badge>
                      ) : (
                        <span className="text-muted-foreground">0</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {row.reportedPhishing > 0 ? (
                        <Badge className="gap-1 bg-success text-success-foreground">
                          <ShieldCheck className="size-3" />
                          {row.reportedPhishing}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground">0</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>
        <TabsContent value="groups">
          <Card className="overflow-visible">
            <Table className="min-w-[560px]">
              <TableHeader>
                <TableRow>
                  <TableHead>Группа</TableHead>
                  <TableHead>Участников</TableHead>
                  <TableHead>Получили писем</TableHead>
                  <TableHead>Отправили форму</TableHead>
                  <TableHead>Доля</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {byGroup?.map((row) => (
                  <TableRow key={row.groupId}>
                    <TableCell className="font-medium">{row.groupName}</TableCell>
                    <TableCell>{row.memberCount}</TableCell>
                    <TableCell>{row.totalTargets}</TableCell>
                    <TableCell>{row.submitted}</TableCell>
                    <TableCell>
                      <Badge variant={row.submissionRate > 30 ? 'destructive' : 'secondary'}>
                        {row.submissionRate}%
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
