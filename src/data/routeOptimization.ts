export type RouteCandidate = { bitstring: string; route: string[]; cost: number }
export type RouteEdge = { from: string; to: string; cost: number }

export const routeEdges: RouteEdge[] = [
  { from: 'A', to: 'B', cost: 3 },
  { from: 'B', to: 'C', cost: 4 },
  { from: 'C', to: 'D', cost: 3 },
  { from: 'D', to: 'A', cost: 4 },
  { from: 'A', to: 'C', cost: 6 },
  { from: 'B', to: 'D', cost: 7 },
]

const routePermutations: Array<{ bitstring: string; route: string[] }> = [
  { bitstring: '00', route: ['A', 'B', 'C', 'D', 'A'] },
  { bitstring: '01', route: ['A', 'B', 'D', 'C', 'A'] },
  { bitstring: '10', route: ['A', 'C', 'B', 'D', 'A'] },
  { bitstring: '11', route: ['A', 'C', 'D', 'B', 'A'] },
]

export function routeCost(route: string[]): number {
  let total = 0
  for (let index = 0; index < route.length - 1; index++) {
    const from = route[index]
    const to = route[index + 1]
    const edge = routeEdges.find(item => (item.from === from && item.to === to) || (item.from === to && item.to === from))
    if (!edge) throw new RangeError(`No route edge exists between ${from} and ${to}`)
    total += edge.cost
  }
  return total
}

export const routeCandidates: RouteCandidate[] = routePermutations.map(candidate => ({
  ...candidate,
  cost: routeCost(candidate.route),
}))

export function getCandidate(bitstring: string): RouteCandidate {
  const candidate = routeCandidates.find(item => item.bitstring === bitstring)
  if (!candidate) throw new RangeError(`No route candidate maps to bitstring ${bitstring}`)
  return candidate
}

export function findClassicalBaseline(): RouteCandidate {
  return routeCandidates.reduce((best, candidate) => candidate.cost < best.cost ? candidate : best)
}
