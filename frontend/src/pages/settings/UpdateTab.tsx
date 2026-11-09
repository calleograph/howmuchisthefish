import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { ArrowUpCircle, CheckCircle2, Download, RefreshCw, XCircle } from 'lucide-react'
import { toast } from 'sonner'

// Архитектура этого экрана (протокол, polling-интервалы, структура блоков)
// перенесена из проекта «Переговорка» (frontend/src/pages/admin/UpdatesAdmin.tsx),
// упрощена под масштаб этого продукта и переоформлена в нашей дизайн-системе
// (Tailwind/shadcn вместо их собственного CSS) — см. _private/docs для разбора
// оригинала. Ключевое архитектурное решение, тоже заимствованное: чистый HTTP
// polling, не WebSocket/SSE — backend сам перезапускается во время
// обновления, любое постоянное соединение гарантированно оборвётся.

interface UpdateStatus {
  state: 'idle' | 'updating' | 'failed'
  stepNo: number
  stepTotal: number
  stepName: string
  ts: string
}

interface VersionInfo {
  currentVersion: string
  latestVersion: string
  checkedAt: string
}

interface HistoryEntry {
  at: string
  fromVersion: string
  toVersion: string
  result: 'ok' | 'failed'
  message: string
}

interface UpdateReport {
  fromVersion: string
  toVersion: string
  finishedAt: string
  outcome: { update: string; deploy: string; healthcheck: string }
  message: string
}

interface Overview {
  installedVersion: string
  helper: { available: boolean; heartbeatAgeS: number | null }
  status: UpdateStatus | null
  running: boolean
  version: VersionInfo | null
  history: HistoryEntry[]
  report: UpdateReport | null
  canUpdate: boolean
}

const STEP_LABEL: Record<string, string> = {
  backup: 'Резервное копирование',
  fetching: 'Загрузка новой версии',
  building: 'Сборка образов',
  migrating: 'Применение миграций',
  restarting: 'Перезапуск сервисов',
  healthcheck: 'Проверка работоспособности',
  done: 'Готово',
  up_to_date: 'Уже на последней версии',
}

const OUTCOME_LABEL: Record<string, string> = {
  update: 'Обновление кода',
  deploy: 'Развёртывание',
  healthcheck: 'Работоспособность',
}

