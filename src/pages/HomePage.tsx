import type { AppPage } from '../routes/routes'

export function HomePage({ onNavigate }: { onNavigate: (page: AppPage) => void }) {
  return <main className="home-page">
    <section className="home-hero">
      <div className="home-copy">
        <span className="eyebrow">ASPIRO · INTERACTIVE QUANTUM LEARNING</span>
        <h1>Don’t just learn what quantum algorithms do. <em>Experiment to discover why.</em></h1>
        <p>Build a circuit, make a prediction, and watch the simulator-derived state reshape the visualization and explanation.</p>
        <div className="page-actions">
          <button onClick={() => onNavigate('signin')}>ENTER ASPIRO →</button>
          <button className="ghost" onClick={() => onNavigate('lab')}>OPEN QUANTUM LAB</button>
        </div>
      </div>
      <div className="home-lab-preview" aria-label="Learning loop: build, predict, simulate, visualize, understand">
        <div className="preview-heading"><span>ASPIRO LEARNING LOOP</span><b>LIVE SIMULATION</b></div>
        <div className="preview-circuit"><span>Q0</span><i /><b>H</b><i /><b className="preview-cnot">●</b><i /><b className="preview-ket">|ψ⟩</b></div>
        <div className="preview-circuit"><span>Q1</span><i /><b className="preview-control">⊕</b><i /><span className="preview-muted">state vector</span></div>
        <div className="preview-flow">{['BUILD', 'PREDICT', 'SIMULATE', 'VISUALIZE', 'UNDERSTAND'].map((step, index) => <span key={step}>{index > 0 && <i>→</i>}{step}</span>)}</div>
        <p>One circuit · one simulator · every visualization derived from the same state.</p>
      </div>
    </section>
    <section className="home-values">
      <article><span>01 · EXPERIMENT</span><h2>Build, then predict.</h2><p>Manipulate gates and make a reasoned prediction before running your experiment.</p></article>
      <article><span>02 · OBSERVE</span><h2>See the state change.</h2><p>Inspect amplitudes, probabilities, measurement samples, Bloch vectors, and the 3D state view.</p></article>
      <article><span>03 · UNDERSTAND</span><h2>Learn why it happened.</h2><p>Compare your prediction with the result and ask ARIA about the current simulator state.</p></article>
    </section>
    <section className="home-bottom-cta">
      <div><span className="eyebrow">QUANTUM LEARNING THROUGH ACTIVE DISCOVERY</span><h2>Your next experiment starts here.</h2></div>
      <button onClick={() => onNavigate('signin')}>START LEARNING →</button>
    </section>
  </main>
}
