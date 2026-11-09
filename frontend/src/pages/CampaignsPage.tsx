import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Plus, Play, Pause, Square } from 'lucide-react'
import { toast } from 'sonner'
import { Link } from 'react-router-dom'

interface Campaign {
  id: string
  name: string
  status: 'DRAFT' | 'SCHEDULED' | 'RUNNING' | 'PAUSED' | 'FINISHED' | 'FAILED'
  _count: { targets: number; events: number }
}

const STATUS_LABEL: Record<Campaign['status'], string> = {
  DRAFT: 'Черновик',
  SCHEDULED: 'Запланирована',
  RUNNING: 'Выполняется',
  PAUSED: 'Приостановлена',
  FINISHED: 'Завершена',
  FAILED: 'Сбой',
}

const STATUS_VARIANT: Record<Campaign['status'], 'default' | 'secondary' | 'destructive' | 'outline'> = {
  DRAFT: 'outline',
  SCHEDULED: 'secondary',
  RUNNING: 'default',
  PAUSED: 'secondary',
  FINISHED: 'secondary',
  FAILED: 'destructive',
}

export default function CampaignsPage() {
  const queryClient = useQueryClient()

  const { data: campaigns, isLoading } = useQuery({
    queryKey: ['campaigns'],
    queryFn: () => api.get<Campaign[]>('/campaigns').then((r) => r.data),
  })

  const actionMutation = useMutation({
    mutationFn: ({ id, action }: { id: string; action: string }) => api.post(`/campaigns/${id}/${action}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['campaigns'] })
      toast.success('Статус кампании обновлён')
    },
    onError: (err: any) => toast.error(err.response?.data?.message ?? 'Действие недопустимо'),
  })

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Кампании</h1>
          <p className="text-muted-foreground">Учебные фишинговые рассылки</p>
        </div>
        <Button render={<Link to="/campaigns/new" />}>
          <Plus className="size-4" />
          Новая кампания
        </Button>
      </div>

      <Card className="overflow-visible">
        <Table className="min-w-[640px]">
          <TableHeader>
            <TableRow>
              <TableHead>Название</TableHead>
              <TableHead>Статус</TableHead>
              <TableHead>Получателей</TableHead>
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
            {campaigns?.map((c) => (
              <TableRow key={c.id}>
                <TableCell>
                  <Link to={`/campaigns/${c.id}`} className="font-medium hover:underline">
                    {c.name}
                  </Link>
                </TableCell>
                <TableCell>
                  <Badge variant={STATUS_VARIANT[c.status]}>{STATUS_LABEL[c.status]}</Badge>
                </TableCell>
                <TableCell>{c._count.targets}</TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1">
                    {c.status === 'DRAFT' && (
                      <Button
                        variant="outline"
                        className="min-h-[44px]"
                        onClick={() => actionMutation.mutate({ id: c.id, action: 'start' })}
                      >
                        <Play className="size-3.5" />
                        Запустить
                      </Button>
                    )}
                    {c.status === 'RUNNING' && (
                      <>
                        <Button
                          variant="outline"
                          className="min-h-[44px]"
                          onClick={() => actionMutation.mutate({ id: c.id, action: 'pause' })}
                        >
                          <Pause className="size-3.5" />
                        </Button>
                        <Button
                          variant="outline"
                          className="min-h-[44px]"
                          onClick={() => actionMutation.mutate({ id: c.id, action: 'finish' })}
                        >
                          <Square className="size-3.5" />
                          Завершить
                        </Button>
                      </>
                    )}
                    {c.status === 'PAUSED' && (
                      <Button
                        variant="outline"
                        className="min-h-[44px]"
                        onClick={() => actionMutation.mutate({ id: c.id, action: 'resume' })}
                      >
                        <Play className="size-3.5" />
                        Продолжить
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  )
}
