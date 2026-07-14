// Lane packing for the hourly grid: overlapping timed blocks are placed in
// side-by-side lanes so none obscure each other. Simple greedy interval colouring.

export type Timed = { startMinute: number; minutes: number }

export type Placed<T> = {
  item: T
  lane: number // 0-based column within its overlap cluster
  lanes: number // total columns in that cluster
}

export function packLanes<T extends Timed>(items: T[]): Placed<T>[] {
  const sorted = [...items].sort(
    (a, b) => a.startMinute - b.startMinute || b.minutes - a.minutes,
  )
  const result: Placed<T>[] = []
  let cluster: Placed<T>[] = []
  let clusterEnd = -1

  const flush = () => {
    const lanes = cluster.reduce((max, p) => Math.max(max, p.lane + 1), 0)
    for (const p of cluster) p.lanes = lanes
    result.push(...cluster)
    cluster = []
  }

  for (const item of sorted) {
    const start = item.startMinute
    const end = item.startMinute + item.minutes
    if (start >= clusterEnd && cluster.length) flush()
    // Find the first free lane within the running cluster.
    const taken = new Set(
      cluster
        .filter((p) => p.item.startMinute + p.item.minutes > start)
        .map((p) => p.lane),
    )
    let lane = 0
    while (taken.has(lane)) lane++
    cluster.push({ item, lane, lanes: 1 })
    clusterEnd = Math.max(clusterEnd, end)
  }
  if (cluster.length) flush()
  return result
}
