export type Complex = { re: number; im: number }
export type GateName = 'H' | 'X' | 'Y' | 'Z' | 'S' | 'T' | 'RX' | 'RY' | 'RZ' | 'CNOT' | 'M'
export type Operation = { id: string; gate: GateName; qubit: number; target?: number; angle?: number }
export type BasisStateData = {
  index: number
  label: string
  amplitude: Complex
  magnitude: number
  probability: number
  phase: number
  measurementProbability: number
  measurementCount: number | null
}
export type ReducedQubitState = {
  qubit: number
  densityMatrix: [[Complex, Complex], [Complex, Complex]]
  probabilities: [number, number]
  blochVector: [number, number, number]
}
export type QuantumVisualizationData = {
  qubits: number
  circuit: Operation[]
  activeGates: Operation[]
  amplitudes: Complex[]
  probabilities: number[]
  basisStates: BasisStateData[]
  measurementDistribution: number[]
  measurementResults: number[] | null
  qubitStates: ReducedQubitState[]
  blochVectors: [number, number, number][]
  entanglement: { concurrence: number; isEntangled: boolean }
}

const c = (re = 0, im = 0): Complex => ({ re, im })
const add = (a: Complex, b: Complex): Complex => c(a.re + b.re, a.im + b.im)
const mul = (a: Complex, b: Complex): Complex => c(a.re * b.re - a.im * b.im, a.re * b.im + a.im * b.re)
const matrices: Partial<Record<GateName, Complex[][]>> = {
  H: [[c(Math.SQRT1_2), c(Math.SQRT1_2)], [c(Math.SQRT1_2), c(-Math.SQRT1_2)]],
  X: [[c(), c(1)], [c(1), c()]],
  Y: [[c(), c(0, -1)], [c(0, 1), c()]],
  Z: [[c(1), c()], [c(), c(-1)]],
  S: [[c(1), c()], [c(), c(0, 1)]],
  T: [[c(1), c()], [c(), c(Math.SQRT1_2, Math.SQRT1_2)]],
}

function matrix(operation: Operation): Complex[][] {
  const fixed = matrices[operation.gate]
  if (fixed) return fixed
  const theta = (operation.angle ?? 90) * Math.PI / 180
  const cosine = Math.cos(theta / 2)
  const sine = Math.sin(theta / 2)
  if (operation.gate === 'RX') return [[c(cosine), c(0, -sine)], [c(0, -sine), c(cosine)]]
  if (operation.gate === 'RY') return [[c(cosine), c(-sine)], [c(sine), c(cosine)]]
  return [[c(Math.cos(-theta / 2), Math.sin(-theta / 2)), c()], [c(), c(Math.cos(theta / 2), Math.sin(theta / 2))]]
}

function bitMask(qubit: number): number {
  return 1 << (1 - qubit)
}

function applySingle(state: Complex[], qubit: number, gate: Complex[][]): Complex[] {
  const out = state.map(value => c(value.re, value.im))
  const mask = bitMask(qubit)
  for (let index = 0; index < state.length; index++) {
    if ((index & mask) !== 0) continue
    const paired = index | mask
    const zero = state[index]
    const one = state[paired]
    out[index] = add(mul(gate[0][0], zero), mul(gate[0][1], one))
    out[paired] = add(mul(gate[1][0], zero), mul(gate[1][1], one))
  }
  return out
}

function applyCnot(state: Complex[], control: number, target: number): Complex[] {
  const out = state.map(value => c(value.re, value.im))
  const controlMask = bitMask(control)
  const targetMask = bitMask(target)
  for (let index = 0; index < state.length; index++) {
    if ((index & controlMask) === 0 || (index & targetMask) !== 0) continue
    const paired = index | targetMask
    out[index] = state[paired]
    out[paired] = state[index]
  }
  return out
}

export function simulate(operations: Operation[]): Complex[] {
  let state = [c(1), c(), c(), c()]
  for (const operation of operations) {
    if (operation.qubit < 0 || operation.qubit > 1) throw new RangeError(`Invalid qubit ${operation.qubit}`)
    if (operation.gate === 'M') continue
    if (operation.gate === 'CNOT') {
      const target = operation.target ?? 1 - operation.qubit
      if (target < 0 || target > 1 || target === operation.qubit) throw new RangeError('CNOT needs distinct control and target qubits')
      state = applyCnot(state, operation.qubit, target)
    } else {
      state = applySingle(state, operation.qubit, matrix(operation))
    }
  }
  return state
}

