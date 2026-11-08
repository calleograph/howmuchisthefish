import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { Card } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'

interface EmployeeRow {
  employeeId: string
  email: string
  fullName: string
  campaignsReceived: number
  opened: number
  clicked: number
  submitted: number
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
  const { data: byEmployee } = useQuery({
    queryKey: ['reports', 'by-employee'],
    queryFn: () => api.get<EmployeeRow[]>('/reports/by-employee').then((r) => r.data),
  })
  const { data: byGroup } = useQuery({
    queryKey: ['reports', 'by-group'],
    queryFn: () => api.get<GroupRow[]>('/reports/by-group').then((r) => r.data),
  })

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Аналитика</h1>
        <p className="text-muted-foreground">Срезы по сотрудникам и группам</p>
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
                </TableRow>
              </TableHeader>
              <TableBody>
                {byEmployee?.map((row) => (
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
