import React, { useEffect, useMemo, useState } from 'react'
import { deriveQuantumVisualizationData, fmt, sample, type GateName, type Operation, type QuantumVisualizationData } from './quantum/simulator'
import { findExperiment, learningExperiments, type LearningExperiment } from './data/experiments'
import { findClassicalBaseline, getCandidate, routeCandidates, routeEdges } from './data/routeOptimization'
import type { AriaContext, AriaEvent } from './components/aria/AriaCompanion'
import { AppShell } from './components/layout/AppShell'
import { useAppRouter } from './hooks/useAppRouter'
import { AuthPage } from './pages/AuthPage'
import { DashboardPage } from './pages/DashboardPage'
import { ExperimentsPage } from './pages/ExperimentsPage'
import { HomePage } from './pages/HomePage'
import type { AppPage } from './routes/routes'
import { endDemoSession, readDemoUser, startDemoSession, type DemoUser } from './services/demoAuth'

const QuantumScene = React.lazy(() => import('./components/three/QuantumScene').then(module => ({ default: module.QuantumScene })))

const palette: GateName[] = ['H', 'X', 'Y', 'Z', 'S', 'T', 'RX', 'RY', 'RZ', 'CNOT', 'M']
type Learner = {
  experiments: number
  predictions: number
  correct: number
  focus?: string
  mistakes: Record<string, number>
  completedExperiments: string[]
  skills: Record<string, number>
}
type AiMode = 'EXPLAIN' | 'HINT' | 'WHY' | 'NEXT' | 'MISTAKE'
type CircuitSnapshot = { data: QuantumVisualizationData; circuit: Operation[]; label: string }
const initialLearner: Learner = {
  experiments: 0,
  predictions: 0,
  correct: 0,
  mistakes: {},
  completedExperiments: [],
  skills: { Superposition: 45, Measurement: 45, Entanglement: 35, Phase: 30, 'Quantum Gates': 45, 'Quantum Algorithms': 20 },
}

function createOperation(gate: GateName, qubit: number, target?: number, angle = 90): Operation {
  return { id: crypto.randomUUID(), gate, qubit, target, angle }
}

const bellCircuit = (): Operation[] => [createOperation('H', 0), createOperation('CNOT', 0, 1), createOperation('M', 0), createOperation('M', 1)]
const qaoaCircuit = (): Operation[] => [
  createOperation('H', 0),
  createOperation('H', 1),
  createOperation('CNOT', 0, 1),
  createOperation('RZ', 1, undefined, 135),
  createOperation('CNOT', 0, 1),
  createOperation('RY', 0, undefined, 70),
]

function loadLearner(): Learner {
  try {
    const stored = window.localStorage.getItem('aspiro-learner')
    if (!stored) return initialLearner
    const parsed = JSON.parse(stored) as Learner
    if (typeof parsed.experiments !== 'number' || typeof parsed.correct !== 'number' || !parsed.skills) return initialLearner
    const legacySkills = { ...parsed.skills }
    if (typeof legacySkills.Algorithms === 'number' && typeof legacySkills['Quantum Algorithms'] !== 'number') {
      legacySkills['Quantum Algorithms'] = legacySkills.Algorithms
      delete legacySkills.Algorithms
    }
    return {
      ...initialLearner,
      ...parsed,
      predictions: typeof parsed.predictions === 'number' ? parsed.predictions : parsed.experiments,
      mistakes: parsed.mistakes ?? {},
      completedExperiments: parsed.completedExperiments ?? [],
      skills: { ...initialLearner.skills, ...legacySkills },
    }
  } catch (error) {
    console.warn('Could not restore the ASPIRO learner profile; starting a fresh session.', error)
    return initialLearner
  }
}

function operationsFor(experiment: LearningExperiment): Operation[] {
  return experiment.startingCircuit.map(operation => createOperation(operation.gate, operation.qubit, operation.target, operation.angle ?? 90))
}

function generatedCode(operations: Operation[]): string {
  const instructions = operations.map(operation => {
    if (operation.gate === 'M') return `qc.measure(${operation.qubit}, ${operation.qubit})`
    if (operation.gate === 'CNOT') return `qc.cx(${operation.qubit}, ${operation.target ?? 1 - operation.qubit})`
    if (operation.gate.startsWith('R')) return `qc.${operation.gate.toLowerCase()}(${((operation.angle ?? 90) * Math.PI / 180).toFixed(3)}, ${operation.qubit})`
    return `qc.${operation.gate.toLowerCase()}(${operation.qubit})`
  })
  return `from qiskit import QuantumCircuit\n\nqc = QuantumCircuit(2)\n${instructions.length ? `\n${instructions.join('\n')}` : ''}`
}

function parseCode(source: string): Operation[] {
  const operations: Operation[] = []
  for (const [index, rawLine] of source.split(/\r?\n/).entries()) {
    const line = rawLine.split('#')[0].trim()
    if (!line || line === 'from qiskit import QuantumCircuit' || line === 'qc = QuantumCircuit(2)' || line === 'qc.measure_all()') {
      if (line === 'qc.measure_all()') {
        operations.push(createOperation('M', 0), createOperation('M', 1))
      }
      continue
    }
    const cx = line.match(/^qc\.cx\(\s*([01])\s*,\s*([01])\s*\)$/)
    if (cx) {
      if (cx[1] === cx[2]) throw new Error(`Line ${index + 1}: CNOT control and target must be different.`)
      operations.push(createOperation('CNOT', Number(cx[1]), Number(cx[2])))
      continue
    }
    const rotation = line.match(/^qc\.(rx|ry|rz)\(\s*(-?(?:\d+(?:\.\d*)?|\.\d+))\s*,\s*([01])\s*\)$/i)
    if (rotation) {
      operations.push(createOperation(rotation[1].toUpperCase() as GateName, Number(rotation[3]), undefined, Number(rotation[2]) * 180 / Math.PI))
      continue
    }
    const measurement = line.match(/^qc\.measure\(\s*([01])\s*,\s*[01]\s*\)$/)
    if (measurement) {
      operations.push(createOperation('M', Number(measurement[1])))
      continue
    }
    const gate = line.match(/^qc\.(h|x|y|z|s|t)\(\s*([01])\s*\)$/i)
    if (gate) {
      operations.push(createOperation(gate[1].toUpperCase() as GateName, Number(gate[2])))
      continue
    }
    throw new Error(`Line ${index + 1}: unsupported instruction. Use H, X, Y, Z, S, T, RX, RY, RZ, CX, or measurement.`)
  }
  return operations
}

