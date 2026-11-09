import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Plus, FileText, Globe, ShieldAlert } from 'lucide-react'

interface LandingPage {
  id: string
  name: string
  slug: string
  formEnabled: boolean
  capturesCredentials: boolean
  screenshotPath: string | null
  sourceUrl: string | null
  domainId: string | null
  updatedAt: string
}

export default function PagesPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['pages'],
    queryFn: () => api.get<LandingPage[]>('/pages').then((r) => r.data),
  })

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Учебные страницы</h1>
          <p className="text-muted-foreground">
            Страницы, на которые ведут ссылки из писем. По умолчанию сохраняется только факт отправки формы.
          </p>
        </div>
        <Button render={<Link to="/pages/new" />}>
          <Plus className="size-4" />
          Новая страница
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {isLoading && <p className="text-muted-foreground">Загрузка…</p>}
        {!isLoading && data?.length === 0 && (
          <p className="text-muted-foreground">Страниц пока нет — создайте первую.</p>
        )}
        {data?.map((page) => (
          <Link key={page.id} to={`/pages/${page.id}/edit`} className="block">
            <Card className="overflow-hidden transition-colors hover:border-primary/40">
              {/* Превью опционально (требует отдельного screenshot-service,
                  см. docs/CONFIGURATION.md) — без него просто placeholder,
                  не ошибка. */}
              <div className="flex aspect-video items-center justify-center border-b bg-muted">
                {page.screenshotPath ? (
                  <img
                    src={`/api/pages/${page.id}/screenshot`}
                    alt={`Превью страницы ${page.name}`}
                    className="h-full w-full object-cover object-top"
                  />
                ) : (
                  <FileText className="size-8 text-muted-foreground" />
                )}
              </div>
              <CardHeader className="flex flex-row items-start justify-between pb-2">
                <CardTitle className="text-base">{page.name}</CardTitle>
              </CardHeader>
              <CardContent>
                <code className="text-sm text-muted-foreground">/lp/{page.slug}</code>
                <div className="mt-2 flex flex-wrap gap-1">
                  <Badge variant={page.formEnabled ? 'default' : 'secondary'}>
                    {page.formEnabled ? 'С отслеживанием формы' : 'Без формы'}
                  </Badge>
                  {page.capturesCredentials && (
                    <Badge className="gap-1 bg-warning text-warning-foreground">
                      <ShieldAlert className="size-3" />
                      Захват значений
                    </Badge>
                  )}
                  {page.domainId && (
                    <Badge variant="outline" className="gap-1">
                      <Globe className="size-3" />
                      Свой домен
                    </Badge>
                  )}
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  )
}
