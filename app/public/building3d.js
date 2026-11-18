// The company's building at night, drawn with Three.js.
// Eleven levels: G (lobby), 1 to 8 (departments), 9 (chief of staff), R (terrace, JARVIS).
// A floor glows amber while someone on it is working; the selected floor gets a bright edge.
import * as THREE from 'three'

export const LEVELS = ['lobby', 'finance', 'operations', 'marketing', 'sales', 'tech', 'support', 'hr', 'legal', 'office', 'terrace']
const H = 3.4                 // floor height
const W = 16, D = 11          // tower footprint
const AMBER = new THREE.Color('#ffb02e'), CYAN = new THREE.Color('#5fd4ff'), WARM = new THREE.Color('#fff1d6')

// Random lit windows on a canvas, shared by the city blocks.
function windowTexture({ cols = 8, rows = 12, lit = 0.55, seed = 1 } = {}) {
  let s = seed
  const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647
  const c = document.createElement('canvas'); c.width = cols * 16; c.height = rows * 16
  const g = c.getContext('2d')
  g.fillStyle = '#05070c'; g.fillRect(0, 0, c.width, c.height)
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
    if (rnd() > lit) continue
    const warm = rnd() > 0.35
    g.fillStyle = warm ? `rgba(255,${200 + rnd() * 40 | 0},${150 + rnd() * 60 | 0},${0.55 + rnd() * 0.45})` : `rgba(190,225,255,${0.4 + rnd() * 0.4})`
    g.fillRect(x * 16 + 3, y * 16 + 4, 10, 8)
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace
  return t
}

// One office floor seen through glass: a row of desks with lit screens.
function floorTexture(lit) {
  const c = document.createElement('canvas'); c.width = 512; c.height = 64
  const g = c.getContext('2d')
  const grd = g.createLinearGradient(0, 0, 0, 64); grd.addColorStop(0, '#14243a'); grd.addColorStop(1, '#1b2c44')
  g.fillStyle = grd; g.fillRect(0, 0, 512, 64)
  g.fillStyle = 'rgba(235,242,255,0.9)'
  for (let x = 8; x < 512; x += 46) g.fillRect(x, 6, 30, 3)            // ceiling lights
  for (let x = 14; x < 512; x += 42) {
    g.fillStyle = '#1b2a3d'; g.fillRect(x, 40, 26, 10)                 // desk
    g.fillStyle = lit ? 'rgba(255,190,90,0.9)' : 'rgba(120,190,255,0.7)'; g.fillRect(x + 8, 30, 10, 8) // screen
  }
  for (let x = 0; x < 512; x += 64) { g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(x, 0, 2, 64) } // mullions
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = THREE.RepeatWrapping
  return t
}

