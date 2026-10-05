import { learningExperiments } from '../data/experiments'

export function ExperimentsPage({
  completed,
  recommendationId,
  onStart,
}: {
  completed: string[]
  recommendationId: string
  onStart: (id: string) => void
}) {
  return <main className="workspace-page">
    <header className="workspace-heading"><div><span className="eyebrow">GUIDED QUANTUM EXPERIMENTS</span><h1>Choose what to explore.</h1><p>Each activity starts with a prediction and ends with simulator-derived feedback.</p></div></header>
    <div className="cards experiment-cards">{learningExperiments.map((experiment, index) => <article key={experiment.id}>
      <span>EXPERIMENT 0{index + 1} · {experiment.difficulty.toUpperCase()}</span>
      <b>{experiment.title}</b>
      <p>{experiment.objective}</p>
      <small>CONCEPT · {experiment.concept} · {completed.includes(experiment.id) ? 'COMPLETED' : 'READY'}</small>
      <button onClick={() => onStart(experiment.id)}>{experiment.id === recommendationId ? 'RECOMMENDED · START' : completed.includes(experiment.id) ? 'REPEAT EXPERIMENT' : 'START EXPERIMENT'}</button>
    </article>)}</div>
  </main>
}
