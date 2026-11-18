// The Corporate AI tower at night, in Three.js.
// Levels: G lobby (the podium), 1 to 8 departments, 9 chief of staff, R terrace (JARVIS).
// Overview: scroll moves the focus floor by floor, the camera follows and the floor gets an amber frame.
// enter(id) flies the camera inside that floor; exit() comes back out.
import * as THREE from 'three'
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js'
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js'

export const LEVELS = ['lobby', 'finance', 'operations', 'marketing', 'sales', 'tech', 'support', 'hr', 'legal', 'office', 'terrace']
const SIGN = { finance: 'FINANCE', operations: 'OPERATIONS', marketing: 'MARKETING', sales: 'SALES', tech: 'TECH', support: 'SUPPORT', hr: 'HR AND ADMIN', legal: 'LEGAL', office: 'CHIEF OF STAFF' }

// Dimensions (metres-ish)
const PW = 34, PD = 24, PH = 6.4        // podium (lobby)
const TW = 17, TD = 12, FH = 3.7        // tower and floor height
const levelBase = (i) => (i === 0 ? 0 : PH + (i - 1) * FH)
const levelMid = (i) => (i === 0 ? PH / 2 : i === 10 ? levelBase(10) + 2.5 : levelBase(i) + FH / 2)

const C = {
  stone: '#d9cdb8', stoneDark: '#b9ab94', slab: '#e8e2d6', glass: '#9fd8ff', cyan: '#62d8ff', amber: '#ffb02e',
  warm: '#ffe7b8', road: '#1a1d23', ground: '#121418', grass: '#2f7a46', leaf: '#2e8a55', wood: '#8a6440',
}

function canvasTex(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h
  draw(c.getContext('2d'), w, h)
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4
  return t
}
function rng(seed) { let s = seed >>> 0 || 1; return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296 }

