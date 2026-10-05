import type { LearningExperiment } from '../data/experiments'
import type { AppPage } from '../routes/routes'

export function DashboardPage({
  name,
  experiments,
  completedExperiments,
  accuracy,
  skills,
  recommendation,
  onNavigate,
  onStartExperiment,
}: {
  name: string
  experiments: number
  completedExperiments: string[]
  accuracy: number
  skills: Record<string, number>
  recommendation: LearningExperiment
  onNavigate: (page: AppPage) => void
  onStartExperiment: (id: string) => void
}) {
  return <main className="workspace-page">
    <header className="workspace-heading"><div><span className="eyebrow">LEARNER DASHBOARD · LOCAL DEMO PROFILE</span><h1>Good to see you, {name}.</h1><p>Your lab, learning progress, and next experiment in one place.</p></div><button onClick={() => onNavigate('lab')}>OPEN QUANTUM LAB →</button></header>
    <section className="dashboard-stats">
      <article><span>EXPERIMENT RUNS</span><b>{experiments}</b><small>Completed simulator runs</small></article>
      <article><span>CHALLENGES</span><b>{completedExperiments.length}</b><small>Unique experiments completed</small></article>
      <article><span>PREDICTION ACCURACY</span><b>{accuracy}%</b><small>Based on submitted predictions</small></article>
    </section>
    <div className="dashboard-grid">
      <section className="panel dashboard-mastery"><span className="eyebrow">LEARNER MODEL · HEURISTIC</span><h2>Concept mastery</h2>{Object.entries(skills).map(([skill, score]) => <div className="skill" key={skill}><span>{skill}</span><i><em style={{ width: `${score}%` }} /></i><b>{score}%</b></div>)}<button className="ghost" onClick={() => onNavigate('profile')}>VIEW LEARNING PROFILE</button></section>
      <section className="panel dashboard-next"><span className="eyebrow">ADAPTIVE NEXT EXPERIMENT</span><h2>{recommendation.title}</h2><p>{recommendation.objective}</p><span className="dashboard-concept">{recommendation.concept} · {recommendation.difficulty}</span><button onClick={() => onStartExperiment(recommendation.id)}>START RECOMMENDED EXPERIMENT →</button></section>
    </div>
    <section className="dashboard-links"><button className="ghost" onClick={() => onNavigate('experiments')}>BROWSE EXPERIMENTS</button><button className="ghost" onClick={() => onNavigate('challenges')}>OPEN CHALLENGES</button><button className="ghost" onClick={() => onNavigate('projects')}>EXPLORE APPLICATIONS</button></section>
  </main>
}
