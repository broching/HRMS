import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

export function DepartmentBreakdown({
  data,
}: {
  data: { name: string; count: number }[]
}) {
  const max = Math.max(1, ...data.map((d) => d.count))
  return (
    <Card>
      <CardHeader>
        <CardTitle>Headcount by department</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-2.5">
        {data.length === 0 ? (
          <p className="text-muted-foreground text-sm">No departments yet.</p>
        ) : (
          data.map((d) => (
            <div key={d.name} className="flex items-center gap-3 text-sm">
              <span className="w-28 shrink-0 truncate">{d.name}</span>
              <div className="bg-muted h-2 flex-1 overflow-hidden rounded-full">
                <div
                  className="bg-primary h-2 rounded-full"
                  style={{ width: `${(d.count / max) * 100}%` }}
                />
              </div>
              <span className="w-6 text-right tabular-nums">{d.count}</span>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  )
}