function actualPrediction(experiment: LearningExperiment, simulation: QuantumVisualizationData): string {
  if (experiment.predictionKind === 'superposition') {
    const [zero, one] = simulation.qubitStates[0].probabilities
    if (Math.abs(zero - 0.5) < 0.03 && Math.abs(one - 0.5) < 0.03) return experiment.predictionOptions[0]
    return zero > one ? experiment.predictionOptions[1] : experiment.predictionOptions[2]
  }
  if (experiment.predictionKind === 'bell') {
    const [p00, p01, p10, p11] = simulation.probabilities
    if (Math.abs(p00 - 0.25) < 0.04 && Math.abs(p01 - 0.25) < 0.04 && Math.abs(p10 - 0.25) < 0.04 && Math.abs(p11 - 0.25) < 0.04) return experiment.predictionOptions[0]
    if (p00 + p11 > 0.98 && p00 > 0.01 && p11 > 0.01) return experiment.predictionOptions[1]
    if (p01 + p10 > 0.98 && p01 > 0.01 && p10 > 0.01) return experiment.predictionOptions[2]
    if (p11 + p01 > 0.98) return experiment.predictionOptions[3]
    return experiment.predictionOptions[4]
  }
  if (experiment.predictionKind === 'separability') {
    if (simulation.entanglement.concurrence > 0.01) return experiment.predictionOptions[0]
    if (simulation.probabilities[0] > 0.995) return experiment.predictionOptions[1]
    if (simulation.probabilities[3] > 0.995) return experiment.predictionOptions[2]
    return experiment.predictionOptions[3]
  }
  if (experiment.predictionKind === 'rotation') {
    const z = simulation.blochVectors[0][2]
    return z > 0.7 ? experiment.predictionOptions[0] : z < -0.7 ? experiment.predictionOptions[2] : experiment.predictionOptions[1]
  }
  const [p00, p01, p10, p11] = simulation.probabilities
  if (Math.abs(p00 - 0.5) < 0.03 && Math.abs(p10 - 0.5) < 0.03 && p01 < 0.03 && p11 < 0.03) return experiment.predictionOptions[0]
  if (p00 > 0.995) return experiment.predictionOptions[1]
  return experiment.predictionOptions[2]
}

type ExperimentContext = {
  simulation: QuantumVisualizationData
  previousSimulation: QuantumVisualizationData | null
  experiment: LearningExperiment
  prediction: string
  predictionCorrect: boolean | null
  measurementOutcome: string | null
  mastery: Record<string, number>
  mistakes: Record<string, number>
}

function aiResponse(mode: AiMode, context: ExperimentContext): string {
  const { simulation, experiment } = context
  const probabilities = simulation.probabilities
  const concurrenceValue = simulation.entanglement.concurrence
  const gateSummary = simulation.activeGates.map(operation => operation.gate === 'CNOT' ? `CNOT(${operation.qubit}→${operation.target})` : `${operation.gate}(Q${operation.qubit}${operation.angle !== undefined && operation.gate.startsWith('R') ? `, ${operation.angle}°` : ''})`).join(' → ') || 'no gates'
  const distribution = simulation.basisStates.filter(item => item.probability > 0.005).map(item => `|${item.label}⟩ ${(item.probability * 100).toFixed(1)}%`).join(', ') || 'no populated basis states'
  const outcome = context.measurementOutcome ? ` Most recent sampled outcome: |${context.measurementOutcome}⟩.` : ''
  const previous = context.previousSimulation
    ? ` Compared with the previous circuit, concurrence changed from ${context.previousSimulation.entanglement.concurrence.toFixed(2)} to ${concurrenceValue.toFixed(2)}.`
    : ''
  const bellPhi = concurrenceValue > 0.99 &&
    Math.abs(probabilities[0] - 0.5) < 0.01 &&
    Math.abs(probabilities[3] - 0.5) < 0.01 &&
    probabilities[1] < 0.01 &&
    probabilities[2] < 0.01

  if (mode === 'HINT') {
    return experiment.concept === 'Entanglement'
      ? 'Hint: look at which two basis probabilities are nonzero, then check the concurrence value. Try removing only the first gate and compare again.'
      : experiment.concept === 'Phase'
        ? 'Hint: watch the Q0 Bloch vector while you change the rotation angle. Compare its Z coordinate before and after.'
        : 'Hint: compare the Q0 reduced probabilities and the basis-state bars; the simulator derives both from the same amplitudes.'
  }
  if (mode === 'NEXT') {
    return `${recommendedReason(context)} Try next: ${recommendedExperiment(context).title}. ${recommendedExperiment(context).objective}`
  }
  if (mode === 'MISTAKE') {
    const misses = context.mistakes[experiment.concept] ?? 0
    return misses
      ? `You have ${misses} recorded incorrect prediction${misses === 1 ? '' : 's'} about ${experiment.concept}. Start with ${recommendedExperiment(context).title}: it isolates this concept with a simpler circuit.`
      : 'No recorded misconception for this concept yet. Make a prediction, run the experiment, and I’ll tailor feedback to the comparison.'
  }
  if (mode === 'WHY') {
    if (bellPhi) return 'For H(Q0), the amplitudes of |00⟩ and |10⟩ are each 1/√2. CNOT maps the |10⟩ branch to |11⟩, leaving amplitudes only at |00⟩ and |11⟩. Their squared magnitudes are each 1/2; the phase and amplitudes come from the simulator.'
    if (context.previousSimulation && context.previousSimulation.entanglement.concurrence > 0.01 && concurrenceValue <= 0.01) {
      return `Removing H leaves Q0 in |0⟩, so CNOT's control condition is never met. The state remains |00⟩ and concurrence falls to ${concurrenceValue.toFixed(2)}; the simulator data confirms the pair is separable.`
    }
    return `The circuit ${gateSummary} produces the current amplitudes. Probabilities are their squared magnitudes: ${distribution}. The reduced Q0 Bloch vector is (${simulation.blochVectors[0].map(value => value.toFixed(2)).join(', ')}).${outcome}`
  }
  if (bellPhi) {
    return `Objective: ${experiment.objective} H creates an equal superposition on Q0; CNOT correlates Q1 with it. The simulator gives ${distribution}, with concurrence ${concurrenceValue.toFixed(2)}.${outcome}`
  }
  if (concurrenceValue > 0.01) {
    return `Objective: ${experiment.objective} Current circuit: ${gateSummary}. The simulator reports concurrence ${concurrenceValue.toFixed(2)} and probabilities ${distribution}. A single Bloch sphere is only a reduced view of this entangled state.${outcome}`
  }
  return `Objective: ${experiment.objective} Current circuit: ${gateSummary}. The simulator gives ${distribution}; Q0 Bloch vector (${simulation.blochVectors[0].map(value => value.toFixed(2)).join(', ')}).${outcome}${previous}`
}

