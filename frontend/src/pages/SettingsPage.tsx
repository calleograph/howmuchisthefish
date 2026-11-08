import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { Plus, Server, CheckCircle2, XCircle } from 'lucide-react'
import { toast } from 'sonner'

interface SmtpConfig {
  id: string
  name: string
  host: string
  port: number
  secure: boolean
  fromAddress: string
  hasPassword: boolean
  lastTestOk: boolean | null
}

export default function SettingsPage() {
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [host, setHost] = useState('')
  const [port, setPort] = useState('587')
  const [secure, setSecure] = useState(true)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [fromAddress, setFromAddress] = useState('')

  const { data: smtps } = useQuery({
    queryKey: ['smtps'],
    queryFn: () => api.get<SmtpConfig[]>('/smtps').then((r) => r.data),
  })

  const createMutation = useMutation({
    mutationFn: () =>
      api.post('/smtps', {
        name,
        host,
        port: Number(port),
        secure,
        username: username || undefined,
        password: password || undefined,
        fromAddress,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['smtps'] })
      toast.success('SMTP-подключение добавлено')
      setOpen(false)
    },
    onError: (err: any) => toast.error(err.response?.data?.message ?? 'Не удалось сохранить'),
  })

  const testMutation = useMutation({
    mutationFn: ({ id, toAddress }: { id: string; toAddress: string }) =>
      api.post(`/smtps/${id}/test`, { toAddress }).then((r) => r.data),
    onSuccess: (result, vars) => {
      queryClient.invalidateQueries({ queryKey: ['smtps'] })
      if (result.ok) toast.success(`Тестовое письмо отправлено на ${vars.toAddress}`)
      else toast.error(`Ошибка подключения: ${result.error}`)
    },
  })

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Настройки</h1>
          <p className="text-muted-foreground">SMTP-подключения для отправки учебных писем</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger
            render={
              <Button>
                <Plus className="size-4" />
                Новое подключение
              </Button>
            }
          />
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Новое SMTP-подключение</DialogTitle>
            </DialogHeader>
            <div className="flex flex-col gap-4">
              <Field label="Название" value={name} onChange={setName} />
              <Field label="Хост" value={host} onChange={setHost} placeholder="smtp.example.com" />
              <Field label="Порт" value={port} onChange={setPort} />
              <div className="flex items-center gap-2">
                <Switch checked={secure} onCheckedChange={setSecure} />
                <Label>TLS/STARTTLS</Label>
              </div>
              <Field label="Пользователь (опционально)" value={username} onChange={setUsername} />
              <Field label="Пароль (опционально)" value={password} onChange={setPassword} type="password" />
              <Field label="Адрес отправителя" value={fromAddress} onChange={setFromAddress} placeholder="security-training@example.local" />
              <Button
                onClick={() => createMutation.mutate()}
                disabled={!name || !host || !fromAddress || createMutation.isPending}
              >
                {createMutation.isPending ? 'Сохранение…' : 'Сохранить'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {smtps?.map((smtp) => (
          <Card key={smtp.id}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <Server className="size-4" />
                {smtp.name}
              </CardTitle>
              {smtp.lastTestOk === true && <CheckCircle2 className="size-4 text-success" />}
              {smtp.lastTestOk === false && <XCircle className="size-4 text-destructive" />}
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              <p className="text-sm text-muted-foreground">
                {smtp.host}:{smtp.port} {smtp.secure && <Badge variant="outline">TLS</Badge>}
              </p>
              <p className="text-sm">От: {smtp.fromAddress}</p>
              <TestButton smtpId={smtp.id} onTest={(toAddress) => testMutation.mutate({ id: smtp.id, toAddress })} />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}

function Field({
  label,
  value,
  onChange,
  type = 'text',
  placeholder,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  type?: string
  placeholder?: string
}) {
  return (
    <div className="flex flex-col gap-2">
      <Label>{label}</Label>
      <Input type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
    </div>
  )
}

function TestButton({ onTest }: { smtpId: string; onTest: (toAddress: string) => void }) {
  const [toAddress, setToAddress] = useState('')
  return (
    <div className="flex gap-2">
      <Input
        placeholder="test@example.local"
        value={toAddress}
        onChange={(e) => setToAddress(e.target.value)}
        className="h-8"
      />
      <Button size="sm" variant="outline" disabled={!toAddress} onClick={() => onTest(toAddress)}>
        Тест
      </Button>
    </div>
  )
}