// Neon text on a transparent canvas.
function neonText(text, { color = '#bdf0ff', glow = '#4cc9ff', size = 120, width = 1024, height = 200, font = '600' } = {}) {
  return canvasTex(width, height, (g, w, h) => {
    g.font = `${font} ${size}px Archivo, Arial, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'
    g.shadowColor = glow; g.shadowBlur = 28; g.fillStyle = color
    for (let i = 0; i < 3; i++) g.fillText(text, w / 2, h / 2)
  })
}

// City windows: big panes, mostly warm white, some cool.
function cityWindows(seed, cols, rows) {
  const r = rng(seed)
  return canvasTex(cols * 32, rows * 32, (g, w, h) => {
    g.fillStyle = '#1b1d22'; g.fillRect(0, 0, w, h)
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
      const on = r() < 0.62
      const warm = r() < 0.7
      g.fillStyle = on ? (warm ? `rgba(255,${226 + r() * 25 | 0},${170 + r() * 50 | 0},1)` : `rgba(${190 + r() * 40 | 0},228,255,1)`) : '#2a2d33'
      g.fillRect(x * 32 + 4, y * 32 + 6, 24, 18)
    }
  })
}

export function createBuilding(canvas, { onFocus = () => {}, onEnter = () => {} } = {}) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' })
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75))
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.3
  renderer.shadowMap.enabled = false

  const scene = new THREE.Scene()
  scene.background = new THREE.Color('#171a20')
  scene.fog = new THREE.Fog('#171a20', 55, 210)
  const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 700)

  scene.add(new THREE.HemisphereLight('#a9bad6', '#2a2520', 1.9))
  const moon = new THREE.DirectionalLight('#c8d6ff', 1.1); moon.position.set(-60, 120, 80); scene.add(moon)
  const fill = new THREE.DirectionalLight('#ffd8a8', 0.5); fill.position.set(80, 40, -40); scene.add(fill)

  const M = {
    stone: new THREE.MeshStandardMaterial({ color: C.stone, roughness: 0.85 }),
    stoneDark: new THREE.MeshStandardMaterial({ color: C.stoneDark, roughness: 0.9 }),
    slab: new THREE.MeshStandardMaterial({ color: C.slab, roughness: 0.7 }),
    glass: new THREE.MeshStandardMaterial({ color: '#2a4a63', metalness: 0.2, roughness: 0.05, transparent: true, opacity: 0.14, depthWrite: false }),
    mullion: new THREE.MeshStandardMaterial({ color: '#1d2228', roughness: 0.6 }),
    cyan: new THREE.MeshBasicMaterial({ color: C.cyan }),
    warm: new THREE.MeshBasicMaterial({ color: C.warm }),
    amber: new THREE.MeshBasicMaterial({ color: C.amber }),
    floorIn: new THREE.MeshStandardMaterial({ color: '#a4aab2', emissive: '#3a4a58', emissiveIntensity: 0.6, roughness: 0.8 }),
    ceiling: new THREE.MeshStandardMaterial({ color: '#d5d8dd', emissive: '#8a9aa8', emissiveIntensity: 0.5, roughness: 0.9 }),
    light: new THREE.MeshBasicMaterial({ color: '#ffffff' }),
    desk: new THREE.MeshStandardMaterial({ color: '#e9ecef', roughness: 0.6 }),
    deskDark: new THREE.MeshStandardMaterial({ color: '#3a3f46', roughness: 0.7 }),
    chair: new THREE.MeshStandardMaterial({ color: '#2b2f35', roughness: 0.8 }),
    screen: new THREE.MeshBasicMaterial({ color: '#dff4ff' }),
    screenWarm: new THREE.MeshBasicMaterial({ color: '#fff0d0' }),
    body: new THREE.MeshStandardMaterial({ color: '#3f8aa0', roughness: 0.7 }),
    head: new THREE.MeshBasicMaterial({ color: '#e6f7ff' }),
    headBusy: new THREE.MeshBasicMaterial({ color: '#ffd28a' }),
    table: new THREE.MeshStandardMaterial({ color: '#8a6d55', roughness: 0.7 }),
    partition: new THREE.MeshStandardMaterial({ color: '#5a626c', emissive: '#22303c', emissiveIntensity: 0.5, roughness: 0.8 }),
    wood: new THREE.MeshStandardMaterial({ color: C.wood, roughness: 0.8 }),
    grass: new THREE.MeshStandardMaterial({ color: C.grass, roughness: 1 }),
    leaf: new THREE.MeshStandardMaterial({ color: C.leaf, roughness: 0.9, flatShading: true }),
    trunk: new THREE.MeshStandardMaterial({ color: '#5a4636', roughness: 1 }),
    water: new THREE.MeshStandardMaterial({ color: '#6fc6e8', emissive: '#1d6f8f', emissiveIntensity: 0.6, roughness: 0.15 }),
    road: new THREE.MeshStandardMaterial({ color: C.road, roughness: 0.95 }),
    pave: new THREE.MeshStandardMaterial({ color: '#8d9096', roughness: 0.9 }),
    dark: new THREE.MeshStandardMaterial({ color: '#1f2329', roughness: 0.6 }),
    lamp: new THREE.MeshBasicMaterial({ color: '#fff6e0' }),
  }
  const G = {
    box: new THREE.BoxGeometry(1, 1, 1),
    cyl: new THREE.CylinderGeometry(0.5, 0.5, 1, 12),
    sphere: new THREE.SphereGeometry(0.5, 14, 10),
    tree: new THREE.IcosahedronGeometry(1, 0),
  }
  const box = (mat, w, h, d, x, y, z, parent = scene) => { const m = new THREE.Mesh(G.box, mat); m.scale.set(w, h, d); m.position.set(x, y, z); parent.add(m); return m }
  const cyl = (mat, r, h, x, y, z, parent = scene) => { const m = new THREE.Mesh(G.cyl, mat); m.scale.set(r * 2, h, r * 2); m.position.set(x, y, z); parent.add(m); return m }

  // ---------- Ground, roads, plaza ----------
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(900, 900), new THREE.MeshStandardMaterial({ color: C.ground, roughness: 1 }))
  ground.rotation.x = -Math.PI / 2; scene.add(ground)
  const roads = [[0, 32, 900, 14], [0, -34, 900, 14], [40, 0, 14, 900], [-42, 0, 14, 900]]
  const dash = new THREE.MeshBasicMaterial({ color: '#d8dce4' })
  for (const [x, z, w, d] of roads) {
    box(M.road, w, 0.05, d, x, 0.03, z)
    const along = w > d
    for (let i = -440; i < 440; i += 10) box(dash, along ? 3.2 : 0.3, 0.02, along ? 0.3 : 3.2, along ? i : x, 0.07, along ? z : i)
  }
  box(M.pave, PW + 18, 0.5, PD + 18, 0, 0.25, 0)                 // plaza
  // Stairs up to the entrance
  for (let s = 0; s < 3; s++) box(M.slab, 14, 0.25, 1.2, -3, 0.62 + s * 0.25, PD / 2 + 3.4 - s * 1.0)

  // ---------- Podium (lobby) ----------
  const podium = new THREE.Group(); scene.add(podium)
  box(M.stone, PW, PH, PD, 0, 0.5 + PH / 2, 0, podium)
  // Lobby glass front and interior
  const lobbyGlass = box(M.glass, 18, PH - 1.2, 0.2, -3, 0.5 + (PH - 1.2) / 2 + 0.2, PD / 2 + 0.11, podium)
  lobbyGlass.renderOrder = 2
  // Cut-out look: a dark recess behind the glass
  box(M.dark, 17.6, PH - 1.4, 0.3, -3, 0.5 + (PH - 1.4) / 2 + 0.2, PD / 2 - 0.2, podium).visible = false
  // Entrance columns
  for (const x of [-12.5, 6.5]) box(M.stone, 2.2, PH, 2.2, x, 0.5 + PH / 2, PD / 2 + 0.6, podium)
  // Canopy with neon sign
  box(M.dark, 13, 0.5, 6, -3, 0.5 + PH - 1.6, PD / 2 + 3.5, podium)
  box(M.cyan, 13.1, 0.08, 0.08, -3, 0.5 + PH - 1.85, PD / 2 + 6.5, podium)
  for (const x of [-9, 3]) cyl(M.dark, 0.12, PH - 1.8, x, 0.5 + (PH - 1.8) / 2, PD / 2 + 6.2, podium)
  const canopySign = new THREE.Mesh(new THREE.PlaneGeometry(9, 1.6), new THREE.MeshBasicMaterial({ map: neonText('CORPORATE AI', { size: 130 }), transparent: true, depthWrite: false }))
  canopySign.position.set(-3, 0.5 + PH - 1.1, PD / 2 + 4.2); canopySign.rotation.x = -0.35; podium.add(canopySign)
  // Fountains either side of the stairs
  for (const x of [-14, 8]) {
    box(M.slab, 7.5, 0.6, 4.2, x, 0.8, PD / 2 + 5.5, podium)
    box(M.water, 7, 0.1, 3.7, x, 1.12, PD / 2 + 5.5, podium)
    for (let j = 0; j < 4; j++) { cyl(M.lamp, 0.05, 1.2, x - 2.6 + j * 1.75, 1.7, PD / 2 + 5.5, podium); const s = new THREE.Mesh(G.sphere, M.lamp); s.scale.setScalar(0.22); s.position.set(x - 2.6 + j * 1.75, 2.35, PD / 2 + 5.5); podium.add(s) }
  }
  // Monument sign
  box(M.stone, 6, 1.8, 1.2, -19, 1.4, PD / 2 + 8)
  const mon = new THREE.Mesh(new THREE.PlaneGeometry(5.4, 1.1), new THREE.MeshBasicMaterial({ map: neonText('CORPORATE AI', { color: '#f4ead8', glow: '#ffffff', size: 110 }), transparent: true }))
  mon.position.set(-19, 1.5, PD / 2 + 8.61); scene.add(mon)
  // Roof garden on the podium: grass, pergola, glass rail, cyan edge
  const roofY = 0.5 + PH
  box(M.slab, PW + 0.6, 0.35, PD + 0.6, 0, roofY, 0)
  box(M.grass, 7, 0.3, PD - 2, PW / 2 - 4.5, roofY + 0.3, 0)
  for (const [w, d, x, z] of [[PW + 0.8, 0.12, 0, PD / 2 + 0.4], [0.12, PD + 0.8, PW / 2 + 0.4, 0], [0.12, PD + 0.8, -PW / 2 - 0.4, 0], [PW + 0.8, 0.12, 0, -PD / 2 - 0.4]]) box(M.cyan, w, 0.12, d, x, roofY - 0.1, z)
  const rail = box(M.glass, PW, 1.1, 0.06, 0, roofY + 0.75, PD / 2 + 0.2); rail.renderOrder = 2
  for (let x = -PW / 2 + 1; x < PW / 2 - 6; x += 1.1) box(M.wood, 0.3, 0.25, 5, x, roofY + 3.4, PD / 2 - 2.8)
  box(M.wood, PW - 7, 0.35, 0.35, -3.5, roofY + 3.2, PD / 2 - 0.6); box(M.wood, PW - 7, 0.35, 0.35, -3.5, roofY + 3.2, PD / 2 - 5)
  for (let x = -PW / 2 + 1; x <= PW / 2 - 7; x += 4.5) for (const z of [PD / 2 - 0.6, PD / 2 - 5]) cyl(M.dark, 0.12, 3.2, x, roofY + 1.7, z)

  // ---------- Tower floors ----------
  const floors = []
  const busyHeads = []
  function buildFloor(i) {
    const id = LEVELS[i], y = levelBase(i)
    const g = new THREE.Group(); g.position.y = y + 0.5; g.userData.id = id; scene.add(g)
    // slab and ceiling
    box(M.slab, TW + 0.8, 0.35, TD + 0.8, 0, 0, 0, g)
    box(M.floorIn, TW - 0.4, 0.05, TD - 0.4, 0, 0.2, 0, g)
    box(M.ceiling, TW - 0.4, 0.1, TD - 0.4, 0, FH - 0.15, 0, g)
    for (let x = -6; x <= 6; x += 3) box(M.light, 2.2, 0.06, 0.35, x, FH - 0.22, 0, g), box(M.light, 2.2, 0.06, 0.35, x, FH - 0.22, -3.5, g), box(M.light, 2.2, 0.06, 0.35, x, FH - 0.22, 3.5, g)
    // cyan neon edge along the slab
    for (const [w, d, x, z] of [[TW + 0.9, 0.1, 0, TD / 2 + 0.45], [0.1, TD + 0.9, TW / 2 + 0.45, 0], [0.1, TD + 0.9, -TW / 2 - 0.45, 0], [TW + 0.9, 0.1, 0, -TD / 2 - 0.45]]) box(M.cyan, w, 0.08, d, x, 0.1, z, g)
    // back wall with the department's neon sign and a task board
    box(M.partition, TW - 0.6, FH - 0.3, 0.2, 0, FH / 2, -TD / 2 + 0.4, g)
    const label = `${String(i).padStart(2, '0')} ${SIGN[id] || ''}`
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(7, 1.1), new THREE.MeshBasicMaterial({ map: neonText(label, { size: 110 }), transparent: true, depthWrite: false }))
    sign.position.set(3, FH - 0.9, -TD / 2 + 0.55); g.add(sign)
    box(M.dark, 3.4, 1.8, 0.1, -4, 1.9, -TD / 2 + 0.55, g)
    const cardColors = ['#ffe3b0', '#c7f0ff', '#ffc8c0', '#d8ffe0', '#ffe3b0', '#ffffff']
    for (let r = 0; r < 3; r++) for (let c2 = 0; c2 < 4; c2++) box(new THREE.MeshBasicMaterial({ color: cardColors[(r * 4 + c2) % 6] }), 0.6, 0.35, 0.05, -5.2 + c2 * 0.8, 2.5 - r * 0.5, -TD / 2 + 0.62, g)
    // desks in two rows with screens and chairs
    for (let row = 0; row < 2; row++) for (let k = 0; k < 4; k++) {
      const x = -6.5 + k * 3, z = -2 + row * 3.2
      box(M.desk, 2.2, 0.08, 1, x, 1.0, z, g)
      box(M.deskDark, 0.08, 1, 0.9, x - 1.05, 0.5, z, g); box(M.deskDark, 0.08, 1, 0.9, x + 1.05, 0.5, z, g)
      box(k % 2 ? M.screenWarm : M.screen, 0.7, 0.45, 0.04, x - 0.4, 1.35, z - 0.3, g); box(M.screen, 0.7, 0.45, 0.04, x + 0.4, 1.35, z - 0.3, g)
      box(M.chair, 0.6, 0.1, 0.6, x, 0.6, z + 0.9, g); box(M.chair, 0.6, 0.8, 0.08, x, 1.0, z + 1.2, g)
    }
    // meeting table at the front
    box(M.table, 5, 0.12, 1.8, 3.5, 1.0, 4.2, g)
    for (const dx of [-1.8, 0, 1.8]) for (const dz of [-1.3, 1.3]) { box(M.chair, 0.6, 0.1, 0.6, 3.5 + dx, 0.6, 4.2 + dz, g); box(M.chair, 0.6, 0.9, 0.08, 3.5 + dx, 1.05, 4.2 + dz * 1.25, g) }
    // three people at desks (the department's staff)
    const heads = []
    for (let p = 0; p < 3; p++) {
      const x = -6.5 + p * 3, z = -2 + 0.85
      const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.28, 0.55, 4, 8), M.body); body.position.set(x, 1.05, z); g.add(body)
      const head = new THREE.Mesh(G.sphere, M.head); head.scale.setScalar(0.42); head.position.set(x, 1.65, z); g.add(head)
      heads.push(head)
    }
    busyHeads.push(heads)
    // glass curtain wall with mullions
    const glass = new THREE.Group(); g.add(glass)
    for (const [w, d, x, z] of [[TW, 0.08, 0, TD / 2], [TW, 0.08, 0, -TD / 2], [0.08, TD, TW / 2, 0], [0.08, TD, -TW / 2, 0]]) { const pane = box(M.glass, w, FH - 0.4, d, x, FH / 2, z, glass); pane.renderOrder = 2 }
    for (let x = -TW / 2; x <= TW / 2 + 0.01; x += 1.7) { box(M.mullion, 0.1, FH - 0.4, 0.14, x, FH / 2, TD / 2, glass); box(M.mullion, 0.1, FH - 0.4, 0.14, x, FH / 2, -TD / 2, glass) }
    for (let z = -TD / 2; z <= TD / 2 + 0.01; z += 1.5) { box(M.mullion, 0.14, FH - 0.4, 0.1, TW / 2, FH / 2, z, glass); box(M.mullion, 0.14, FH - 0.4, 0.1, -TW / 2, FH / 2, z, glass) }
    // invisible pick volume
    const pick = new THREE.Mesh(G.box, new THREE.MeshBasicMaterial({ visible: false })); pick.scale.set(TW + 1, FH, TD + 1); pick.position.y = FH / 2; pick.userData.id = id; g.add(pick)
    return { id, i, group: g, pick, heads }
  }
  for (let i = 1; i <= 9; i++) floors.push(buildFloor(i))

  // Stone corner fins with warm light strips, running the height of the tower
  const towerTop = levelBase(10) + 0.5
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const x = sx * (TW / 2 + 0.9), z = sz * (TD / 2 + 0.9)
    box(M.stone, 2.2, towerTop - roofY, 2.2, x, roofY + (towerTop - roofY) / 2, z)
    box(M.warm, 0.12, towerTop - roofY - 0.5, 0.12, x - sx * 1.12, roofY + (towerTop - roofY) / 2, z + sz * 0.6)
    box(M.warm, 0.12, towerTop - roofY - 0.5, 0.12, x + sx * 0.6, roofY + (towerTop - roofY) / 2, z - sz * 1.12)
  }
  // Vertical stone fins on the side faces
  for (const sx of [-1, 1]) for (let z = -3; z <= 3; z += 3) box(M.stoneDark, 0.5, towerTop - roofY, 0.5, sx * (TW / 2 + 0.3), roofY + (towerTop - roofY) / 2, z)

  // ---------- Terrace with the JARVIS hologram ----------
  const terrace = new THREE.Group(); terrace.position.y = towerTop; scene.add(terrace)
  box(M.slab, TW + 4, 0.4, TD + 4, 0, 0, 0, terrace)
  for (const [w, d, x, z] of [[TW + 4.1, 0.12, 0, TD / 2 + 2], [0.12, TD + 4.1, TW / 2 + 2, 0], [0.12, TD + 4.1, -TW / 2 - 2, 0], [TW + 4.1, 0.12, 0, -TD / 2 - 2]]) box(M.cyan, w, 0.12, d, x, 0.2, z, terrace)
  for (let x = -TW / 2 - 1.5; x <= TW / 2 + 1.5; x += 0.9) { box(M.stone, 0.35, 2.4, 0.35, x, 1.4, TD / 2 + 1.8, terrace); box(M.stone, 0.35, 2.4, 0.35, x, 1.4, -TD / 2 - 1.8, terrace) }
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) { const p = new THREE.Mesh(new THREE.ConeGeometry(0.8, 2.2, 4), M.stone); p.position.set(sx * (TW / 2 + 1.6), 3.4, sz * (TD / 2 + 1.6)); terrace.add(p); const l = new THREE.Mesh(G.sphere, M.lamp); l.scale.setScalar(0.35); l.position.set(sx * (TW / 2 + 1.6), 4.6, sz * (TD / 2 + 1.6)); terrace.add(l) }
  // Hologram: a head made of points, a bright core and two orbit rings
  const holo = new THREE.Group(); holo.position.set(0, 7.5, 0); terrace.add(holo)
  const pts = [], pr = rng(42)
  for (let n = 0; n < 2600; n++) {
    const u = pr() * Math.PI * 2, v = Math.acos(2 * pr() - 1)
    let x = Math.sin(v) * Math.cos(u), y = Math.cos(v), z = Math.sin(v) * Math.sin(u)
    // shape a head: narrower jaw, flatter back, a hint of a nose
    x *= 0.78 * (y < -0.2 ? 0.75 + (y + 1) * 0.3 : 1); z *= 0.9; y *= 1.15
    if (z > 0.7 && Math.abs(x) < 0.12 && y > -0.35 && y < 0.15) z += 0.12
    pts.push(x * 3, y * 3, z * 3)
  }
  const holoGeo = new THREE.BufferGeometry(); holoGeo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3))
  holo.add(new THREE.Points(holoGeo, new THREE.PointsMaterial({ color: '#cdeeff', size: 0.07, transparent: true, opacity: 0.9, depthWrite: false })))
  const core = new THREE.Mesh(G.sphere, new THREE.MeshBasicMaterial({ color: '#e8fbff' })); core.scale.setScalar(1.6); holo.add(core)
  const ring1 = new THREE.Mesh(new THREE.TorusGeometry(6, 0.05, 8, 160), new THREE.MeshBasicMaterial({ color: C.cyan })); ring1.rotation.x = Math.PI / 2.4; holo.add(ring1)
  const ring2 = new THREE.Mesh(new THREE.TorusGeometry(5.2, 0.05, 8, 160), new THREE.MeshBasicMaterial({ color: C.amber })); ring2.rotation.set(Math.PI / 3, 0.6, 0); holo.add(ring2)
  const ring3 = new THREE.Mesh(new THREE.TorusGeometry(7.2, 0.035, 8, 160), new THREE.MeshBasicMaterial({ color: '#7fdcff', transparent: true, opacity: 0.6 })); ring3.rotation.set(-0.3, 0, 0.2); holo.add(ring3)
  const terracePick = new THREE.Mesh(G.box, new THREE.MeshBasicMaterial({ visible: false })); terracePick.scale.set(TW + 4, 8, TD + 4); terracePick.position.y = 4; terracePick.userData.id = 'terrace'; terrace.add(terracePick)

  // Lobby interior: reception desk, screens, a neon sign
  const lobby = new THREE.Group(); lobby.position.set(-3, 0.5, PD / 2 - 6); scene.add(lobby)
  cyl(M.dark, 1.6, 0.15, 0, 1.6, 0, lobby); cyl(M.dark, 0.5, 1.5, 0, 0.8, 0, lobby)
  const ls = new THREE.Mesh(new THREE.PlaneGeometry(12, 2.2), new THREE.MeshBasicMaterial({ map: neonText('CORPORATE AI', { size: 140 }), transparent: true, depthWrite: false }))
  ls.position.set(0, PH - 1.6, -5); lobby.add(ls)
  const tag = new THREE.Mesh(new THREE.PlaneGeometry(6, 0.5), new THREE.MeshBasicMaterial({ map: neonText('LED BY JARVIS   25 AI STAFF', { size: 70, color: '#e8f6ff' }), transparent: true }))
  tag.position.set(0, PH - 2.7, -4.95); lobby.add(tag)
  box(M.dark, 4, 2.6, 0.1, 6.5, 2.6, -4.9, lobby)
  for (let b = 0; b < 8; b++) box(new THREE.MeshBasicMaterial({ color: '#9ff3d6' }), 0.25, 0.4 + ((b * 37) % 11) / 6, 0.05, 5.2 + b * 0.38, 1.6 + (0.4 + ((b * 37) % 11) / 6) / 2, -4.83, lobby)
  box(M.dark, 3, 2, 0.1, -6.5, 2.4, -4.9, lobby)
  for (let q = 0; q < 4; q++) box(new THREE.MeshBasicMaterial({ color: ['#ffd8a8', '#c7f0ff', '#ffe9c9', '#ffffff'][q] }), 1.3, 0.85, 0.05, -7.2 + (q % 2) * 1.4, 2.85 - Math.floor(q / 2) * 0.95, -4.83, lobby)
  for (const x of [-5, 5]) box(M.desk, 3, 0.5, 1, x, 0.5, 2, lobby)
  const lobbyPick = new THREE.Mesh(G.box, new THREE.MeshBasicMaterial({ visible: false })); lobbyPick.scale.set(PW, PH, PD); lobbyPick.position.set(0, 0.5 + PH / 2, 0); lobbyPick.userData.id = 'lobby'; scene.add(lobbyPick)

  // ---------- Trees, lamps, cars ----------
  function roundTree(x, z, s = 1) {
    cyl(M.trunk, 0.15 * s, 1.8 * s, x, 0.9 * s + 0.5, z)
    for (const [dx, dy, dz, r] of [[0, 2.6, 0, 1.2], [0.6, 2.2, 0.3, 0.9], [-0.5, 2.3, -0.3, 0.9], [0, 3.3, 0, 0.8]]) { const t = new THREE.Mesh(G.tree, M.leaf); t.scale.setScalar(r * s); t.position.set(x + dx * s, dy * s + 0.5, z + dz * s); scene.add(t) }
  }
  function palm(x, z, h = 6) {
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.2, h, 6), M.trunk); trunk.position.set(x, h / 2 + 0.5, z); trunk.rotation.z = 0.05; scene.add(trunk)
    for (let k = 0; k < 7; k++) { const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.35, 2.6, 4), M.leaf); const a = (k / 7) * Math.PI * 2; leaf.position.set(x + Math.cos(a) * 1.1, h + 0.3, z + Math.sin(a) * 1.1); leaf.rotation.set(Math.sin(a) * 1.3, 0, -Math.cos(a) * 1.3); scene.add(leaf) }
  }
  function conifer(x, z, s = 1) {
    cyl(M.trunk, 0.15, 1.2, x, 1.1, z)
    for (let k = 0; k < 3; k++) { const c2 = new THREE.Mesh(new THREE.ConeGeometry((1.5 - k * 0.35) * s, 1.8 * s, 7), M.leaf); c2.position.set(x, (1.8 + k * 1.1) * s + 0.5, z); scene.add(c2) }
  }
  for (let k = 0; k < 6; k++) palm(PW / 2 + 3 + (k % 2) * 1.5, -PD / 2 + 2 + k * 4.2, 6 + (k % 3))
  for (let k = 0; k < 3; k++) palm(PW / 2 + 1 - k * 2.4, PD / 2 + 8.5, 5.5 + (k % 2))
  for (const [x, z, s] of [[-PW / 2 - 4, PD / 2 + 6, 1.1], [-PW / 2 - 6, -2, 1], [12, PD / 2 + 10, 1.2], [-8, PD / 2 + 12, 0.9], [-PW / 2 - 5, -PD / 2 - 3, 1]]) roundTree(x, z, s)
  for (let k = 0; k < 26; k++) conifer(52, -60 + k * 6, 1 + (k % 3) * 0.15)
  for (let k = 0; k < 14; k++) roundTree(-55 + (k % 2) * 4, -50 + k * 8, 0.9)
  const lampGlow = []
  for (let k = -5; k <= 5; k++) for (const z of [24, -26]) {
    cyl(M.dark, 0.08, 6, k * 14, 3.5, z)
    box(M.dark, 1.6, 0.12, 0.3, k * 14 + 0.7, 6.4, z)
    const l = box(M.lamp, 0.9, 0.08, 0.35, k * 14 + 1.2, 6.32, z); lampGlow.push(l)
  }
  const cars = []
  const carMat = [new THREE.MeshStandardMaterial({ color: '#b9bec6', roughness: 0.5 }), new THREE.MeshStandardMaterial({ color: '#3d4450', roughness: 0.5 }), new THREE.MeshStandardMaterial({ color: '#7d8590', roughness: 0.5 })]
  for (let k = 0; k < 8; k++) {
    const car = new THREE.Group()
    box(carMat[k % 3], 4.2, 1.1, 1.9, 0, 0.9, 0, car); box(carMat[k % 3], 2.4, 0.8, 1.7, -0.3, 1.8, 0, car)
    box(M.lamp, 0.1, 0.25, 0.4, 2.12, 0.95, 0.6, car); box(M.lamp, 0.1, 0.25, 0.4, 2.12, 0.95, -0.6, car)
    box(new THREE.MeshBasicMaterial({ color: '#ff4b3a' }), 0.1, 0.2, 0.4, -2.12, 0.95, 0.6, car); box(new THREE.MeshBasicMaterial({ color: '#ff4b3a' }), 0.1, 0.2, 0.4, -2.12, 0.95, -0.6, car)
    const lane = k % 4, alongX = lane < 2
    car.userData = { alongX, lane, speed: 9 + (k % 3) * 3, off: k * 97 }
    if (!alongX) car.rotation.y = Math.PI / 2
    scene.add(car); cars.push(car)
  }

  // ---------- City ----------
  const cr = rng(7)
  const texCache = [0, 1, 2, 3, 4, 5].map(s => cityWindows(100 + s * 31, 6, 14))
  for (let gx = -6; gx <= 6; gx++) for (let gz = -6; gz <= 6; gz++) {
    const x = gx * 30 + (cr() - 0.5) * 6, z = gz * 30 + (cr() - 0.5) * 6
    if (Math.abs(x) < 52 && Math.abs(z) < 48) continue          // keep the block around the tower clear
    if (Math.abs(x - 40) < 12 || Math.abs(x + 42) < 12 || Math.abs(z - 32) < 12 || Math.abs(z + 34) < 12) continue // roads
    if (cr() < 0.2) continue
    const h = 16 + cr() * (Math.hypot(x, z) < 130 ? 60 : 40), w = 12 + cr() * 8, d = 12 + cr() * 8
    const t = texCache[(cr() * 6) | 0].clone(); t.needsUpdate = true; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(Math.round(w / 3.5) / 6, Math.round(h / 3.4) / 14)
    const side = new THREE.MeshStandardMaterial({ color: '#202329', emissive: '#ffffff', emissiveMap: t, emissiveIntensity: 1.15, roughness: 0.8 })
    const b = new THREE.Mesh(G.box, [side, side, new THREE.MeshStandardMaterial({ color: '#25282e' }), side, side, side])
    b.scale.set(w, h, d); b.position.set(x, h / 2, z); scene.add(b)
  }

  // ---------- Focus frame ----------
  const frameMat = new THREE.MeshBasicMaterial({ color: C.amber, transparent: true, opacity: 0.95 })
  const frame = new THREE.Group(); scene.add(frame)
  const bars = Array.from({ length: 12 }, () => { const m = new THREE.Mesh(G.box, frameMat); frame.add(m); return m })
  const frameFill = new THREE.Mesh(G.box, new THREE.MeshBasicMaterial({ color: C.amber, transparent: true, opacity: 0.05, depthWrite: false })); scene.add(frameFill)
  function placeFrame(i) {
    let w, h, d, y
    if (i === 0) { w = PW + 0.6; h = PH; d = PD + 0.6; y = 0.5 + PH / 2 }
    else if (i === 10) { w = TW + 4.4; h = 3; d = TD + 4.4; y = towerTop + 1.5 }
    else { w = TW + 5.4; h = FH; d = TD + 5.4; y = levelBase(i) + 0.5 + FH / 2 }
    const t = 0.14
    const spec = []
    for (const sy of [-1, 1]) for (const sz of [-1, 1]) spec.push([w, t, t, 0, sy * h / 2, sz * d / 2])
    for (const sy of [-1, 1]) for (const sx of [-1, 1]) spec.push([t, t, d, sx * w / 2, sy * h / 2, 0])
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) spec.push([t, h, t, sx * w / 2, 0, sz * d / 2])
    spec.forEach(([a, b, c2, x, yy, z], k) => { bars[k].scale.set(a, b, c2); bars[k].position.set(x, yy, z) })
    frame.position.set(0, y, 0)
    frameFill.scale.set(w, h, d); frameFill.position.set(0, y, 0)
  }

  // ---------- Bloom ----------
  const composer = new EffectComposer(renderer)
  composer.addPass(new RenderPass(scene, camera))
  const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.55, 0.5, 0.82)
  composer.addPass(bloom)
  composer.addPass(new OutputPass())

  // ---------- Camera ----------
  let focus = 0, inside = null
  const cam = { pos: new THREE.Vector3(48, 14, 70), look: new THREE.Vector3(0, 8, 0) }
  const goal = { pos: cam.pos.clone(), look: cam.look.clone() }
  let drift = 0

  function overviewShot(i) {
    const y = levelMid(i)
    if (i === 10) return { pos: new THREE.Vector3(30, towerTop + 18, 52), look: new THREE.Vector3(0, towerTop + 2, 0) }
    const lift = i === 0 ? 7 : 5
    return { pos: new THREE.Vector3(27, Math.max(7, y + lift), 47), look: new THREE.Vector3(-2, y + (i === 0 ? 3 : 0), 0) }
  }
  function insideShot(i) {
    if (i === 0) return { pos: new THREE.Vector3(-3, 3.2, PD / 2 + 9), look: new THREE.Vector3(-3, 3.6, PD / 2 - 11) }
    if (i === 10) return { pos: new THREE.Vector3(10, towerTop + 4, 20), look: new THREE.Vector3(0, towerTop + 7.5, 0) }
    const y = levelBase(i) + 0.5
    return { pos: new THREE.Vector3(-TW / 2 + 0.9, y + 2.2, TD / 2 - 0.8), look: new THREE.Vector3(TW / 2 - 2, y + 1.3, -TD / 2 + 1.5) }
  }
  function apply(shot) { goal.pos.copy(shot.pos); goal.look.copy(shot.look) }

  function setFocus(i, { silent = false } = {}) {
    focus = Math.max(0, Math.min(LEVELS.length - 1, i))
    placeFrame(focus)
    if (!inside) apply(overviewShot(focus))
    if (!silent) onFocus(LEVELS[focus])
  }
  function enter(id) {
    const i = LEVELS.indexOf(id); if (i < 0) return
    focus = i; inside = id; placeFrame(i)
    frame.visible = frameFill.visible = false
    apply(insideShot(i))
    onEnter(id)
  }
  function exit() {
    inside = null; frame.visible = frameFill.visible = true
    apply(overviewShot(focus))
    onEnter(null)
  }

  // Scroll steps one floor at a time (with a short cooldown so a flick doesn't skip the building).
  let wheelLock = 0
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault()
    if (inside || performance.now() < wheelLock || Math.abs(e.deltaY) < 4) return
    wheelLock = performance.now() + 260
    setFocus(focus + (e.deltaY < 0 ? 1 : -1))
  }, { passive: false })

  // Click a floor to go in; drag to look around a little.
  const ray = new THREE.Raycaster(), ptr = new THREE.Vector2()
  const picks = [...floors.map(f => f.pick), terracePick, lobbyPick]
  let down = null
  canvas.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY, d: drift } })
  addEventListener('pointermove', (e) => { if (down && !inside) drift = Math.max(-0.6, Math.min(0.6, down.d - (e.clientX - down.x) * 0.003)) })
  addEventListener('pointerup', (e) => {
    if (!down) return
    const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y) > 6
    down = null
    if (moved || e.target !== canvas) return
    const r = canvas.getBoundingClientRect()
    ptr.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1)
    ray.setFromCamera(ptr, camera)
    const hit = ray.intersectObjects(picks, false)[0]
    if (hit) { setFocus(LEVELS.indexOf(hit.object.userData.id)); if (!inside) enter(hit.object.userData.id) }
  })

  function setBusy(map) {
    floors.forEach((f, k) => { const b = !!map[f.id]; f.heads.forEach(h => { h.material = b ? M.headBusy : M.head }) })
  }

  function resize() {
    const w = canvas.clientWidth, h = canvas.clientHeight
    renderer.setSize(w, h, false); composer.setSize(w, h)
    camera.aspect = w / h; camera.fov = w < 700 ? 58 : 38; camera.updateProjectionMatrix()
  }
  addEventListener('resize', resize); resize()

  const still = matchMedia('(prefers-reduced-motion: reduce)').matches
  const clock = new THREE.Clock()
  const tmp = new THREE.Vector3()
  renderer.setAnimationLoop(() => {
    const dt = Math.min(clock.getDelta(), 0.05), t = clock.elapsedTime
    const k = 1 - Math.pow(0.015, dt)
    // drift turns the overview a little around the tower
    tmp.copy(goal.pos)
    if (!inside && drift) { const a = drift, x = tmp.x, z = tmp.z; tmp.x = x * Math.cos(a) - z * Math.sin(a); tmp.z = x * Math.sin(a) + z * Math.cos(a) }
    cam.pos.lerp(tmp, k); cam.look.lerp(goal.look, k)
    if (!still && !inside) cam.pos.x += Math.sin(t * 0.15) * 0.01
    camera.position.copy(cam.pos); camera.lookAt(cam.look)
    if (!still) {
      holo.rotation.y = t * 0.25; ring1.rotation.z = t * 0.4; ring2.rotation.z = -t * 0.3; ring3.rotation.y = t * 0.2
      core.scale.setScalar(1.5 + Math.sin(t * 2) * 0.12)
      for (const car of cars) {
        const u = car.userData, p = ((t * u.speed + u.off) % 300) - 150
        if (u.alongX) car.position.set(u.lane ? -p : p, 0, u.lane ? 29 : 35)
        else car.position.set(u.lane === 2 ? 37 : 43, 0, u.lane === 2 ? p : -p)
        car.rotation.y = u.alongX ? (u.lane ? Math.PI : 0) : (u.lane === 2 ? -Math.PI / 2 : Math.PI / 2)
      }
      frameMat.opacity = 0.7 + Math.sin(t * 3) * 0.25
    }
    composer.render()
  })

  setFocus(0, { silent: true })
  return { focus: (id) => setFocus(LEVELS.indexOf(id)), focusIndex: () => focus, step: (d) => setFocus(focus + d), enter, exit, setBusy, levels: LEVELS, isInside: () => inside }
}
