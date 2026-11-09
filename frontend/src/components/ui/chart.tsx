import * as React from "react"
import * as RechartsPrimitive from "recharts"
import { cn } from "cn"

// Упрощённый вариант официального shadcn/ui chart-wrapper поверх Recharts:
// задаёт цвета графика через CSS-переменные (--color-KEY), так что они
// автоматически следуют теме приложения (light/dark), без заведения
// отдельной палитры именно для графиков.
export type ChartConfig = Record<
  string,
  { label: string; color: string }
>

const ChartContext = React.createContext<ChartConfig | null>(null)

function useChartConfig() {
  const ctx = React.useContext(ChartContext)
  if (!ctx) throw new Error("Компоненты графика должны быть внутри <ChartContainer>")
  return ctx
}

function ChartContainer({
  config,
  className,
  children,
  ...props
}: React.ComponentProps<"div"> & {
  config: ChartConfig
  children: React.ComponentProps<typeof RechartsPrimitive.ResponsiveContainer>["children"]
}) {
  const style = Object.fromEntries(
    Object.entries(config).map(([key, value]) => [`--color-${key}`, value.color]),
  ) as React.CSSProperties

  return (
    <ChartContext.Provider value={config}>
      <div
        data-slot="chart"
        className={cn("aspect-auto h-[250px] w-full", className)}
        style={style}
        {...props}
      >
        <RechartsPrimitive.ResponsiveContainer>{children}</RechartsPrimitive.ResponsiveContainer>
      </div>
    </ChartContext.Provider>
  )
}

function ChartTooltipContent({
  active,
  payload,
  label,
}: {
  active?: boolean
  payload?: Array<{ name?: string; value?: number | string; dataKey?: string; color?: string }>
  label?: string
}) {
  const config = useChartConfig()
  if (!active || !payload?.length) return null

  return (
    <div className="grid min-w-32 gap-1.5 rounded-lg border bg-popover px-3 py-2 text-sm text-popover-foreground shadow-md">
      {label ? <div className="font-medium">{label}</div> : null}
      {payload.map((item) => {
        const key = item.dataKey ?? item.name ?? ""
        const entry = config[key as string]
        return (
          <div key={key} className="flex items-center gap-2">
            <span
              className="size-2 shrink-0 rounded-full"
              style={{ backgroundColor: item.color }}
            />
            <span className="text-muted-foreground">{entry?.label ?? item.name}</span>
            <span className="ml-auto font-medium tabular-nums">{item.value}</span>
          </div>
        )
      })}
    </div>
  )
}

export { ChartContainer, ChartTooltipContent, RechartsPrimitive as Recharts }
