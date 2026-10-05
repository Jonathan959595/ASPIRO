import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { fmt, type QuantumVisualizationData } from '../../quantum/simulator'

type Layers = { bloch: boolean; probability: boolean; entanglement: boolean; particles: boolean }
type QuantumSceneProps = { data: QuantumVisualizationData; observedOutcome: number | null; onEnter3d?: () => void }
type SphereObjects = {
  group: THREE.Group
  vector: THREE.ArrowHelper
  point: THREE.Mesh<THREE.SphereGeometry, THREE.MeshStandardMaterial>
  ring: THREE.Mesh<THREE.TorusGeometry, THREE.MeshBasicMaterial>
  target: THREE.Vector3
  current: THREE.Vector3
}
type BasisObjects = {
  group: THREE.Group
  node: THREE.Mesh<THREE.SphereGeometry, THREE.MeshStandardMaterial>
  phase: THREE.Mesh<THREE.TorusGeometry, THREE.MeshBasicMaterial>
  probabilityLabel: THREE.Sprite
  probability: number
  targetProbability: number
  phaseTarget: number
}
type SceneObjects = {
  renderer: THREE.WebGLRenderer
  scene: THREE.Scene
  camera: THREE.PerspectiveCamera
  controls: OrbitControls
  spheres: SphereObjects[]
  basis: BasisObjects[]
  entanglementLine: THREE.Line<THREE.BufferGeometry, THREE.LineBasicMaterial>
  entanglementDots: THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>[]
  probabilityLines: THREE.Line<THREE.BufferGeometry, THREE.LineBasicMaterial>[]
  animationFrame: number
  resizeObserver: ResizeObserver
  onResize: () => void
  onPointerMove: (event: PointerEvent) => void
  onPointerLeave: () => void
  controlsElement: HTMLElement
}

const initialLayers: Layers = { bloch: true, probability: true, entanglement: true, particles: true }
const statePositions = [
  new THREE.Vector3(-1.5, -2.05, 0.2),
  new THREE.Vector3(-0.5, -2.05, -0.2),
  new THREE.Vector3(0.5, -2.05, 0.2),
  new THREE.Vector3(1.5, -2.05, -0.2),
]
const sphereCenters = [new THREE.Vector3(-2.35, 0.45, 0), new THREE.Vector3(2.35, 0.45, 0)]

function blochToVector(vector: [number, number, number]): THREE.Vector3 {
  return new THREE.Vector3(vector[0], vector[1], vector[2])
}

