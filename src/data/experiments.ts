import type { GateName } from '../quantum/simulator'

export type ExperimentGate = { gate: GateName; qubit: number; target?: number; angle?: number }
export type PredictionKind = 'superposition' | 'bell' | 'separability' | 'rotation' | 'measurement'
export type LearningExperiment = {
  id: string
  title: string
  objective: string
  concept: string
  difficulty: 'Beginner' | 'Intermediate' | 'Advanced'
  predictionPrompt: string
  predictionOptions: string[]
  predictionKind: PredictionKind
  startingCircuit: ExperimentGate[]
}

export const learningExperiments: LearningExperiment[] = [
  {
    id: 'superposition',
    title: 'Create Superposition',
    objective: 'Apply H to Q0 and inspect how one qubit shares probability across two outcomes.',
    concept: 'Superposition',
    difficulty: 'Beginner',
    predictionPrompt: 'After H on Q0, what will a measurement of Q0 show?',
    predictionOptions: ['Q0 is 0 or 1 with equal probability', 'Q0 is always 0', 'Q0 is always 1'],
    predictionKind: 'superposition',
    startingCircuit: [{ gate: 'H', qubit: 0 }, { gate: 'M', qubit: 0 }],
  },
  {
    id: 'bell-state',
    title: 'Create a Bell State',
    objective: 'Build a Bell state and explain why measurements of the two qubits are correlated.',
    concept: 'Entanglement',
    difficulty: 'Intermediate',
    predictionPrompt: 'Which outcomes are likely after H(Q0) then CNOT(Q0 → Q1)?',
    predictionOptions: ['All four outcomes are equally likely', 'Only |00⟩ and |11⟩ are likely', 'Only |01⟩ and |10⟩ are likely', 'Both qubits always become |1⟩', 'A different distribution appears'],
    predictionKind: 'bell',
    startingCircuit: [{ gate: 'H', qubit: 0 }, { gate: 'CNOT', qubit: 0, target: 1 }, { gate: 'M', qubit: 0 }, { gate: 'M', qubit: 1 }],
  },
  {
    id: 'break-entanglement',
    title: 'Break Entanglement',
    objective: 'Start from a Bell pair. Predict how removing its H preparation changes correlation.',
    concept: 'Entanglement',
    difficulty: 'Intermediate',
    predictionPrompt: 'What will removing H do to this Bell-state preparation?',
    predictionOptions: ['The qubits remain entangled', 'The state becomes separable at |00⟩', 'The state becomes |11⟩', 'The state is separable with another distribution'],
    predictionKind: 'separability',
    startingCircuit: [{ gate: 'H', qubit: 0 }, { gate: 'CNOT', qubit: 0, target: 1 }, { gate: 'M', qubit: 0 }, { gate: 'M', qubit: 1 }],
  },
  {
    id: 'explore-rotation',
    title: 'Explore Rotation',
    objective: 'Rotate Q0 with RY and follow its Bloch vector as the angle changes.',
    concept: 'Phase',
    difficulty: 'Intermediate',
    predictionPrompt: 'At a 90° RY rotation from |0⟩, where will Q0 point?',
    predictionOptions: ['Toward +Z', 'On the equator between +Z and −Z', 'Toward −Z'],
    predictionKind: 'rotation',
    startingCircuit: [{ gate: 'RY', qubit: 0, angle: 90 }],
  },
  {
    id: 'predict-measurement',
    title: 'Predict Measurement',
    objective: 'Use the current probability distribution to predict a sampled measurement result.',
    concept: 'Measurement',
    difficulty: 'Beginner',
    predictionPrompt: 'Which distribution will the simulator sample?',
    predictionOptions: ['Equal chance of |00⟩ and |10⟩', 'Only |00⟩', 'Equal chance of all four states'],
    predictionKind: 'measurement',
    startingCircuit: [{ gate: 'H', qubit: 0 }, { gate: 'M', qubit: 0 }],
  },
]

export function findExperiment(id: string): LearningExperiment {
  const experiment = learningExperiments.find(item => item.id === id)
  if (!experiment) throw new RangeError(`Unknown experiment "${id}"`)
  return experiment
}