export function createBuilding(canvas, { onSelect = () => {} } = {}) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' })
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.15
  const scene = new THREE.Scene()
  scene.background = new THREE.Color('#03050a')
  scene.fog = new THREE.FogExp2('#03050a', 0.0068)

  const camera = new THREE.PerspectiveCamera(42, 1, 0.5, 600)
  scene.add(new THREE.HemisphereLight('#5a78a8', '#05060a', 0.55))
  const moon = new THREE.DirectionalLight('#9fb8ff', 0.7); moon.position.set(-40, 80, 30); scene.add(moon)
  const lobbyLight = new THREE.PointLight('#ffcf8a', 60, 40, 1.6); lobbyLight.position.set(0, 3, D / 2 + 6); scene.add(lobbyLight)

  // Ground, roads and street lights.
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(600, 600), new THREE.MeshStandardMaterial({ color: '#0a0d13', roughness: 0.95 }))
  ground.rotation.x = -Math.PI / 2; scene.add(ground)
  const roadMat = new THREE.MeshStandardMaterial({ color: '#151a24', roughness: 0.8 })
  const stripeMat = new THREE.MeshBasicMaterial({ color: '#c9d2e3' })
  for (const [x, z, w, d] of [[0, 26, 600, 9], [0, -34, 600, 9], [30, 0, 9, 600], [-34, 0, 9, 600]]) {
    const r = new THREE.Mesh(new THREE.PlaneGeometry(w, d), roadMat); r.rotation.x = -Math.PI / 2; r.position.set(x, 0.02, z); scene.add(r)
    const along = w > d
    for (let i = -280; i < 280; i += 9) {
      const s = new THREE.Mesh(new THREE.PlaneGeometry(along ? 3 : 0.25, along ? 0.25 : 3), stripeMat)
      s.rotation.x = -Math.PI / 2; s.position.set(along ? i : x, 0.03, along ? z : i); scene.add(s)
    }
  }
  const plaza = new THREE.Mesh(new THREE.BoxGeometry(W + 14, 0.4, D + 14), new THREE.MeshStandardMaterial({ color: '#2a2f38', roughness: 0.7 }))
  plaza.position.y = 0.2; scene.add(plaza)
  const lampMat = new THREE.MeshBasicMaterial({ color: '#fff4dc' })
  for (let i = -3; i <= 3; i++) for (const z of [21, -29]) {
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.28, 8, 8), lampMat); lamp.position.set(i * 12, 5, z); scene.add(lamp)
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 5), new THREE.MeshStandardMaterial({ color: '#30353f' })); pole.position.set(i * 12, 2.5, z); scene.add(pole)
  }
  // Trees around the plaza.
  const leaf = new THREE.MeshStandardMaterial({ color: '#1f6b45', roughness: 0.9 }), trunk = new THREE.MeshStandardMaterial({ color: '#3b2d22' })
  for (let i = 0; i < 22; i++) {
    const a = (i / 22) * Math.PI * 2, rx = (W / 2 + 8) * Math.cos(a), rz = (D / 2 + 8) * Math.sin(a)
    const t = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.2, 1.6), trunk); t.position.set(rx, 1.2, rz); scene.add(t)
    const c = new THREE.Mesh(new THREE.IcosahedronGeometry(1.1, 0), leaf); c.position.set(rx, 2.6, rz); scene.add(c)
  }

  // The city around it.
  const cityTex = [1, 2, 3, 4].map(seed => windowTexture({ seed: seed * 977, lit: 0.45 + seed * 0.05 }))
  let seed = 7
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647
  for (let gx = -7; gx <= 7; gx++) for (let gz = -7; gz <= 7; gz++) {
    const dist = Math.hypot(gx, gz) * 22
    if (dist < 84 || dist > 170) continue      // keep the camera's orbit clear around the tower
    if (rnd() < 0.3) continue
    const h = 14 + rnd() * (dist < 120 ? 55 : 35), w = 9 + rnd() * 9, d = 9 + rnd() * 9
    const tex = cityTex[(rnd() * 4) | 0].clone(); tex.needsUpdate = true; tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(w / 10, h / 14)
    const mat = new THREE.MeshStandardMaterial({ color: '#0b0f17', emissive: '#ffffff', emissiveMap: tex, emissiveIntensity: 1.5, roughness: 0.6 })
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), [mat, mat, new THREE.MeshStandardMaterial({ color: '#0b0f17' }), mat, mat, mat])
    b.position.set(gx * 22 + (rnd() - 0.5) * 6, h / 2, gz * 22 + (rnd() - 0.5) * 6); scene.add(b)
  }

  // The tower: one group per level, so each can glow and be picked.
  const tower = new THREE.Group(); tower.position.y = 0.4; scene.add(tower)
  const floors = LEVELS.map((id, i) => {
    const g = new THREE.Group(); g.position.y = i * H; g.userData.id = id; tower.add(g)
    const terrace = id === 'terrace', lobby = id === 'lobby'
    const tex = floorTexture(false); tex.repeat.set(W / 16, 1)
    const glassMat = new THREE.MeshStandardMaterial({ color: '#0d1826', emissive: '#ffffff', emissiveMap: tex, emissiveIntensity: lobby ? 1.6 : 1.15, metalness: 0.5, roughness: 0.18 })
    const inset = terrace ? 3 : 0
    const glass = new THREE.Mesh(new THREE.BoxGeometry(W - 0.6 - inset * 2, H - 0.5, D - 0.6 - inset * 2), glassMat)
    glass.position.y = H / 2; glass.userData.id = id; g.add(glass)
    const slab = new THREE.Mesh(new THREE.BoxGeometry(W + 0.6, 0.35, D + 0.6), new THREE.MeshStandardMaterial({ color: '#cfd3da', roughness: 0.5 }))
    slab.userData.id = id; g.add(slab)
    // Neon edge under each slab: cyan normally, amber when the floor is busy or selected.
    const edgeMat = new THREE.MeshBasicMaterial({ color: CYAN })
    const edge = new THREE.Group()
    for (const [w, d, x, z] of [[W + 0.7, 0.12, 0, D / 2 + 0.35], [W + 0.7, 0.12, 0, -D / 2 - 0.35], [0.12, D + 0.7, W / 2 + 0.35, 0], [0.12, D + 0.7, -W / 2 - 0.35, 0]]) {
      const e = new THREE.Mesh(new THREE.BoxGeometry(w, 0.16, d), edgeMat); e.position.set(x, 0.2, z); edge.add(e)
    }
    g.add(edge)
    if (terrace) { // pergola and planters on the roof
      const wood = new THREE.MeshStandardMaterial({ color: '#7a5a3a', roughness: 0.8 })
      for (let x = -W / 2 + 1; x <= W / 2 - 1; x += 1.4) { const p = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.25, D - 2), wood); p.position.set(x, H - 0.2, 0); g.add(p) }
      for (const x of [-W / 2 + 1, W / 2 - 1]) { const pl = new THREE.Mesh(new THREE.BoxGeometry(1, 0.8, D - 2), new THREE.MeshStandardMaterial({ color: '#244f35' })); pl.position.set(x, 0.6, 0); g.add(pl) }
    }
    return { id, group: g, glassMat, tex, edgeMat, busy: false, selected: false }
  })
  // Light strips up the corners, like the real tower.
  const strip = new THREE.MeshBasicMaterial({ color: WARM })
  for (const [x, z] of [[W / 2 + 0.2, D / 2 + 0.2], [-W / 2 - 0.2, D / 2 + 0.2], [W / 2 + 0.2, -D / 2 - 0.2], [-W / 2 - 0.2, -D / 2 - 0.2]]) {
    const s = new THREE.Mesh(new THREE.BoxGeometry(0.25, H * (LEVELS.length - 1), 0.25), strip); s.position.set(x, 0.4 + (H * (LEVELS.length - 1)) / 2, z); scene.add(s)
  }
  // Sign over the entrance.
  const sc = document.createElement('canvas'); sc.width = 512; sc.height = 96
  const sg = sc.getContext('2d'); sg.fillStyle = '#0b1220'; sg.fillRect(0, 0, 512, 96)
  sg.font = '700 52px Archivo, sans-serif'; sg.fillStyle = '#bfe9ff'; sg.textAlign = 'center'; sg.textBaseline = 'middle'; sg.fillText('CORPORATE AI', 256, 50)
  const signTex = new THREE.CanvasTexture(sc); signTex.colorSpace = THREE.SRGBColorSpace
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(7, 1.3), new THREE.MeshBasicMaterial({ map: signTex }))
  sign.position.set(0, 0.4 + H - 0.7, D / 2 + 0.36); scene.add(sign)

  // Camera: slow orbit around the whole tower; selecting a floor glides to it.
  const top = H * LEVELS.length
  const view = { angle: 0.55, radius: 80, y: 30, lookY: top * 0.5 }
  const goal = { ...view }
  let selected = null, idle = 0

  function select(id, { fromClick = false } = {}) {
    selected = id
    floors.forEach(f => { f.selected = f.id === id; paint(f) })
    const i = LEVELS.indexOf(id)
    if (i < 0) Object.assign(goal, { radius: 80, y: 30, lookY: top * 0.5 })
    else Object.assign(goal, { radius: 34, y: i * H + 6, lookY: i * H + H / 2 })
    idle = 0
    if (fromClick) onSelect(id)
  }

  function paint(f) {
    const on = f.selected || f.busy
    f.edgeMat.color.copy(on ? AMBER : CYAN)
    f.glassMat.emissiveIntensity = f.id === 'lobby' ? 1.6 : f.busy ? 2.0 : f.selected ? 1.6 : 1.15
    f.glassMat.emissive.copy(f.busy ? new THREE.Color('#ffd9a0') : new THREE.Color('#ffffff'))
  }

  // Busy floors: { finance: true, ... }
  function setBusy(map) {
    floors.forEach(f => { const b = !!map[f.id]; if (b !== f.busy) { f.busy = b; paint(f) } })
  }

  const ray = new THREE.Raycaster(), ptr = new THREE.Vector2()
  let down = null
  canvas.addEventListener('pointerdown', (e) => { down = [e.clientX, e.clientY] })
  canvas.addEventListener('pointerup', (e) => {
    if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 6) return
    const r = canvas.getBoundingClientRect()
    ptr.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1)
    ray.setFromCamera(ptr, camera)
    const hit = ray.intersectObjects(tower.children, true).find(h => h.object.userData.id || h.object.parent?.userData.id)
    if (hit) select(hit.object.userData.id || hit.object.parent.userData.id, { fromClick: true })
  })
  // Drag to turn the view.
  let dragging = null
  canvas.addEventListener('pointerdown', (e) => { dragging = { x: e.clientX, a: goal.angle } })
  addEventListener('pointerup', () => { dragging = null })
  addEventListener('pointermove', (e) => { if (dragging) { goal.angle = dragging.a - (e.clientX - dragging.x) * 0.005; idle = 0 } })

  function resize() {
    const w = canvas.clientWidth, h = canvas.clientHeight
    renderer.setSize(w, h, false); camera.aspect = w / h
    camera.fov = w < 700 ? 55 : 42; camera.updateProjectionMatrix()
  }
  addEventListener('resize', resize); resize()

  const still = matchMedia('(prefers-reduced-motion: reduce)').matches
  const clock = new THREE.Clock()
  renderer.setAnimationLoop(() => {
    const dt = Math.min(clock.getDelta(), 0.05)
    idle += dt
    if (!still && !dragging && idle > 4) goal.angle += dt * (selected ? 0.02 : 0.05)
    const k = 1 - Math.pow(0.02, dt)
    for (const key of ['angle', 'radius', 'y', 'lookY']) view[key] += (goal[key] - view[key]) * k
    camera.position.set(Math.sin(view.angle) * view.radius, view.y, Math.cos(view.angle) * view.radius)
    camera.lookAt(0, view.lookY, 0)
    const t = clock.elapsedTime
    floors.forEach(f => { if (f.busy && !still) f.tex.offset.x = (t * 0.02) % 1 })
    renderer.render(scene, camera)
  })

  return { select, setBusy, levels: LEVELS }
}