function recommendedReason(context: ExperimentContext): string {
  const [skill, score] = Object.entries(context.mastery).sort((a, b) => a[1] - b[1])[0] ?? [context.experiment.concept, 0]
  const mistakes = context.mistakes[context.experiment.concept] ?? 0
  if (mistakes >= 2) return `Recommended because you have made ${mistakes} recent ${context.experiment.concept} prediction errors; this next activity takes one concept at a time.`
  return `Recommended because ${context.experiment.concept === skill ? `you are focusing on ${skill} (${score}% mastery)` : `${skill} is currently your lowest mastery score (${score}%)`}.`
}

function recommendedExperiment(context: ExperimentContext): LearningExperiment {
  const mistakes = context.mistakes[context.experiment.concept] ?? 0
  if (mistakes >= 2) return findExperiment(context.experiment.concept === 'Entanglement' ? 'superposition' : 'predict-measurement')
  const weakest = Object.entries(context.mastery).sort((a, b) => a[1] - b[1])[0]?.[0]
  if (context.experiment.concept === 'Superposition' && (context.mastery.Superposition ?? 0) >= 85) return findExperiment('explore-rotation')
  if (context.experiment.concept === 'Entanglement' && (context.mastery.Entanglement ?? 0) < 50) {
    return findExperiment(context.experiment.id === 'break-entanglement' ? 'bell-state' : 'break-entanglement')
  }
  if (weakest === 'Entanglement') return findExperiment('bell-state')
  if (weakest === 'Measurement') return findExperiment('predict-measurement')
  if (weakest === 'Phase') return findExperiment('explore-rotation')
  if (weakest === 'Superposition') return findExperiment('superposition')
  return findExperiment('bell-state')
}