export function QuantumScene({ data, observedOutcome, onEnter3d }: QuantumSceneProps) {
  const hostRef = useRef<HTMLDivElement>(null)
  const objectsRef = useRef<SceneObjects | null>(null)
  const dataRef = useRef(data)
  const observedOutcomeRef = useRef(observedOutcome)
  const layersRef = useRef(initialLayers)
  const [layers, setLayers] = useState(initialLayers)
  const [unavailable, setUnavailable] = useState(false)
  const [tooltip, setTooltip] = useState<{ x: number; y: number; text: string } | null>(null)
  const timeline = useMemo(() => data.circuit.slice(-5), [data.circuit])
  const simulationKey = data.circuit.map(operation => `${operation.id}:${operation.gate}:${operation.angle ?? ''}`).join('|')

  useEffect(() => {
    dataRef.current = data
    observedOutcomeRef.current = observedOutcome
    const objects = objectsRef.current
    if (!objects) return
    objects.spheres.forEach((sphere, index) => {
      sphere.target.copy(blochToVector(data.blochVectors[index] ?? [0, 0, 1]))
    })
    objects.basis.forEach((item, index) => {
      item.targetProbability = observedOutcome === null
        ? data.basisStates[index]?.probability ?? 0
        : index === observedOutcome ? 1 : 0
      item.phaseTarget = data.basisStates[index]?.phase ?? 0
    })
    const concurrence = data.entanglement.concurrence
    objects.entanglementLine.material.opacity = concurrence
    objects.entanglementLine.visible = layersRef.current.entanglement && concurrence > 0.01
    objects.entanglementDots.forEach(dot => {
      dot.visible = layersRef.current.entanglement && concurrence > 0.01 && layersRef.current.particles
    })
  }, [data, observedOutcome, simulationKey])

  useEffect(() => {
    layersRef.current = layers
    const objects = objectsRef.current
    if (!objects) return
    objects.spheres.forEach(sphere => { sphere.group.visible = layers.bloch })
    objects.basis.forEach(item => { item.group.visible = layers.probability })
    objects.probabilityLines.forEach(line => { line.visible = layers.probability })
    objects.entanglementLine.visible = layers.entanglement && dataRef.current.entanglement.concurrence > 0.01
    objects.entanglementDots.forEach(dot => { dot.visible = layers.entanglement && layers.particles && dataRef.current.entanglement.concurrence > 0.01 })
  }, [layers])

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    let objects: SceneObjects | null = null
    let disposed = false

    try {
      const scene = new THREE.Scene()
      scene.background = new THREE.Color('#070b16')
      scene.fog = new THREE.FogExp2('#070b16', 0.045)
      const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100)
      camera.position.set(0, 1.4, 10.5)
      const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false })
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
      renderer.setSize(host.clientWidth, host.clientHeight)
      renderer.outputColorSpace = THREE.SRGBColorSpace
      renderer.toneMapping = THREE.ACESFilmicToneMapping
      renderer.toneMappingExposure = 1.1
      renderer.domElement.className = 'quantum-canvas'
      renderer.domElement.setAttribute('aria-label', 'Interactive three-dimensional quantum state visualization')
      host.prepend(renderer.domElement)

      const controls = new OrbitControls(camera, renderer.domElement)
      controls.enableDamping = true
      controls.dampingFactor = 0.06
      controls.minDistance = 6
      controls.maxDistance = 17
      controls.minPolarAngle = Math.PI * 0.18
      controls.maxPolarAngle = Math.PI * 0.82
      controls.target.set(0, -0.1, 0)

      scene.add(new THREE.HemisphereLight('#b8efff', '#10152d', 1.35))
      const keyLight = new THREE.PointLight('#74e4db', 38, 18)
      keyLight.position.set(-4, 5, 5)
      scene.add(keyLight)
      const fillLight = new THREE.PointLight('#7772ff', 25, 16)
      fillLight.position.set(4, 1, -4)
      scene.add(fillLight)
      const grid = new THREE.GridHelper(20, 36, '#28505e', '#172638')
      grid.position.y = -2.75
      const gridMaterials = Array.isArray(grid.material) ? grid.material : [grid.material]
      gridMaterials.forEach(material => { material.transparent = true; material.opacity = 0.32 })
      scene.add(grid)

      const starPositions = new Float32Array(240 * 3)
      for (let i = 0; i < 240; i++) {
        starPositions[i * 3] = (Math.random() - 0.5) * 20
        starPositions[i * 3 + 1] = (Math.random() - 0.5) * 12
        starPositions[i * 3 + 2] = (Math.random() - 0.5) * 13 - 2
      }
      const starGeometry = new THREE.BufferGeometry()
      starGeometry.setAttribute('position', new THREE.BufferAttribute(starPositions, 3))
      const stars = new THREE.Points(starGeometry, new THREE.PointsMaterial({ color: '#8bbdca', size: 0.025, transparent: true, opacity: 0.54, sizeAttenuation: true }))
      stars.name = 'ambient-particles'
      scene.add(stars)

      const spheres: SphereObjects[] = sphereCenters.map((center, index) => {
        const group = new THREE.Group()
        group.position.copy(center)
        const blochValues = dataRef.current.blochVectors[index]
        const qubitTooltip = `Q${index} · reduced single-qubit state\nBloch vector: ${blochValues.map(value => value.toFixed(2)).join(', ')}`
        group.userData.tooltip = qubitTooltip
        scene.add(group)

        const sphere = new THREE.Mesh(
          new THREE.SphereGeometry(1, 36, 24),
          new THREE.MeshPhysicalMaterial({ color: '#183247', transparent: true, opacity: 0.23, roughness: 0.38, metalness: 0.1, side: THREE.DoubleSide, depthWrite: false }),
        )
        sphere.userData.tooltip = qubitTooltip
        group.add(sphere)
        const wire = new THREE.Mesh(new THREE.SphereGeometry(1.006, 24, 16), new THREE.MeshBasicMaterial({ color: '#3a7181', wireframe: true, transparent: true, opacity: 0.25 }))
        group.add(wire)

        const axes = new THREE.AxesHelper(1.35)
        const axesMaterials = Array.isArray(axes.material) ? axes.material : [axes.material]
        axesMaterials.forEach(material => { material.transparent = true; material.opacity = 0.5 })
        group.add(axes)
        const equator = new THREE.Mesh(new THREE.TorusGeometry(1.005, 0.007, 6, 96), new THREE.MeshBasicMaterial({ color: '#69dace', transparent: true, opacity: 0.48 }))
        equator.rotation.x = Math.PI / 2
        group.add(equator)

        const vector = new THREE.ArrowHelper(new THREE.Vector3(0, 0, 1), new THREE.Vector3(), 0.98, '#71f4de', 0.17, 0.1)
        vector.userData.tooltip = `Q${index} Bloch vector\nState: reduced single-qubit state`
        group.add(vector)
        const point = new THREE.Mesh(new THREE.SphereGeometry(0.09, 16, 12), new THREE.MeshStandardMaterial({ color: '#d6fff8', emissive: '#36e8cf', emissiveIntensity: 2.2 }))
        point.userData.tooltip = qubitTooltip
        group.add(point)
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.14, 0.009, 6, 32), new THREE.MeshBasicMaterial({ color: '#7fffea', transparent: true, opacity: 0.8 }))
        group.add(ring)
        const label = makeTextSprite(`Q${index}`, '#9cefe5')
        label.position.set(0, 1.35, 0)
        group.add(label)
        const axisLabels: Array<[string, THREE.Vector3]> = [
          ['+X', new THREE.Vector3(1.35, 0, 0)], ['−X', new THREE.Vector3(-1.35, 0, 0)],
          ['+Y', new THREE.Vector3(0, 1.35, 0)], ['−Y', new THREE.Vector3(0, -1.35, 0)],
          ['+Z', new THREE.Vector3(0, 0, 1.35)], ['−Z', new THREE.Vector3(0, 0, -1.35)],
        ]
        axisLabels.forEach(([text, position]) => {
          const axisLabel = makeTextSprite(text, '#829cb3', 0.55)
          axisLabel.position.copy(position)
          group.add(axisLabel)
        })
        const vectorValue = blochToVector(dataRef.current.blochVectors[index])
        vector.setDirection(vectorValue.lengthSq() > 1e-8 ? vectorValue.clone().normalize() : new THREE.Vector3(0, 0, 1))
        vector.setLength(Math.max(0.04, vectorValue.length()), 0.17, 0.1)
        point.position.copy(vectorValue)
        ring.position.copy(vectorValue)
        return { group, vector, point, ring, target: vectorValue.clone(), current: vectorValue.clone() }
      })

      const basis: BasisObjects[] = dataRef.current.basisStates.map((item, index) => {
        const group = new THREE.Group()
        group.position.copy(statePositions[index])
        const node = new THREE.Mesh(
          new THREE.SphereGeometry(0.31, 24, 18),
          new THREE.MeshStandardMaterial({ color: '#50d8cd', emissive: '#169a9b', emissiveIntensity: 0.6, transparent: true, opacity: 0.35, roughness: 0.34 }),
        )
        node.userData.tooltip = `State |${item.label}⟩\nProbability: ${(item.probability * 100).toFixed(1)}%\nAmplitude: ${item.magnitude.toFixed(3)}\nPhase: ${(item.phase * 180 / Math.PI).toFixed(1)}°`
        group.add(node)
        const phase = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.012, 8, 48), new THREE.MeshBasicMaterial({ color: '#b48dff', transparent: true, opacity: item.probability > 1e-8 ? 0.82 : 0.12 }))
        group.add(phase)
        const label = makeTextSprite(`|${item.label}⟩`, '#d1e5ed', 0.65)
        label.position.y = 0.72
        group.add(label)
        const probabilityLabel = makeTextSprite(`${(item.probability * 100).toFixed(0)}%`, '#7be6db', 0.48)
        probabilityLabel.position.y = -0.67
        group.add(probabilityLabel)
        const targetProbability = item.probability
        const radius = 0.12 + 0.44 * Math.sqrt(targetProbability)
        node.scale.setScalar(radius / 0.31)
        node.material.opacity = 0.12 + 0.88 * targetProbability
        phase.rotation.set(item.phase * 0.6, item.phase, 0)
        return { group, node, phase, probabilityLabel, probability: targetProbability, targetProbability, phaseTarget: item.phase }
      })
      basis.forEach(item => scene.add(item.group))

      const probabilityLines = basis.map((_, index) => {
        const geometry = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, -1.45, 0), statePositions[index]])
        const line = new THREE.Line(geometry, new THREE.LineBasicMaterial({ color: '#54d4c8', transparent: true, opacity: 0.08 }))
        scene.add(line)
        return line
      })
      const entanglementGeometry = new THREE.BufferGeometry().setFromPoints([sphereCenters[0], sphereCenters[1]])
      const entanglementLine = new THREE.Line(entanglementGeometry, new THREE.LineBasicMaterial({ color: '#79ebdc', transparent: true, opacity: dataRef.current.entanglement.concurrence, depthWrite: false }))
      scene.add(entanglementLine)
      const entanglementDots = Array.from({ length: 5 }, () => {
        const dot = new THREE.Mesh(new THREE.SphereGeometry(0.045, 10, 8), new THREE.MeshBasicMaterial({ color: '#9efff3', transparent: true, opacity: 0.95 }))
        dot.visible = dataRef.current.entanglement.concurrence > 0.01
        scene.add(dot)
        return dot
      })

      const raycaster = new THREE.Raycaster()
      const pointer = new THREE.Vector2()
      const onResize = () => {
        if (!host.clientWidth || !host.clientHeight) return
        camera.aspect = host.clientWidth / host.clientHeight
        camera.updateProjectionMatrix()
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
        renderer.setSize(host.clientWidth, host.clientHeight)
      }
      let hoveredTooltipObject: THREE.Object3D | null = null
      const onPointerMove = (event: PointerEvent) => {
        const bounds = renderer.domElement.getBoundingClientRect()
        pointer.set(((event.clientX - bounds.left) / bounds.width) * 2 - 1, -((event.clientY - bounds.top) / bounds.height) * 2 + 1)
        raycaster.setFromCamera(pointer, camera)
        const intersections = raycaster.intersectObjects([...spheres.flatMap(item => item.group.children), ...basis.flatMap(item => item.group.children)], false)
        const target = intersections.find(hit => typeof hit.object.userData.tooltip === 'string')?.object ?? null
        const tooltipText = typeof target?.userData.tooltip === 'string' ? target.userData.tooltip : null
        if (target !== hoveredTooltipObject) {
          hoveredTooltipObject = target
          if (tooltipText) setTooltip({ x: event.clientX - bounds.left, y: event.clientY - bounds.top, text: tooltipText })
          else setTooltip(null)
        } else if (tooltipText) {
          const x = event.clientX - bounds.left
          const y = event.clientY - bounds.top
          setTooltip(current => current && current.text === tooltipText && Math.abs(current.x - x) < 10 && Math.abs(current.y - y) < 10
            ? current
            : { x, y, text: tooltipText })
        }
      }
      const onPointerLeave = () => {
        hoveredTooltipObject = null
        setTooltip(null)
      }

      const resizeObserver = new ResizeObserver(onResize)
      resizeObserver.observe(host)
      const sceneObjects: SceneObjects = {
        renderer, scene, camera, controls, spheres, basis, entanglementLine, entanglementDots, probabilityLines,
        animationFrame: 0, resizeObserver, onResize, onPointerMove, onPointerLeave, controlsElement: renderer.domElement,
      }
      objects = sceneObjects
      objectsRef.current = sceneObjects
      window.addEventListener('resize', onResize)
      renderer.domElement.addEventListener('pointermove', onPointerMove)
      renderer.domElement.addEventListener('pointerleave', onPointerLeave)
      const initialConcurrence = dataRef.current.entanglement.concurrence
      entanglementLine.visible = layersRef.current.entanglement && initialConcurrence > 0.01
      probabilityLines.forEach((line, index) => {
        const strength = dataRef.current.probabilities[index]
        line.material.opacity = 0.05 + strength * 0.44
      })

      const animationStart = performance.now()
      const animate = () => {
        if (disposed) return
        sceneObjects.animationFrame = requestAnimationFrame(animate)
        const elapsed = (performance.now() - animationStart) / 1000
        sceneObjects.controls.update()
        sceneObjects.spheres.forEach((sphere, index) => {
          sphere.current.lerp(sphere.target, 0.065)
          const vector = sphere.current
          const direction = vector.lengthSq() > 1e-8 ? vector.clone().normalize() : new THREE.Vector3(0, 0, 1)
          sphere.vector.setDirection(direction)
          sphere.vector.setLength(Math.max(0.025, vector.length()), 0.17, 0.1)
          sphere.point.position.copy(vector)
          sphere.ring.position.copy(vector)
          sphere.ring.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), direction)
          sphere.point.scale.setScalar(1 + Math.sin(elapsed * 2.3 + index) * 0.045)
          const blochVector = dataRef.current.blochVectors[index]
          const qubitTooltip = `Q${index} · reduced single-qubit state\nBloch vector: ${blochVector.map(value => value.toFixed(2)).join(', ')}\n${dataRef.current.entanglement.isEntangled ? 'Not a complete representation of the entangled state.' : 'Pure-state direction when vector length is 1.'}`
          sphere.group.userData.tooltip = qubitTooltip
          sphere.vector.userData.tooltip = `Q${index} Bloch vector\nX ${blochVector[0].toFixed(2)} · Y ${blochVector[1].toFixed(2)} · Z ${blochVector[2].toFixed(2)}`
          sphere.point.userData.tooltip = qubitTooltip
        })
        sceneObjects.basis.forEach((item, index) => {
          item.probability += (item.targetProbability - item.probability) * 0.08
          const probability = Math.max(0, Math.min(1, item.probability))
          const radius = 0.12 + 0.44 * Math.sqrt(probability)
          item.node.scale.setScalar(radius / 0.31)
          item.node.material.opacity = 0.12 + 0.88 * probability
          item.node.material.emissiveIntensity = 0.3 + probability * 1.7
          item.group.visible = layersRef.current.probability && (probability > 0.003 || item.targetProbability > 0.003)
          item.phase.rotation.set(item.phaseTarget * 0.6, item.phaseTarget + elapsed * (0.08 + probability * 0.12), 0)
          item.phase.material.opacity = probability > 1e-8 ? 0.25 + probability * 0.6 : 0.1
          item.node.userData.tooltip = `State |${dataRef.current.basisStates[index].label}⟩\nProbability: ${(dataRef.current.basisStates[index].probability * 100).toFixed(1)}%\nAmplitude: ${dataRef.current.basisStates[index].magnitude.toFixed(3)}\nPhase: ${(dataRef.current.basisStates[index].phase * 180 / Math.PI).toFixed(1)}°`
          const nextLabel = `${Math.round(dataRef.current.probabilities[index] * 100)}%`
          if (item.probabilityLabel.userData.label !== nextLabel) {
            updateTextSprite(item.probabilityLabel, nextLabel, '#7be6db')
          }
          const phaseRing = item.phase
          phaseRing.rotation.z += 0.0015
        })
        sceneObjects.probabilityLines.forEach((line, index) => {
          line.visible = layersRef.current.probability && sceneObjects.basis[index].targetProbability > 0.003
          line.material.opacity = 0.05 + sceneObjects.basis[index].probability * 0.44
        })
        const concurrence = dataRef.current.entanglement.concurrence
        sceneObjects.entanglementLine.material.opacity = concurrence * (0.72 + Math.sin(elapsed * 2.2) * 0.12)
        sceneObjects.entanglementLine.visible = layersRef.current.entanglement && concurrence > 0.01
        sceneObjects.entanglementDots.forEach((dot, index) => {
          dot.visible = layersRef.current.entanglement && layersRef.current.particles && concurrence > 0.01
          if (dot.visible) {
            const t = (elapsed * 0.18 + index / sceneObjects.entanglementDots.length) % 1
            dot.position.lerpVectors(sphereCenters[0], sphereCenters[1], t)
          }
        })
        const measurement = observedOutcomeRef.current
        if (measurement !== null && measurement >= 0 && measurement < sceneObjects.basis.length) {
          sceneObjects.basis.forEach((item, index) => {
            if (index === measurement) item.node.material.emissiveIntensity = 2 + Math.sin(elapsed * 5) * 0.6
            else item.node.material.opacity = Math.min(item.node.material.opacity, 0.12)
          })
        }
        stars.rotation.y = elapsed * 0.003
        stars.visible = layersRef.current.particles
        renderer.render(scene, camera)
      }
      animate()
      onResize()
      setUnavailable(false)
    } catch (error) {
      console.error('Three.js quantum visualization could not be initialized.', error)
      setUnavailable(true)
    }

    return () => {
      disposed = true
      if (!objects) return
      cancelAnimationFrame(objects.animationFrame)
      window.removeEventListener('resize', objects.onResize)
      objects.controlsElement.removeEventListener('pointermove', objects.onPointerMove)
      objects.controlsElement.removeEventListener('pointerleave', objects.onPointerLeave)
      objects.resizeObserver.disconnect()
      objects.controls.dispose()
      objects.scene.traverse(object => {
        if (object instanceof THREE.Mesh || object instanceof THREE.Line || object instanceof THREE.Points) {
          object.geometry.dispose()
          const materials = Array.isArray(object.material) ? object.material : [object.material]
          materials.forEach(material => material.dispose())
        }
        if (object instanceof THREE.Sprite) object.material.map?.dispose()
      })
      objects.renderer.dispose()
      objects.renderer.domElement.remove()
      objectsRef.current = null
    }
  }, [])

  function resetCamera() {
    const objects = objectsRef.current
    if (!objects) return
    objects.camera.position.set(0, 1.4, 10.5)
    objects.controls.target.set(0, -0.1, 0)
    objects.controls.update()
  }

  function toggleLayer(layer: keyof Layers) {
    setLayers(current => ({ ...current, [layer]: !current[layer] }))
  }

  return <section className="quantum-scene-panel panel">
    <div className="scene-heading">
      <div><span className="eyebrow">ASPIRO · 3D QUANTUM LAB</span><h2>Quantum state space</h2><p>Renderer visualizes simulator output · drag to orbit, scroll to zoom</p></div>
      <div className="scene-controls">
        <button className="ghost" onClick={resetCamera}>RESET CAMERA</button>
        <button className="enter-3d" onClick={onEnter3d}>3D DEMO · LOAD BELL</button>
      </div>
    </div>
    {unavailable
      ? <div className="scene-unavailable" role="status">3D visualization is unavailable on this device. The quantum experiment is still available in the 2D lab.</div>
      : <div className="quantum-scene-host" ref={hostRef}>
        <div className="scene-overlay">
          <span className="overlay-title">SIMULATION SNAPSHOT</span>
          <span>|ψ⟩ = {data.basisStates.map(item => `${fmt(item.amplitude)}|${item.label}⟩`).join(' + ')}</span>
          <span>Concurrence · {data.entanglement.concurrence.toFixed(2)} {data.entanglement.isEntangled ? '· entangled' : '· separable'}</span>
          {observedOutcome !== null && <span className="observed-outcome">Observed sample · |{data.basisStates[observedOutcome]?.label}⟩</span>}
        </div>
        <div className="scene-legend"><span>Probability → node size / glow</span><span>Phase → ring orientation</span><span>Amplitude → |a| · probability → |a|²</span></div>
        {tooltip && <div className="scene-tooltip" style={{ left: Math.min(tooltip.x + 14, 360), top: Math.min(tooltip.y + 14, 250) }}>{tooltip.text}</div>}
        <div className="scene-layer-toggles" aria-label="Visualization layers">
          <button className={layers.bloch ? 'selected' : ''} onClick={() => toggleLayer('bloch')}>BLOCH</button>
          <button className={layers.probability ? 'selected' : ''} onClick={() => toggleLayer('probability')}>PROBABILITY</button>
          <button className={layers.entanglement ? 'selected' : ''} onClick={() => toggleLayer('entanglement')}>ENTANGLEMENT</button>
          <button className={layers.particles ? 'selected' : ''} onClick={() => toggleLayer('particles')}>PARTICLES</button>
        </div>
        <div className="scene-caption">{data.entanglement.isEntangled ? 'Reduced single-qubit states · linked by simulator concurrence' : 'Reduced single-qubit Bloch vectors · current basis-state probability distribution'}</div>
      </div>}
    <div className="scene-timeline"><span className="timeline-label">CIRCUIT OPERATIONS</span>    {timeline.length ? timeline.map((operation, index) => <span className={`timeline-gate ${index === timeline.length - 1 ? 'latest' : ''}`} key={operation.id}>{operation.gate === 'M' ? `MEASURE Q${operation.qubit}` : `${operation.gate} Q${operation.qubit}`}{operation.gate === 'CNOT' ? `→Q${operation.target ?? 1 - operation.qubit}` : ''}{operation.gate.startsWith('R') ? ` ${operation.angle ?? 90}°` : ''}</span>) : <span className="timeline-empty">No gates in circuit · |00⟩ initial state</span>}</div>
    <p className="scene-disclaimer">Conceptual scientific visualization · sphere vectors show reduced states; basis nodes visualize probabilities and phase, not physical particles.</p>
  </section>
}

function makeTextSprite(text: string, color: string, scale = 0.68): THREE.Sprite {
  const canvas = document.createElement('canvas')
  canvas.width = 256
  canvas.height = 96
  const context = canvas.getContext('2d')
  if (context) {
    context.font = '500 34px "DM Mono", monospace'
    context.fillStyle = color
    context.textAlign = 'center'
    context.textBaseline = 'middle'
    context.fillText(text, canvas.width / 2, canvas.height / 2)
  }
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false, opacity: 0.94 }))
  sprite.scale.set(scale, scale * 0.38, 1)
  sprite.userData.label = text
  return sprite
}

function updateTextSprite(sprite: THREE.Sprite, text: string, color: string) {
  const texture = sprite.material.map
  if (!(texture?.image instanceof HTMLCanvasElement)) return
  const canvas = texture.image
  const context = canvas.getContext('2d')
  if (!context) return
  context.clearRect(0, 0, canvas.width, canvas.height)
  context.font = '500 34px "DM Mono", monospace'
  context.fillStyle = color
  context.textAlign = 'center'
  context.textBaseline = 'middle'
  context.fillText(text, canvas.width / 2, canvas.height / 2)
  sprite.userData.label = text
  texture.needsUpdate = true
}