export function UpdateTab() {
  const queryClient = useQueryClient()
  const [confirmOpen, setConfirmOpen] = useState(false)
  const logRef = useRef<HTMLPreElement>(null)
  const logOffset = useRef(0)
  const [log, setLog] = useState('')

  const { data: ov } = useQuery({
    queryKey: ['admin', 'update', 'overview'],
    queryFn: () => api.get<Overview>('/admin/update/overview').then((r) => r.data),
    // Чаще во время обновления, реже в покое — то же решение, что в
    // «Переговорке» (1.5с/8с там; здесь немного мягче, т.к. у нас нет
    // активных встреч, которым критична задержка).
    refetchInterval: (query) => (query.state.data?.running ? 2000 : 8000),
  })

  const running = ov?.running ?? false

  // Лог тянем отдельным поллингом (не вместе с overview — он может быть
  // большим, не нужно гонять целиком при каждом опросе статуса).
  useEffect(() => {
    if (!running) return
    const fetchLog = () => {
      api
        .get<{ offset: number; text: string; reset: boolean }>('/admin/update/log', {
          params: { offset: logOffset.current },
        })
        .then((r) => {
          if (r.data.reset) setLog(r.data.text)
          else setLog((prev) => prev + r.data.text)
          logOffset.current = r.data.offset
        })
        .catch(() => {})
    }
    fetchLog()
    const t = window.setInterval(fetchLog, 2000)
    return () => window.clearInterval(t)
  }, [running])

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight })
  }, [log])

  const actionMutation = useMutation({
    mutationFn: (action: 'check' | 'update' | 'backup') => api.post('/admin/update/action', { action }),
    onSuccess: (_, action) => {
      if (action === 'update') {
        logOffset.current = 0
        setLog('')
      }
      queryClient.invalidateQueries({ queryKey: ['admin', 'update', 'overview'] })
      toast.success(
        action === 'check' ? 'Проверка запущена' : action === 'backup' ? 'Резервное копирование запущено' : 'Обновление запущено',
      )
      setConfirmOpen(false)
    },
    onError: (err: any) => toast.error(err.response?.data?.message ?? 'Не удалось выполнить действие'),
  })

  const hasUpdate = ov?.version && ov.version.latestVersion && ov.version.latestVersion !== ov.installedVersion

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Версии</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <VersionBlock label="Установлено" value={ov?.installedVersion ?? '—'} />
            <VersionBlock
              label="Доступно на GitHub"
              value={ov?.version?.latestVersion ?? '—'}
              hint={ov?.version ? `проверено ${new Date(ov.version.checkedAt).toLocaleString('ru-RU')}` : 'ещё не проверялось'}
            />
            <div className="flex flex-col gap-1">
              <span className="text-sm text-muted-foreground">Помощник обновлений</span>
              <HelperBadge available={ov?.helper.available ?? false} ageS={ov?.helper.heartbeatAgeS ?? null} />
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <Button
              variant="outline"
              onClick={() => actionMutation.mutate('check')}
              disabled={running || actionMutation.isPending}
            >
              <RefreshCw className="size-4" />
              Проверить обновления
            </Button>
            <Button
              variant="outline"
              onClick={() => actionMutation.mutate('backup')}
              disabled={running || actionMutation.isPending}
            >
              <Download className="size-4" />
              Сделать резервную копию
            </Button>
            <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
              <DialogTrigger
                render={
                  <Button disabled={!hasUpdate || running || !ov?.canUpdate}>
                    <ArrowUpCircle className="size-4" />
                    Обновить до {ov?.version?.latestVersion ?? '…'}
                  </Button>
                }
              />
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Подтвердите обновление</DialogTitle>
                </DialogHeader>
                <div className="flex flex-col gap-4">
                  <p className="text-sm">
                    Система будет обновлена с <strong>{ov?.installedVersion}</strong> до{' '}
                    <strong>{ov?.version?.latestVersion}</strong>. Перед применением автоматически создаётся
                    резервная копия; если миграция базы данных или проверка работоспособности не пройдёт —
                    произойдёт автоматический откат.
                  </p>
                  <Button onClick={() => actionMutation.mutate('update')} disabled={actionMutation.isPending}>
                    {actionMutation.isPending ? 'Запуск…' : 'Да, обновить'}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>

          {!ov?.helper.available && (
            <p className="mt-3 text-sm text-muted-foreground">
              Помощник обновлений не отвечает — обновление из веб-интерфейса недоступно. Проверьте, что установщик
              выполнил этап настройки root-helper (<code className="rounded bg-muted px-1">./scripts/install.sh</code>
              ), либо обновите вручную — см. docs/UPDATE.md.
            </p>
          )}
        </CardContent>
      </Card>

      {(running || ov?.status) && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Ход обновления</CardTitle>
              {running ? (
                <Badge className="gap-1">
                  <RefreshCw className="size-3 animate-spin" />
                  Выполняется
                </Badge>
              ) : ov?.status?.state === 'failed' ? (
                <Badge variant="destructive">Остановлено с ошибкой</Badge>
              ) : (
                <Badge className="gap-1 bg-success text-success-foreground">
                  <CheckCircle2 className="size-3" />
                  Завершено
                </Badge>
              )}
            </div>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {ov?.status && (
              <div className="flex flex-col gap-1.5">
                <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full bg-primary transition-[width] duration-500"
                    style={{ width: `${(ov.status.stepNo / Math.max(ov.status.stepTotal, 1)) * 100}%` }}
                  />
                </div>
                <p className="text-sm text-muted-foreground">
                  {ov.status.stepTotal > 0 &&
                    `Этап ${ov.status.stepNo} из ${ov.status.stepTotal}: `}
                  {STEP_LABEL[ov.status.stepName] ?? ov.status.stepName}
                </p>
              </div>
            )}
            {log && (
              <pre
                ref={logRef}
                className="max-h-64 overflow-y-auto rounded-lg bg-muted p-3 font-mono text-xs leading-relaxed"
              >
                {log}
              </pre>
            )}
          </CardContent>
        </Card>
      )}

      {ov?.report && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Итог последнего обновления: {ov.report.fromVersion} → {ov.report.toVersion}
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <ul className="flex flex-col gap-1.5">
              {Object.entries(ov.report.outcome).map(([key, value]) => (
                <li key={key} className="flex items-center gap-2 text-sm">
                  {value === 'ok' ? (
                    <CheckCircle2 className="size-4 text-success" />
                  ) : value === 'skipped' ? (
                    <span className="size-4 shrink-0 rounded-full bg-muted" />
                  ) : (
                    <XCircle className="size-4 text-destructive" />
                  )}
                  <span>{OUTCOME_LABEL[key] ?? key}</span>
                  <Badge variant="outline" className="text-xs">
                    {value}
                  </Badge>
                </li>
              ))}
            </ul>
            <p className="text-sm text-muted-foreground">{ov.report.message}</p>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">История обновлений</CardTitle>
        </CardHeader>
        <CardContent>
          {!ov?.history.length ? (
            <p className="text-sm text-muted-foreground">Обновления ещё не запускались.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Когда</TableHead>
                  <TableHead>Версия</TableHead>
                  <TableHead>Результат</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ov.history.map((h, i) => (
                  <TableRow key={i}>
                    <TableCell className="text-sm text-muted-foreground">
                      {new Date(h.at).toLocaleString('ru-RU')}
                    </TableCell>
                    <TableCell className="font-mono text-sm">
                      {h.fromVersion} → {h.toVersion}
                    </TableCell>
                    <TableCell>
                      {h.result === 'ok' ? (
                        <Badge className="bg-success text-success-foreground">успешно</Badge>
                      ) : (
                        <Badge variant="destructive">ошибка</Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function VersionBlock({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="font-mono text-lg font-semibold tabular-nums">{value}</span>
      {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
    </div>
  )
}

function HelperBadge({ available, ageS }: { available: boolean; ageS: number | null }) {
  if (available) {
    return (
      <Badge className="w-fit gap-1 bg-success text-success-foreground">
        <CheckCircle2 className="size-3" />
        Работает {ageS !== null && `(пульс ${ageS}с назад)`}
      </Badge>
    )
  }
  return (
    <Badge variant="destructive" className="w-fit gap-1">
      <XCircle className="size-3" />
      Не отвечает
    </Badge>
  )
}
