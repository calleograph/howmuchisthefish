import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, downloadFile } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { FileText, Download } from 'lucide-react'
import { toast } from 'sonner'

type ReportType =
  | 'overview'
  | 'campaigns'
  | 'employees'
  | 'groups'
  | 'templates'
  | 'pages'
  | 'domains'
  | 'smtp'
  | 'analytics'
  | 'audit-log'

interface PreviewResult {
  headers: string[]
  rows: (string | number | boolean)[]
  totalRows: number
}

interface ReportJob {
  id: string
  status: 'pending' | 'running' | 'done' | 'failed'
  format: string
  errorMessage: string | null
}

/**
 * Единый механизм отчётности (задание §9) — подключается в каждый из 10
 * разделов с соответствующим type. Кнопка "Сформировать отчёт" открывает
 * диалог: предпросмотр первых строк (POST /report-jobs/preview, без
 * сохранения файла), выбор формата CSV/XLSX, запуск (POST /report-jobs),
 * опрос статуса до готовности, скачивание через уже существующий
 * downloadFile() (lib/api.ts — authenticated fetch + Blob, тот же
 * паттерн, что у экспорта сотрудников/кампаний).
 */
export function ReportButton({
  type,
  label = 'Сформировать отчёт',
  filters,
}: {
  type: ReportType
  label?: string
  filters?: Record<string, unknown>
}) {
  const [open, setOpen] = useState(false)
  const [format, setFormat] = useState<'csv' | 'xlsx'>('csv')
  const [jobId, setJobId] = useState<string | null>(null)
  const queryClient = useQueryClient()

  const { data: preview, isLoading: previewLoading } = useQuery({
    queryKey: ['report-preview', type, filters],
    queryFn: () =>
      api.post<PreviewResult>('/report-jobs/preview', { type, filters: filters ?? {} }).then((r) => r.data),
    enabled: open,
  })

  const { data: job } = useQuery({
    queryKey: ['report-job', jobId],
    queryFn: () => api.get<ReportJob>(`/report-jobs/${jobId}`).then((r) => r.data),
    enabled: !!jobId,
    refetchInterval: (query) => (query.state.data?.status === 'done' || query.state.data?.status === 'failed' ? false : 1000),
  })

  const createMutation = useMutation({
    mutationFn: () =>
      api.post<ReportJob>('/report-jobs', { type, format, filters: filters ?? {} }).then((r) => r.data),
    onSuccess: (created) => {
      setJobId(created.id)
      queryClient.invalidateQueries({ queryKey: ['report-jobs'] })
    },
    onError: (err: any) => toast.error(err.response?.data?.message ?? 'Не удалось сформировать отчёт'),
  })

  function handleDownload() {
    if (!jobId) return
    downloadFile(`/report-jobs/${jobId}/download`, `${type}-report.${format}`)
    toast.success('Отчёт скачан')
    setOpen(false)
    setJobId(null)
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v)
        if (!v) setJobId(null)
      }}
    >
      <DialogTrigger
        render={
          <Button variant="outline">
            <FileText className="size-4" />
            {label}
          </Button>
        }
      />
      <DialogContent className="max-w-[720px]">
        <DialogHeader>
          <DialogTitle>Отчёт — {label}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label>Формат</Label>
            <Select value={format} onValueChange={(v) => setFormat((v as 'csv' | 'xlsx') ?? 'csv')}>
              <SelectTrigger>
                <SelectValue placeholder="Формат">{(v: string) => (v === 'xlsx' ? 'XLSX' : 'CSV')}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="csv">CSV</SelectItem>
                <SelectItem value="xlsx">XLSX</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-2">
            <Label>Предпросмотр{preview ? ` (первые ${preview.rows.length} из ${preview.totalRows})` : ''}</Label>
            {previewLoading ? (
              <p className="text-sm text-muted-foreground">Загрузка…</p>
            ) : preview && preview.rows.length > 0 ? (
              <div className="max-h-[300px] overflow-auto rounded-lg border">
                <Table className="min-w-[480px]">
                  <TableHeader>
                    <TableRow>
                      {preview.headers.map((h) => (
                        <TableHead key={h}>{h}</TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {preview.rows.map((row, i) => (
                      <TableRow key={i}>
                        {(row as unknown as (string | number | boolean)[]).map((cell, j) => (
                          <TableCell key={j}>{String(cell)}</TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Нет данных для отчёта.</p>
            )}
          </div>

          {!job && (
            <Button onClick={() => createMutation.mutate()} disabled={createMutation.isPending || !preview?.totalRows}>
              {createMutation.isPending ? 'Запуск…' : 'Сформировать'}
            </Button>
          )}
          {job?.status === 'pending' || job?.status === 'running' ? (
            <p className="text-sm text-muted-foreground">Формирование отчёта…</p>
          ) : null}
          {job?.status === 'failed' && (
            <p className="text-sm text-destructive">Ошибка: {job.errorMessage}</p>
          )}
          {job?.status === 'done' && (
            <Button onClick={handleDownload}>
              <Download className="size-4" />
              Скачать {format.toUpperCase()}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