function App() {
  const { page, navigate } = useAppRouter()
  const setPage = (nextPage: AppPage) => navigate(nextPage)
  const [demoUser, setDemoUser] = useState<DemoUser | null>(readDemoUser)
  const [sessionError, setSessionError] = useState('')
  const [operations, setOperations] = useState<Operation[]>(() => operationsFor(findExperiment('bell-state')))
  const [selectedGate, setSelectedGate] = useState<GateName>('H')
  const [angle, setAngle] = useState(90)
  const [activeExperimentId, setActiveExperimentId] = useState('bell-state')
  const [prediction, setPrediction] = useState('')
  const [measured, setMeasured] = useState<number[] | null>(null)
  const [observedOutcome, setObservedOutcome] = useState<number | null>(null)
  const [shots, setShots] = useState(256)
  const [code, setCode] = useState(() => generatedCode(bellCircuit()))
  const [codeError, setCodeError] = useState('')
  const [learner, setLearner] = useState<Learner>(loadLearner)
  const [latestResult, setLatestResult] = useState<{ predicted: string; actual: string; correct: boolean } | null>(null)
  const [aiMode, setAiMode] = useState<AiMode>('EXPLAIN')
  const [aiQuestion, setAiQuestion] = useState('')
  const [aiQuestionResponse, setAiQuestionResponse] = useState('')
  const [comparisonBefore, setComparisonBefore] = useState<CircuitSnapshot | null>(null)
  const [ariaEvent, setAriaEvent] = useState<AriaEvent | null>(null)
  const [simulationResult, setSimulationResult] = useState<QuantumVisualizationData | null>(null)
  const [simulationError, setSimulationError] = useState('')

  const simulation = useMemo(() => deriveQuantumVisualizationData(operations, measured), [operations, measured])
  const activeExperiment = findExperiment(activeExperimentId)
  const actualOutcome = actualPrediction(activeExperiment, simulation)
  const bellState = simulation.entanglement.concurrence > 0.99 &&
    Math.abs(simulation.probabilities[0] - 0.5) < 0.01 &&
    Math.abs(simulation.probabilities[3] - 0.5) < 0.01 &&
    simulation.probabilities[1] < 0.01 &&
    simulation.probabilities[2] < 0.01

  function notifyAria(type: AriaEvent['type'], detail: string) {
    setAriaEvent({ id: Date.now() + Math.random(), type, detail })
  }

  useEffect(() => {
    setMeasured(null)
    setObservedOutcome(null)
    setCode(generatedCode(operations))
    setCodeError('')
    setLatestResult(null)
    setSimulationResult(null)
    setSimulationError('')
  }, [operations])

  useEffect(() => {
    try {
      window.localStorage.setItem('aspiro-learner', JSON.stringify(learner))
    } catch (error) {
      console.error('Could not save the ASPIRO learner profile.', error)
    }
  }, [learner])

  function addGate(qubit: number) {
    setOperations(current => [...current, createOperation(selectedGate, qubit, selectedGate === 'CNOT' ? 1 - qubit : undefined, angle)])
    setLatestResult(null)
  }

  function loadCircuit(circuit: Operation[]) {
    setOperations(circuit)
    setAngle([...circuit].reverse().find(operation => operation.gate.startsWith('R'))?.angle ?? 90)
    setPrediction('')
    setLatestResult(null)
    setComparisonBefore(null)
    setPage('lab')
  }

  function startExperiment(experimentId: string) {
    const experiment = findExperiment(experimentId)
    setActiveExperimentId(experiment.id)
    setComparisonBefore(null)
    setPrediction('')
    setMeasured(null)
    setObservedOutcome(null)
    setLatestResult(null)
    setOperations(operationsFor(experiment))
    setAngle([...experiment.startingCircuit].reverse().find(operation => operation.gate.startsWith('R'))?.angle ?? 90)
    setPage('lab')
    notifyAria('experiment_started', experiment.title)
  }

  function openApplication() {
    setActiveExperimentId('bell-state')
    setComparisonBefore(null)
    setPrediction('')
    setMeasured(null)
    setObservedOutcome(null)
    setOperations(qaoaCircuit())
    setPage('application')
  }

  function runSimulation() {
    try {
      setSimulationResult(deriveQuantumVisualizationData(operations, null))
      setSimulationError('')
    } catch (error) {
      setSimulationResult(null)
      setSimulationError(error instanceof Error ? error.message : 'The circuit could not be simulated.')
    }
  }

  function runWhatIf() {
    const gateToRemove = operations.find(operation => operation.gate === 'H')
    if (!gateToRemove) return
    setComparisonBefore({ data: simulation, circuit: operations.map(operation => ({ ...operation })), label: 'Before · current circuit' })
    setOperations(current => current.filter(operation => operation.id !== gateToRemove.id))
    setLatestResult(null)
    setAiMode('WHY')
    setAiQuestionResponse('')
    notifyAria('what_if_started', `Removed ${gateToRemove.gate} from ${activeExperiment.title}`)
  }

  function runMeasurement() {
    const counts = sample(simulation.measurementDistribution, shots)
    setMeasured(counts)
    let selectedShot = Math.floor(Math.random() * shots)
    let outcome = counts.findIndex(count => {
      selectedShot -= count
      return selectedShot < 0
    })
    if (outcome < 0) outcome = counts.findIndex(count => count > 0)
    setObservedOutcome(outcome >= 0 ? outcome : null)
    const correct = prediction ? prediction === actualOutcome : null
    if (prediction) setLatestResult({ predicted: prediction, actual: actualOutcome, correct: correct === true })
    const concept = activeExperiment.concept
    setLearner(current => ({
      experiments: current.experiments + 1,
      predictions: current.predictions + Number(correct !== null),
      correct: current.correct + Number(correct === true),
      mistakes: { ...current.mistakes, [concept]: correct === false ? (current.mistakes[concept] ?? 0) + 1 : correct === true ? 0 : (current.mistakes[concept] ?? 0) },
      completedExperiments: current.completedExperiments.includes(activeExperiment.id) ? current.completedExperiments : [...current.completedExperiments, activeExperiment.id],
      focus: correct === false ? concept : correct === true && current.focus === concept ? undefined : current.focus,
      skills: {
        ...current.skills,
        [concept]: Math.max(10, Math.min(100, (current.skills[concept] ?? 35) + (correct === null ? 0 : correct ? 5 : -3))),
      },
    }))
    if (correct === false) {
      setAiMode('MISTAKE')
      setAiQuestionResponse('')
      notifyAria('prediction_incorrect', `Prediction differed from ${actualOutcome}`)
    } else if (correct === true) {
      setAiMode('EXPLAIN')
      setAiQuestionResponse('')
      notifyAria('prediction_correct', `Prediction matched ${actualOutcome}`)
    }
  }

  function applyCode() {
    try {
      const parsed = parseCode(code)
      setOperations(parsed)
      setCodeError('')
      setLatestResult(null)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not parse this circuit.'
      setCodeError(message)
    }
  }

  const learnerContext: ExperimentContext = {
    simulation,
    previousSimulation: comparisonBefore?.data ?? null,
    experiment: activeExperiment,
    prediction,
    predictionCorrect: latestResult?.correct ?? null,
    measurementOutcome: observedOutcome === null ? null : simulation.basisStates[observedOutcome]?.label ?? null,
    mastery: learner.skills,
    mistakes: learner.mistakes,
  }
  const weakestSkill = learner.focus ?? Object.entries(learner.skills).sort((a, b) => a[1] - b[1])[0][0]
  const nextExperiment = recommendedExperiment(learnerContext)
  const explanation = aiResponse(aiMode, learnerContext)
  const ariaContext = useMemo<AriaContext>(() => {
    const mostLikelyIndex = simulation.probabilities.indexOf(Math.max(...simulation.probabilities))
    const applicationCandidate = page === 'application'
      ? getCandidate(simulation.basisStates[mostLikelyIndex]?.label ?? '00')
      : null
    return {
      page,
      currentExperiment: activeExperiment.title,
      experimentObjective: activeExperiment.objective,
      concept: activeExperiment.concept,
      selectedGate,
      rotationAngle: angle,
      circuit: simulation.activeGates.map(operation => ({
        gate: operation.gate,
        qubit: operation.qubit,
        ...(operation.target === undefined ? {} : { target: operation.target }),
        ...(operation.gate.startsWith('R') ? { angle: operation.angle ?? 90 } : {}),
      })),
      code: code.slice(0, 2000),
      quantumState: simulation.basisStates.map(item => `${fmt(item.amplitude)}|${item.label}⟩`).join(' + '),
      probabilities: simulation.basisStates.map(item => ({
        state: item.label,
        probability: item.probability,
        amplitude: fmt(item.amplitude),
        phase: item.phase,
      })),
      phases: simulation.activeGates
        .filter(operation => operation.gate.startsWith('R'))
        .map(operation => ({ gate: operation.gate, qubit: operation.qubit, angle: operation.angle ?? 90 })),
      measurementResults: measured?.map((count, index) => ({ state: simulation.basisStates[index].label, count })) ?? null,
      entanglement: simulation.entanglement,
      blochVectors: simulation.blochVectors,
      prediction: prediction || null,
      predictionCorrect: latestResult?.correct ?? null,
      learnerMastery: learner.skills,
      currentFocus: learner.focus ?? weakestSkill,
      recentMistakes: learner.mistakes,
      recommendedExperiment: nextExperiment.title,
      comparison: comparisonBefore ? {
        beforeConcurrence: comparisonBefore.data.entanglement.concurrence,
        beforeProbabilities: comparisonBefore.data.basisStates.map(item => ({
          state: item.label,
          probability: item.probability,
          amplitude: fmt(item.amplitude),
          phase: item.phase,
        })),
      } : null,
      applicationCandidate: applicationCandidate
        ? { route: applicationCandidate.route.join(' → '), cost: applicationCandidate.cost, bitstring: applicationCandidate.bitstring }
        : null,
    }
  }, [
    activeExperiment, code, comparisonBefore, latestResult, learner.focus, learner.mistakes, learner.skills,
    angle, measured, nextExperiment.title, page, prediction, selectedGate, simulation, weakestSkill,
  ])

  function askAiQuestion(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const question = aiQuestion.trim().toLowerCase()
    if (!question) return
    const mode: AiMode = question.includes('next') || question.includes('try') ? 'NEXT'
      : question.includes('hint') ? 'HINT'
        : question.includes('mistake') || question.includes('wrong') ? 'MISTAKE'
          : question.includes('why') || question.includes('because') || question.includes('remove') ? 'WHY'
            : 'EXPLAIN'
    setAiMode(mode)
    setAiQuestionResponse(aiResponse(mode, learnerContext))
  }

  const isPublicPage = page === 'home' || page === 'signin' || page === 'register'
  useEffect(() => {
    if (!demoUser && !isPublicPage) navigate('signin', true)
    else if (demoUser && (page === 'signin' || page === 'register')) navigate('dashboard', true)
  }, [demoUser, isPublicPage, navigate, page])

  if (!demoUser && !isPublicPage) {
    return <AppShell page="signin" user={null} onNavigate={navigate} onSignOut={() => {}} ariaContext={ariaContext} ariaEvent={ariaEvent} ariaInsight={explanation}>
      <AuthPage mode="signin" onComplete={user => { startDemoSession(user); setDemoUser(user); navigate('dashboard', true) }} onSwitchMode={navigate} />
    </AppShell>
  }
  if (demoUser && (page === 'signin' || page === 'register')) {
    return null
  }

  if (page !== 'lab') {
    const maxProbabilityIndex = simulation.probabilities.indexOf(Math.max(...simulation.probabilities))
    const candidate = getCandidate(simulation.basisStates[maxProbabilityIndex]?.label ?? '00')
    const baseline = findClassicalBaseline()
    const content = page === 'home' ? <HomePage onNavigate={navigate} />
      : page === 'signin' || page === 'register' ? <AuthPage mode={page} onComplete={user => { startDemoSession(user); setDemoUser(user); setSessionError(''); navigate('dashboard', true) }} onSwitchMode={navigate} />
      : page === 'dashboard' ? <DashboardPage
        name={demoUser?.name ?? 'Quantum Explorer'}
        experiments={learner.experiments}
        completedExperiments={learner.completedExperiments}
        accuracy={learner.predictions ? Math.round(learner.correct / learner.predictions * 100) : 0}
        skills={learner.skills}
        recommendation={nextExperiment}
        onNavigate={navigate}
        onStartExperiment={startExperiment}
      />
      : page === 'experiments' ? <ExperimentsPage completed={learner.completedExperiments} recommendationId={nextExperiment.id} onStart={startExperiment} />
      : page === 'challenges' ? <main className="simple">
        <span className="eyebrow">LEARN BY EXPERIMENTING</span><h1>Quantum challenges</h1>
        <p>Each challenge starts a guided experiment in the lab. Completion is based on a measured run.</p>
        <div className="cards experiment-cards">{learningExperiments.map((experiment, index) => <article key={experiment.id}><span>CHALLENGE 0{index + 1} · {experiment.difficulty.toUpperCase()}</span><b>{experiment.title}</b><p>{experiment.objective}</p><small>CONCEPT · {experiment.concept} · {learner.completedExperiments.includes(experiment.id) ? 'COMPLETED' : 'NOT STARTED'}</small><button onClick={() => startExperiment(experiment.id)}>{learner.completedExperiments.includes(experiment.id) ? 'REPLAY EXPERIMENT' : 'START CHALLENGE'}</button></article>)}</div>
      </main> : page === 'projects' ? <main className="simple">
        <span className="eyebrow">EDUCATIONAL RESEARCH WORKSPACE</span><h1>Explore quantum projects</h1>
        <div className="cards project-cards">
          {['Quantum Optimization', 'Quantum Cryptography', 'Quantum Machine Learning', 'Quantum Simulation'].map((project, index) => <article key={project}><span>PROJECT 0{index + 1} · CONCEPT EXPLORER</span><b>{project}</b><p>{index === 0 ? 'Connect a quantum circuit to a four-location route-cost model with an illustrative QAOA pipeline.' : 'A concise concept space. Start with the working circuit lab and inspect its simulator-derived state.'}</p><button onClick={() => index === 0 ? openApplication() : startExperiment(index === 3 ? 'explore-rotation' : 'superposition')}>{index === 0 ? 'OPEN OPTIMIZATION WORKSPACE' : 'OPEN CONCEPT LAB'}</button></article>)}
        </div>
      </main> : page === 'profile' ? <main className="simple">
        <span className="eyebrow">YOUR ADAPTIVE LEARNING PROFILE</span><h1>Quantum Explorer</h1>
        <p>Level {Math.max(1, Math.floor(learner.experiments / 3) + 1)} · {learner.experiments} experiments · {learner.predictions ? Math.round(learner.correct / learner.predictions * 100) : 0}% prediction accuracy</p>
        <section className="panel mastery"><h3>Concept mastery · prototype learner model</h3>{Object.entries(learner.skills).map(([skill, score]) => <div className="skill" key={skill}><span>{skill}</span><i><em style={{ width: `${score}%` }} /></i><b>{score}%</b></div>)}</section>
        <section className="panel profile-focus"><span className="eyebrow">CURRENT FOCUS</span><h3>{learner.focus ?? weakestSkill}</h3><p>{recommendedReason(learnerContext)}</p><p>Recorded prediction misses in this focus: {learner.mistakes[learner.focus ?? weakestSkill] ?? 0}</p><button onClick={() => startExperiment(nextExperiment.id)}>START RECOMMENDED · {nextExperiment.title.toUpperCase()}</button></section>
      </main> : page === 'application' ? <main className="simple">
        <span className="eyebrow">APPLICATION SIMULATION · EDUCATIONAL MODEL</span><h1>Quantum optimization workspace</h1>
        <p>A small, deterministic four-location route-cost problem. This QAOA-inspired circuit is illustrative, not generated from the route-cost objective; its sampled bitstrings are mapped to candidate routes after simulation. It is not quantum hardware or an industrial optimizer.</p>
        <div className="app-pipeline">{[['01', 'REAL-WORLD PROBLEM', 'Choose a low-cost closed route through A, B, C, D.'], ['02', 'MATHEMATICAL MODEL', 'Six weighted undirected edges define the route costs.'], ['03', 'QUBO CONCEPT', 'Four candidate route encodings map to two-bit strings.'], ['04', 'QAOA-INSPIRED CIRCUIT', `${simulation.activeGates.map(gate => gate.gate).join(' → ') || 'No gates'} · simulator output drives candidate probabilities.`], ['05', 'SIMULATION RESULT', `Most likely bitstring |${candidate.bitstring}⟩ · ${(simulation.probabilities[maxProbabilityIndex] * 100).toFixed(1)}%`], ['06', 'APPLICATION', `${candidate.route.join(' → ')} · illustrative route cost ${candidate.cost}`]].map(([number, title, detail]) => <article key={number}><span>{number}</span><b>{title}</b><p>{detail}</p></article>)}</div>
        <div className="optimization-grid">
          <section className="panel"><h3>Four-location graph · route costs</h3><div className="route-graph"><svg viewBox="0 0 320 220" role="img" aria-label="Four location graph with weighted connections"><line x1="60" y1="55" x2="260" y2="55"/><line x1="60" y1="55" x2="60" y2="165"/><line x1="60" y1="165" x2="260" y2="165"/><line x1="260" y1="55" x2="260" y2="165"/><line className="diagonal" x1="60" y1="55" x2="260" y2="165"/><line className="diagonal" x1="260" y1="55" x2="60" y2="165"/><text x="145" y="45">3</text><text x="38" y="116">4</text><text x="145" y="185">3</text><text x="275" y="116">4</text><text x="162" y="108">6</text><text x="110" y="130">7</text><circle cx="60" cy="55" r="18"/><circle cx="260" cy="55" r="18"/><circle cx="60" cy="165" r="18"/><circle cx="260" cy="165" r="18"/><text className="city" x="60" y="60">A</text><text className="city" x="260" y="60">B</text><text className="city" x="60" y="170">C</text><text className="city" x="260" y="170">D</text></svg><div className="edge-legend">{routeEdges.map(edge => <span key={`${edge.from}${edge.to}`}>{edge.from}—{edge.to} · {edge.cost}</span>)}</div></div></section>
          <section className="panel"><h3>Candidate bitstrings · simulator probabilities</h3>{routeCandidates.map(routeOption => {
            const index = Number.parseInt(routeOption.bitstring, 2)
            const probability = simulation.probabilities[index]
            return <div className={`candidate-row ${routeOption.bitstring === candidate.bitstring ? 'candidate-selected' : ''}`} key={routeOption.bitstring}><span>|{routeOption.bitstring}⟩</span><i><em style={{ width: `${probability * 100}%` }} /></i><b>{(probability * 100).toFixed(1)}%</b><span>{routeOption.route.slice(0, -1).join('→')} · cost {routeOption.cost}</span></div>
          })}<p className="baseline">Small classical check: lowest enumerated route cost is {baseline.cost} ({baseline.route.join(' → ')}). The sampled quantum circuit does not guarantee finding it.</p></section>
        </div>
        <div className="page-actions"><button onClick={() => { setPage('lab'); setActiveExperimentId('bell-state') }}>RETURN TO QUANTUM LAB</button><button className="ghost" onClick={() => { loadCircuit(qaoaCircuit()); setPage('application') }}>RELOAD QAOA-INSPIRED CIRCUIT</button></div>
      </main> : null
    return <AppShell
      page={page}
      user={demoUser}
      onNavigate={navigate}
      onSignOut={() => {
        try {
          endDemoSession()
          setDemoUser(null)
          setSessionError('')
          navigate('home')
        } catch (error) {
          setSessionError(error instanceof Error ? error.message : 'Could not end the local demo session.')
        }
      }}
      ariaContext={ariaContext}
      ariaEvent={ariaEvent}
      ariaInsight={explanation}
    >{sessionError && <p className="session-error" role="alert">{sessionError}</p>}{content}</AppShell>
  }

  const maxProbabilityIndex = simulation.probabilities.indexOf(Math.max(...simulation.probabilities))
  const routeCandidate = getCandidate(simulation.basisStates[maxProbabilityIndex].label)
  const route = routeCandidate.route.slice(0, -1).join(' → ')
  const coordinate = simulation.blochVectors[0].map(value => Math.max(-1, Math.min(1, value)))

  return <AppShell
    page={page}
    user={demoUser}
    onNavigate={navigate}
    onSignOut={() => {
      try {
        endDemoSession()
        setDemoUser(null)
        navigate('home')
      } catch (error) {
        setSessionError(error instanceof Error ? error.message : 'Could not end the local demo session.')
      }
    }}
    ariaContext={ariaContext}
    ariaEvent={ariaEvent}
    ariaInsight={explanation}
  >
    {sessionError && <p className="session-error" role="alert">{sessionError}</p>}
    <main className="lab">
      <section className="experiment-brief panel">
        <div><span className="eyebrow">CURRENT EXPERIMENT · {activeExperiment.difficulty.toUpperCase()} · {activeExperiment.concept.toUpperCase()}</span><h1>{activeExperiment.title}</h1><p><b>OBJECTIVE</b> {activeExperiment.objective}</p></div>
        <div className="brief-actions"><label>Change experiment<select aria-label="Choose experiment" value={activeExperiment.id} onChange={event => startExperiment(event.target.value)}>{learningExperiments.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label><button className="ghost" onClick={() => openApplication()}>APPLICATION SIMULATION</button><div className="demo"><button className="ghost" onClick={() => startExperiment('bell-state')}>LOAD BELL STATE</button><button className="ghost" onClick={() => startExperiment('superposition')}>LOAD SUPERPOSITION</button><button className="ghost" onClick={openApplication}>LOAD QAOA DEMO</button></div></div>
      </section>
      <div className="grid">
        <aside className="panel builder"><h3>Gate palette</h3><div className="gates">{palette.map(gate => <button className={selectedGate === gate ? 'active' : ''} onClick={() => setSelectedGate(gate)} key={gate}>{gate}</button>)}</div>
          <p className="hint">Choose a gate, then press + on a qubit wire. For CNOT, the selected wire is the control.</p>
          <h3>Rotation angle <span className="angle">{angle}°</span></h3><label className="range-label"><input type="range" min="0" max="360" step="5" value={angle} onChange={event => { const nextAngle = Number(event.target.value); setAngle(nextAngle); setOperations(current => { const latestRotation = [...current].reverse().find(operation => operation.gate.startsWith('R')); return latestRotation ? current.map(operation => operation.id === latestRotation.id ? { ...operation, angle: nextAngle } : operation) : current }) }} /></label><p className="hint">Adjusts the latest rotation gate, or sets the angle for the next one.</p>
          <div className="builder-actions"><button className="ghost" onClick={() => setOperations(current => current.slice(0, -1))} disabled={!operations.length}>UNDO</button><button className="ghost" onClick={() => loadCircuit([])} disabled={!operations.length}>CLEAR</button></div>
        </aside>
        <section className="panel circuit"><div className="panelhead"><h3>Circuit canvas</h3><span>{operations.length} operations · live simulation</span></div>
          {[0, 1].map(qubit => <div className="wire" key={qubit}><b>Q{qubit}</b><div className="rail">{operations.filter(operation => operation.qubit === qubit || (operation.gate === 'CNOT' && operation.target === qubit)).map(operation => <button title={`Remove ${operation.gate} operation`} aria-label={`Remove ${operation.gate} operation`} className={`chip ${operation.gate === 'CNOT' ? 'cnot' : ''}`} onClick={() => setOperations(current => current.filter(item => item.id !== operation.id))} key={operation.id}>{operation.gate === 'CNOT' ? operation.qubit === qubit ? '●' : '⊕' : operation.gate}</button>)}<button className="add" aria-label={`Add ${selectedGate} to Q${qubit}`} onClick={() => addGate(qubit)}>+</button></div></div>)}
          <div className="actions"><button onClick={runSimulation}>RUN SIMULATION</button><button className="ghost" onClick={runMeasurement}>RUN MEASUREMENT</button><select aria-label="Measurement shot count" value={shots} onChange={event => { setShots(Number(event.target.value)); setMeasured(null) }}><option value={128}>128 shots</option><option value={256}>256 shots</option><option value={1024}>1024 shots</option></select><span>{simulationResult ? `Simulation complete · ${simulationResult.activeGates.length} gates · state vector updated` : 'Edit the circuit, then run the simulation.'}</span>{simulationError && <span className="error" role="alert">{simulationError}</span>}</div>
          <label className="code-label">SYNCHRONIZED QISKIT-STYLE CODE<textarea value={code} onChange={event => setCode(event.target.value)} spellCheck={false} aria-label="Quantum circuit code" /></label>
          <div className="code-actions"><button className="ghost" onClick={applyCode}>APPLY CODE TO CIRCUIT</button>{codeError && <span className="error" role="alert">{codeError}</span>}</div>
        </section>
        <aside className="panel state"><div className="panelhead"><h3>Quantum state</h3><span>ψ from simulator</span></div>
          <div className="ket">|ψ⟩ = {simulation.basisStates.map(basisState => `${fmt(basisState.amplitude)}|${basisState.label}⟩`).join(' + ')}</div>
          <div className="section-caption">BASIS PROBABILITIES</div>{simulation.basisStates.map(basisState => <div className="prob" key={basisState.index}><span>|{basisState.label}⟩</span><i><em style={{ width: `${basisState.probability * 100}%` }} /></i><b>{(basisState.probability * 100).toFixed(1)}%</b></div>)}
          <div className="bloch"><div className="sphere"><span>+Z</span><span className="axis-label x-label">+X</span><span className="axis-label y-label">+Y</span><i className="bloch-vector" style={{ transform: `translate(-50%, -50%) rotate(${Math.atan2(coordinate[0], coordinate[2]) * 180 / Math.PI}deg)`, height: `${Math.max(8, Math.hypot(coordinate[0], coordinate[2]) * 43)}px` }} /></div>
            <p>{simulation.entanglement.isEntangled ? `Reduced state of Q0 · entanglement ${simulation.entanglement.concurrence.toFixed(2)}; sphere is not the full state.` : `Q0 Bloch vector · X ${coordinate[0].toFixed(2)} · Y ${coordinate[1].toFixed(2)} · Z ${coordinate[2].toFixed(2)}`}</p>
          </div>
        </aside>
      </div>
      <React.Suspense fallback={<section className="quantum-scene-panel panel scene-loading">Loading 3D quantum renderer…</section>}>
        <QuantumScene data={simulation} observedOutcome={observedOutcome} onEnter3d={() => startExperiment('bell-state')} />
      </React.Suspense>
      <div className="experiment-actions">
        <span>EXPERIMENT WORKFLOW</span>
        <div><b className={prediction ? 'workflow-done' : ''}>PREDICT</b><i>→</i><b className={simulationResult ? 'workflow-done' : ''}>SIMULATE</b><i>→</i><b className={measured ? 'workflow-done' : ''}>MEASURE</b><i>→</i><b className={latestResult ? 'workflow-done' : ''}>COMPARE</b><i>→</i><b className={learner.completedExperiments.includes(activeExperiment.id) ? 'workflow-done' : ''}>ADAPT</b></div>
        <button onClick={runWhatIf} disabled={!operations.some(operation => operation.gate === 'H')}>WHAT IF? · REMOVE H</button>
      </div>
      {comparisonBefore && <section className="comparison-panel panel">
        <div className="comparison-heading"><div><span className="eyebrow">WHAT-IF COMPARISON · SIMULATOR DATA</span><h2>Removing H changed the experiment</h2></div><button className="ghost" onClick={() => { setOperations(comparisonBefore.circuit); setComparisonBefore(null); setPrediction('') }}>RESTORE BEFORE CIRCUIT</button></div>
        <div className="comparison-grid">{[{ label: comparisonBefore.label, data: comparisonBefore.data, circuit: comparisonBefore.circuit }, { label: 'After · current circuit', data: simulation, circuit: operations }].map(snapshot => <article key={snapshot.label}><span>{snapshot.label}</span><b className="comparison-circuit">{snapshot.circuit.filter(operation => operation.gate !== 'M').map(operation => `${operation.gate}(Q${operation.qubit}${operation.gate === 'CNOT' ? `→Q${operation.target}` : ''})`).join(' → ') || 'No gates · |00⟩'}</b><p>Concurrence <strong>{snapshot.data.entanglement.concurrence.toFixed(2)}</strong></p><div className="comparison-probabilities">{snapshot.data.basisStates.map(item => item.probability > 0.005 && <span key={item.label}>|{item.label}⟩ · {(item.probability * 100).toFixed(1)}%</span>)}</div></article>)}</div>
      </section>}
      <div className="bottom">
        <section className="panel prediction-panel"><span className="eyebrow">STEP 1 · PREDICT</span><h3>{activeExperiment.predictionPrompt}</h3><div className="choices">{activeExperiment.predictionOptions.map(choice => <button onClick={() => { setPrediction(choice); setLatestResult(null) }} className={prediction === choice ? 'active' : ''} key={choice}>{choice}</button>)}</div>
          {latestResult && <div className="result-compare"><p className={`feedback ${latestResult.correct ? 'success' : 'incorrect'}`}><b>YOUR PREDICTION</b><br />{latestResult.predicted}</p><p className="feedback"><b>ACTUAL · DERIVED FROM SIMULATOR</b><br />{latestResult.actual}</p><p className="feedback"><b>MEASURED SAMPLE</b><br />{observedOutcome === null ? 'No sample yet' : `|${simulation.basisStates[observedOutcome]?.label}⟩`}</p></div>}
          {!latestResult && prediction && <p className="feedback">Prediction saved. Run the experiment to compare it with the current simulator result.</p>}
          <button className="run-experiment" onClick={runMeasurement}>STEP 2 · RUN EXPERIMENT</button>
        </section>
        <section className="panel guide"><span className="badge">AI GUIDE · EXPERIMENT-AWARE · RULE-BASED</span><h3>{bellState ? 'Bell-state insight' : latestResult?.correct === false ? 'Let’s inspect the misconception' : 'Live experiment insight'}</h3><div className="ai-modes">{(['EXPLAIN', 'HINT', 'WHY', 'NEXT', 'MISTAKE'] as AiMode[]).map(mode => <button className={aiMode === mode ? 'active' : ''} onClick={() => { setAiMode(mode); setAiQuestionResponse('') }} key={mode}>{mode}</button>)}</div><p>{aiQuestionResponse || explanation}</p><div className="ai-context">CONTEXT · {activeExperiment.title} · {operations.filter(operation => operation.gate !== 'M').map(operation => operation.gate).join(' → ') || 'initial state'} · concurrence {simulation.entanglement.concurrence.toFixed(2)} · prediction {prediction ? latestResult?.correct ? 'correct' : latestResult?.correct === false ? 'incorrect' : 'pending' : 'not made'} · mastery {learner.skills[activeExperiment.concept] ?? 0}%</div>
          <form className="ai-question" onSubmit={askAiQuestion}><input value={aiQuestion} onChange={event => setAiQuestion(event.target.value)} aria-label="Ask the AI Guide about this experiment" placeholder="Ask why, request a hint, or ask what to try next…" /><button>ASK</button></form>
          <div className="recommend"><span>ADAPTIVE NEXT EXPERIMENT</span><b>{nextExperiment.title}</b><small>{recommendedReason(learnerContext)}</small><button className="next-experiment" onClick={() => startExperiment(nextExperiment.id)}>START NEXT EXPERIMENT →</button></div></section>
        <section className="panel measure"><h3>Measurement results</h3>{simulation.basisStates.map(basisState => {
          const count = basisState.measurementCount ?? Math.round(basisState.measurementProbability * shots)
          return <div className="measureRow" key={basisState.index}><span>{basisState.label}</span><i><em style={{ width: `${count / shots * 100}%` }} /></i><b>{count}</b></div>
        })}<small>{measured ? `${shots} sampled shots from the current simulated probability distribution.` : 'Expected counts. Run measurement to sample the simulator.'}</small></section>
      </div>
      <section className="application panel"><div><span className="eyebrow">APPLICATION SIMULATION · CONCEPTUAL</span><h3>QAOA-inspired route optimization</h3><p>Illustrative toy mapping from the most likely 2-bit outcome—not an industrial optimizer.</p><button className="ghost" onClick={() => setPage('application')}>OPEN APPLICATION SIMULATION</button></div><div className="route"><b>{routeCandidate.route[0]}</b><i /><b>{routeCandidate.route[1]}</b><i /><b>{routeCandidate.route[2]}</b><i /><b>{routeCandidate.route[3]}</b><i /><b>{routeCandidate.route[4]}</b><span>Most likely outcome |{routeCandidate.bitstring}⟩ → cost {routeCandidate.cost} · candidate {route}</span></div></section>
    </main>
  </AppShell>
}

export default App