export function probs(state: Complex[]): number[] {
  return state.map(value => value.re * value.re + value.im * value.im)
}

function conjugate(value: Complex): Complex {
  return c(value.re, -value.im)
}

function sumComplex(values: Complex[]): Complex {
  return values.reduce((sum, value) => add(sum, value), c())
}

function reducedQubitState(state: Complex[], qubit: number): ReducedQubitState {
  const mask = bitMask(qubit)
  const zero = state.filter((_, index) => (index & mask) === 0)
  const one = state.filter((_, index) => (index & mask) !== 0)
  const rho00 = c(zero.reduce((sum, value) => sum + value.re * value.re + value.im * value.im, 0))
  const rho11 = c(one.reduce((sum, value) => sum + value.re * value.re + value.im * value.im, 0))
  const rho01 = sumComplex(zero.map((value, index) => mul(value, conjugate(one[index]))))
  const rho10 = conjugate(rho01)
  const blochVector: [number, number, number] = [
    2 * rho01.re,
    -2 * rho01.im,
    rho00.re - rho11.re,
  ]
  return {
    qubit,
    densityMatrix: [[rho00, rho01], [rho10, rho11]],
    probabilities: [rho00.re, rho11.re],
    blochVector,
  }
}

export function deriveQuantumVisualizationData(
  circuit: Operation[],
  measurementResults: number[] | null = null,
): QuantumVisualizationData {
  const amplitudes = simulate(circuit)
  const probabilities = probs(amplitudes)
  const basisStates = amplitudes.map((amplitude, index): BasisStateData => ({
    index,
    label: index.toString(2).padStart(2, '0'),
    amplitude,
    magnitude: Math.hypot(amplitude.re, amplitude.im),
    probability: probabilities[index],
    phase: Math.atan2(amplitude.im, amplitude.re),
    measurementProbability: probabilities[index],
    measurementCount: measurementResults?.[index] ?? null,
  }))
  const qubitStates = [reducedQubitState(amplitudes, 0), reducedQubitState(amplitudes, 1)]
  const concurrenceValue = concurrence(amplitudes)
  return {
    qubits: 2,
    circuit: circuit.map(operation => ({ ...operation })),
    activeGates: circuit.filter(operation => operation.gate !== 'M').map(operation => ({ ...operation })),
    amplitudes,
    probabilities,
    basisStates,
    measurementDistribution: probabilities,
    measurementResults: measurementResults ? [...measurementResults] : null,
    qubitStates,
    blochVectors: qubitStates.map(qubit => qubit.blochVector),
    entanglement: { concurrence: concurrenceValue, isEntangled: concurrenceValue > 1e-10 },
  }
}

export function fmt(value: Complex): string {
  const rounded = (number: number) => Math.abs(number) < 0.0001 ? '0' : number.toFixed(3)
  if (Math.abs(value.im) < 0.0001) return rounded(value.re)
  if (Math.abs(value.re) < 0.0001) return `${rounded(value.im)}i`
  return `${rounded(value.re)} ${value.im < 0 ? '-' : '+'} ${rounded(Math.abs(value.im))}i`
}

export function sample(probabilities: number[], shots = 256): number[] {
  const counts = [0, 0, 0, 0]
  const total = probabilities.reduce((sum, probability) => sum + probability, 0)
  if (total <= 0) throw new RangeError('Cannot measure a state with zero total probability')
  for (let shot = 0; shot < shots; shot++) {
    const random = Math.random() * total
    let cumulative = 0
    for (let index = 0; index < counts.length; index++) {
      cumulative += probabilities[index]
      if (random < cumulative || index === counts.length - 1) {
        counts[index]++
        break
      }
    }
  }
  return counts
}

export function blochVector(state: Complex[], qubit = 0): [number, number, number] {
  if (qubit < 0 || qubit > 1) throw new RangeError(`Invalid qubit ${qubit}`)
  return reducedQubitState(state, qubit).blochVector
}

export function concurrence(state: Complex[]): number {
  const first = mul(state[0], state[3])
  const second = mul(state[1], state[2])
  return Math.min(1, 2 * Math.hypot(first.re - second.re, first.im - second.im))
}
