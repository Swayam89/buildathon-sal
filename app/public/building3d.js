// The Corporate AI tower at night, in Three.js.
// Levels: G lobby (the podium), 1 to 8 departments, 9 chief of staff, R terrace (JARVIS).
// Overview: scroll moves the focus floor by floor, the camera follows and the floor gets an amber frame.
// enter(id) flies the camera inside that floor; exit() comes back out.
import * as THREE from 'three'
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js'
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'

// Staff model: "RobotExpressive" by Tomás Laulhé (Quaternius), CC0 1.0, from the three.js examples.
const ROBOT_URL = 'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r170/examples/models/gltf/RobotExpressive/RobotExpressive.glb'

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

// Soft round glow for lamps and light pools.
let GLOW = null
function glowTex() {
  return GLOW || (GLOW = canvasTex(128, 128, (g, w, h) => {
    const gr = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2)
    gr.addColorStop(0, 'rgba(255,240,215,1)'); gr.addColorStop(0.25, 'rgba(255,225,180,.55)'); gr.addColorStop(1, 'rgba(255,210,160,0)')
    g.fillStyle = gr; g.fillRect(0, 0, w, h)
  }))
}

// What's on the monitors: code, a chart, a dashboard, a document.
function screenTex(kind, seed) {
  const r = rng(seed)
  return canvasTex(128, 80, (g, w, h) => {
    g.fillStyle = kind === 'doc' ? '#f3f5f8' : '#0e1622'; g.fillRect(0, 0, w, h)
    if (kind === 'code') for (let y = 6; y < h - 4; y += 6) { let x = 6 + (r() * 3 | 0) * 6; while (x < w - 10 && r() > 0.15) { const l = 6 + r() * 22; g.fillStyle = ['#7fd4ff', '#ffcf6b', '#9ff3b0', '#c9d1e0', '#ff9a8a'][r() * 5 | 0]; g.fillRect(x, y, l, 3); x += l + 4 } }
    if (kind === 'chart') { g.strokeStyle = '#2b3a50'; for (let y = 10; y < h; y += 14) { g.beginPath(); g.moveTo(6, y); g.lineTo(w - 6, y); g.stroke() } g.strokeStyle = '#5ee09a'; g.lineWidth = 2.5; g.beginPath(); let y = h - 18; g.moveTo(6, y); for (let x = 6; x < w - 6; x += 10) { y = Math.max(10, Math.min(h - 8, y - 6 + r() * 9)); g.lineTo(x, y) } g.stroke() }
    if (kind === 'dash') { for (let k = 0; k < 6; k++) { const bh = 10 + r() * 50; g.fillStyle = k % 2 ? '#ffb52e' : '#6fd6ff'; g.fillRect(10 + k * 18, h - 8 - bh, 12, bh) } g.fillStyle = '#c9d1e0'; g.fillRect(8, 6, 60, 5) }
    if (kind === 'doc') { g.fillStyle = '#1d2533'; g.fillRect(10, 8, 70, 6); g.fillStyle = '#8b94a3'; for (let y = 22; y < h - 6; y += 7) g.fillRect(10, y, 30 + r() * 80, 3) }
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
  let pixelRatio = Math.min(devicePixelRatio, 1.75)
  renderer.setPixelRatio(pixelRatio)
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.3
  renderer.shadowMap.enabled = false

  const scene = new THREE.Scene()
  // Night sky: deep blue overhead, a warm city haze at the horizon, a few stars.
  scene.background = canvasTex(16, 512, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h)
    gr.addColorStop(0, '#05070d'); gr.addColorStop(0.55, '#0e1320'); gr.addColorStop(0.82, '#2a2a33'); gr.addColorStop(1, '#3b3530')
    g.fillStyle = gr; g.fillRect(0, 0, w, h)
  })
  scene.fog = new THREE.Fog('#24252c', 70, 260)
  {
    const r = rng(77), pos = []
    for (let k = 0; k < 900; k++) { const a = r() * Math.PI * 2, e = 0.18 + r() * 1.3, d = 420; pos.push(Math.cos(a) * Math.cos(e) * d, Math.sin(e) * d, Math.sin(a) * Math.cos(e) * d) }
    const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
    scene.add(new THREE.Points(sg, new THREE.PointsMaterial({ color: '#dfe8ff', size: 1.1, sizeAttenuation: false, fog: false, transparent: true, opacity: 0.8, depthWrite: false })))
  }
  // Image-based lighting so glass, metal, marble and water reflect something.
  const pmrem = new THREE.PMREMGenerator(renderer)
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
  scene.environmentIntensity = 0.32
  const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 700)

  scene.add(new THREE.HemisphereLight('#a9bad6', '#2a2520', 1.35))
  const moon = new THREE.DirectionalLight('#c8d6ff', 1.1); moon.position.set(-60, 120, 80); scene.add(moon)
  const fill = new THREE.DirectionalLight('#ffd8a8', 0.5); fill.position.set(80, 40, -40); scene.add(fill)

  const M = {
    stone: new THREE.MeshStandardMaterial({ color: C.stone, roughness: 0.62, metalness: 0.02 }),
    stoneDark: new THREE.MeshStandardMaterial({ color: C.stoneDark, roughness: 0.9 }),
    slab: new THREE.MeshStandardMaterial({ color: C.slab, roughness: 0.7 }),
    glass: new THREE.MeshStandardMaterial({ color: '#9ec3da', metalness: 0.3, roughness: 0.03, transparent: true, opacity: 0.16, envMapIntensity: 2.6, depthWrite: false }),
    mullion: new THREE.MeshStandardMaterial({ color: '#2a2f36', roughness: 0.32, metalness: 0.75 }),
    cyan: new THREE.MeshBasicMaterial({ color: C.cyan }),
    warm: new THREE.MeshBasicMaterial({ color: C.warm }),
    amber: new THREE.MeshBasicMaterial({ color: C.amber }),
    floorIn: new THREE.MeshStandardMaterial({ roughness: 0.95, map: (() => { const t = canvasTex(256, 256, (g, w, h) => { g.fillStyle = '#5b636e'; g.fillRect(0, 0, w, h); const r = rng(4); for (let k = 0; k < 2500; k++) { g.fillStyle = `rgba(${r() < 0.5 ? '255,255,255' : '0,0,0'},${r() * 0.06})`; g.fillRect(r() * w, r() * h, 2, 2) } g.strokeStyle = 'rgba(0,0,0,.25)'; g.lineWidth = 2; for (let k = 0; k <= 4; k++) { g.beginPath(); g.moveTo(k * 64, 0); g.lineTo(k * 64, h); g.moveTo(0, k * 64); g.lineTo(w, k * 64); g.stroke() } }); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(4, 3); return t })() }),
    ceiling: new THREE.MeshStandardMaterial({ roughness: 0.9, emissive: '#8a9aa8', emissiveIntensity: 0.1, map: (() => { const t = canvasTex(256, 256, (g, w, h) => { g.fillStyle = '#c4c8ce'; g.fillRect(0, 0, w, h); g.strokeStyle = '#9aa0a8'; g.lineWidth = 3; for (let k = 0; k <= 4; k++) { g.beginPath(); g.moveTo(k * 64, 0); g.lineTo(k * 64, h); g.moveTo(0, k * 64); g.lineTo(w, k * 64); g.stroke() } }); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(5, 4); return t })() }),
    light: new THREE.MeshBasicMaterial({ color: '#ffffff' }),
    desk: new THREE.MeshStandardMaterial({ color: '#d9dde2', roughness: 0.45 }),
    deskDark: new THREE.MeshStandardMaterial({ color: '#3a3f46', roughness: 0.7 }),
    chair: new THREE.MeshStandardMaterial({ color: '#2b2f35', roughness: 0.8 }),
    screen: new THREE.MeshBasicMaterial({ map: screenTex('code', 3) }),
    screenWarm: new THREE.MeshBasicMaterial({ map: screenTex('chart', 5) }),
    screenDash: new THREE.MeshBasicMaterial({ map: screenTex('dash', 7) }),
    screenDoc: new THREE.MeshBasicMaterial({ map: screenTex('doc', 9) }),
    body: new THREE.MeshStandardMaterial({ color: '#3f8aa0', roughness: 0.7 }),
    head: new THREE.MeshBasicMaterial({ color: '#e6f7ff' }),
    headBusy: new THREE.MeshBasicMaterial({ color: '#ffd28a' }),
    table: new THREE.MeshStandardMaterial({ color: '#8a6d55', roughness: 0.7 }),
    partition: new THREE.MeshStandardMaterial({ color: '#5a626c', emissive: '#22303c', emissiveIntensity: 0.5, roughness: 0.8 }),
    wood: new THREE.MeshStandardMaterial({ color: C.wood, roughness: 0.8 }),
    grass: new THREE.MeshStandardMaterial({ color: C.grass, roughness: 1 }),
    leaf: new THREE.MeshStandardMaterial({ color: C.leaf, roughness: 0.9, flatShading: true }),
    trunk: new THREE.MeshStandardMaterial({ color: '#5a4636', roughness: 1 }),
    water: new THREE.MeshStandardMaterial({ color: '#4fb3dc', emissive: '#14627f', emissiveIntensity: 0.7, roughness: 0.04, metalness: 0.1, envMapIntensity: 2 }),
    road: new THREE.MeshStandardMaterial({ color: C.road, roughness: 0.55, metalness: 0.05 }),
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
  const kerb = new THREE.MeshStandardMaterial({ color: '#4a4d54', roughness: 0.8 })
  for (const [x, z, w, d] of [[0, 24.5, 900, 1.2], [0, 39.5, 900, 1.2], [0, -26.5, 900, 1.2], [0, -41.5, 900, 1.2], [32.5, 0, 1.2, 900], [47.5, 0, 1.2, 900], [-34.5, 0, 1.2, 900], [-49.5, 0, 1.2, 900]]) box(kerb, w, 0.25, d, x, 0.12, z)
  for (let k = 0; k < 7; k++) box(dash, 0.7, 0.03, 4.5, -10 + k * 1.3, 0.08, 32)     // zebra crossing in front of the entrance
  // Stairs up to the entrance
  for (let s = 0; s < 3; s++) box(M.slab, 14, 0.25, 1.2, -3, 0.62 + s * 0.25, PD / 2 + 3.4 - s * 1.0)

  // ---------- Podium (lobby) ----------
  const podium = new THREE.Group(); scene.add(podium)
  // Hollow podium: back and side walls, and a front with a tall glass opening into the lobby
  const wy = 0.5 + PH / 2, wt = 0.6
  box(M.stone, PW, PH, wt, 0, wy, -PD / 2 + wt / 2, podium)
  box(M.stone, wt, PH, PD, -PW / 2 + wt / 2, wy, 0, podium)
  box(M.stone, wt, PH, PD, PW / 2 - wt / 2, wy, 0, podium)
  box(M.stone, PW / 2 - 12, PH, wt, (-PW / 2 - 12) / 2, wy, PD / 2 - wt / 2, podium)
  box(M.stone, PW / 2 - 6, PH, wt, (PW / 2 + 6) / 2, wy, PD / 2 - wt / 2, podium)
  box(M.stone, 18, 1.2, wt, -3, 0.5 + PH - 0.6, PD / 2 - wt / 2, podium)
  box(new THREE.MeshStandardMaterial({ color: '#c8cbd0', roughness: 0.4, emissive: '#3a4652', emissiveIntensity: 0.5 }), PW - 1.2, 0.1, PD - 1.2, 0, 0.56, 0, podium)
  box(M.ceiling, PW - 1.2, 0.1, PD - 1.2, 0, 0.5 + PH - 0.15, 0, podium)
  for (let x = -12; x <= 12; x += 4) for (const z of [-4, 2, 7]) box(M.light, 2.6, 0.06, 0.4, x, 0.5 + PH - 0.22, z, podium)
  // Lobby glass front and interior
  const lobbyGlass = box(M.glass, 18, PH - 1.2, 0.2, -3, 0.5 + (PH - 1.2) / 2 + 0.2, PD / 2 + 0.11, podium)
  lobbyGlass.renderOrder = 2
  // Cut-out look: a dark recess behind the glass
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
  // Fountain jets: a few hundred drops rising and falling, reset each loop
  const jets = []
  for (const fx of [-14, 8]) for (let j = 0; j < 4; j++) {
    const n = 60, pos = new Float32Array(n * 3), seeds = new Float32Array(n)
    for (let q = 0; q < n; q++) seeds[q] = Math.random()
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    const pts = new THREE.Points(geo, new THREE.PointsMaterial({ color: '#d8f4ff', size: 0.09, transparent: true, opacity: 0.85, depthWrite: false }))
    scene.add(pts); jets.push({ geo, seeds, x: fx - 2.6 + j * 1.75, z: PD / 2 + 5.5 })
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
    cyl(M.stone, 0.32, FH, -1.6, FH / 2, 1.6, g)
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
      box([M.screen, M.screenWarm, M.screenDash, M.screenDoc][(k + row + i) % 4], 0.7, 0.45, 0.04, x - 0.4, 1.35, z - 0.3, g); box([M.screenDash, M.screen, M.screenDoc, M.screenWarm][(k + i) % 4], 0.7, 0.45, 0.04, x + 0.4, 1.35, z - 0.3, g)
      if (!(row === 0 && k < 3)) { box(M.chair, 0.6, 0.1, 0.6, x, 0.6, z + 0.9, g); box(M.chair, 0.6, 0.8, 0.08, x, 1.0, z + 1.2, g) }
    }
    // glass meeting room around the table, and plants by the windows
    const mr = new THREE.Group(); mr.position.set(3.5, 0, 4.2); g.add(mr)
    for (const [w, d, x, z] of [[6.4, 0.06, 0, -1.9], [0.06, 3.8, -3.2, 0], [0.06, 3.8, 3.2, 0]]) { const pane = box(M.glass, w, FH - 0.4, d, x, FH / 2, z, mr); pane.renderOrder = 2 }
    for (const [x, z] of [[-3.2, -1.9], [3.2, -1.9], [0, -1.9]]) box(M.mullion, 0.08, FH - 0.4, 0.08, x, FH / 2, z, mr)
    box(M.cyan, 6.4, 0.04, 0.04, 0, FH - 0.5, -1.9, mr)
    for (const [x, z] of [[-7.6, 5.2], [7.6, -5], [-7.6, -5]]) {
      cyl(M.desk, 0.3, 0.6, x, 0.5, z, g)
      for (let k2 = 0; k2 < 5; k2++) { const l = new THREE.Mesh(G.tree, M.leaf); const a = k2 * 1.3; l.scale.set(0.25, 0.6, 0.25); l.position.set(x + Math.cos(a) * 0.22, 1.1 + (k2 % 3) * 0.3, z + Math.sin(a) * 0.22); l.rotation.set(Math.sin(a) * 0.5, a, Math.cos(a) * 0.5); g.add(l) }
    }
    // meeting table at the front
    box(M.table, 5, 0.12, 1.8, 3.5, 1.0, 4.2, g)
    for (const dx of [-1.8, 0, 1.8]) for (const dz of [-1.3, 1.3]) { box(M.chair, 0.6, 0.1, 0.6, 3.5 + dx, 0.6, 4.2 + dz, g); box(M.chair, 0.6, 0.9, 0.08, 3.5 + dx, 1.05, 4.2 + dz * 1.25, g) }
    // three people at desks (the department's staff)
    const heads = []
    for (let p = 0; p < 3; p++) {
      const x = -6.5 + p * 3, z = -2 + 0.85
      const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.28, 0.55, 4, 8), M.body); body.position.set(x, 1.05, z); g.add(body); body.userData.keep = true
      const head = new THREE.Mesh(G.sphere, M.head); head.scale.setScalar(0.42); head.position.set(x, 1.65, z); g.add(head); head.userData.body = body; head.userData.keep = true
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

  // Robot staff: three at their desks on every floor, and a receptionist in the lobby.
  const mixers = []
  const walkers = []
  const robots = []      // { floor, mixer, actions }
  const loader = new GLTFLoader()
  loader.load(ROBOT_URL, (gltf) => {
    const proto = gltf.scene
    const bb = new THREE.Box3().setFromObject(proto), scale = 1.55 / (bb.max.y - bb.min.y)
    const clip = (name) => gltf.animations.find(a => a.name === name)
    function place(parent, x, y, z, rot, anim, floor = null) {
      const r = SkeletonUtils.clone(proto); r.scale.setScalar(scale); r.position.set(x, y, z); r.rotation.y = rot
      r.traverse(o => { if (o.isMesh) { o.material = o.material.clone(); o.material.envMapIntensity = 1.2 } })
      parent.add(r)
      const mixer = new THREE.AnimationMixer(r)
      const actions = { Idle: mixer.clipAction(clip('Idle')), Yes: mixer.clipAction(clip('Yes')), Wave: mixer.clipAction(clip('Wave')), Walking: mixer.clipAction(clip('Walking')) }
      actions[anim].play(); mixer.setTime(Math.random() * 3)
      mixers.push(mixer); robots.push({ floor, mixer, actions, current: anim })
      return r
    }
    floors.forEach((f) => {
      f.heads.forEach(h => { h.visible = false; h.userData.body.visible = false })
      for (let p = 0; p < 3; p++) place(f.group, -6.5 + p * 3, 0.22, -2 + 0.95, Math.PI, 'Idle', f.id)
    })
    for (const [cx, cz, rx, rz, speed, off] of [[-3, PD / 2 + 7.5, 11, 1.6, 0.16, 0], [-3, PD / 2 + 7.5, 11, 1.6, 0.16, 3.1], [PW / 2 + 5.5, 0, 1.8, 10, -0.14, 1.2], [-PW / 2 - 4.5, 0, 1.5, 9, 0.12, 2]]) {
      const w = place(scene, cx, 0.52, cz, 0, 'Walking')
      walkers.push({ obj: w, cx, cz, rx, rz, speed, off })
    }
    const rec = place(lobby, -2, 0.18, -3.1, 0, 'Wave')
    rec.userData.receptionist = true
    applyBusy()
  }, undefined, (e) => console.warn('robot model not loaded, keeping simple figures', e?.message || e))

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

  // Warm uplights washing the stone corners of the tower
  for (const [x, z] of [[TW / 2 + 0.9, TD / 2 + 3], [-TW / 2 - 0.9, TD / 2 + 3]]) {
    const up = new THREE.SpotLight('#ffcf91', 420, 60, 0.3, 0.7, 1.4); up.position.set(x, roofY + 0.6, z)
    up.target.position.set(x, roofY + 30, z - 2.2); scene.add(up); scene.add(up.target)
  }
  // Spandrel bands between floors and a lit crown at the top
  const band = new THREE.MeshStandardMaterial({ color: '#30353d', roughness: 0.3, metalness: 0.8 })
  for (let i = 1; i <= 9; i++) box(band, TW + 0.5, 0.45, TD + 0.5, 0, levelBase(i) + 0.5 + FH - 0.05, 0)
  box(M.warm, TW + 4.6, 0.12, 0.12, 0, towerTop - 0.25, TD / 2 + 2.2); box(M.warm, TW + 4.6, 0.12, 0.12, 0, towerTop - 0.25, -TD / 2 - 2.2)
  const blink = []
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) { const b3 = new THREE.Mesh(G.sphere, new THREE.MeshBasicMaterial({ color: '#ff2a1a' })); b3.scale.setScalar(0.35); b3.position.set(sx * (TW / 2 + 1.6), towerTop + 5.1, sz * (TD / 2 + 1.6)); b3.userData.keep = true; scene.add(b3); blink.push(b3) }

  // ---------- Terrace with the JARVIS hologram ----------
  const terrace = new THREE.Group(); terrace.position.y = towerTop; scene.add(terrace)
  box(M.slab, TW + 4, 0.4, TD + 4, 0, 0, 0, terrace)
  for (const [w, d, x, z] of [[TW + 4.1, 0.12, 0, TD / 2 + 2], [0.12, TD + 4.1, TW / 2 + 2, 0], [0.12, TD + 4.1, -TW / 2 - 2, 0], [TW + 4.1, 0.12, 0, -TD / 2 - 2]]) box(M.cyan, w, 0.12, d, x, 0.2, z, terrace)
  for (let x = -TW / 2 - 1.5; x <= TW / 2 + 1.5; x += 0.9) { box(M.stone, 0.35, 2.4, 0.35, x, 1.4, TD / 2 + 1.8, terrace); box(M.stone, 0.35, 2.4, 0.35, x, 1.4, -TD / 2 - 1.8, terrace) }
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) { const p = new THREE.Mesh(new THREE.ConeGeometry(0.8, 2.2, 4), M.stone); p.position.set(sx * (TW / 2 + 1.6), 3.4, sz * (TD / 2 + 1.6)); terrace.add(p); const l = new THREE.Mesh(G.sphere, M.lamp); l.scale.setScalar(0.35); l.position.set(sx * (TW / 2 + 1.6), 4.6, sz * (TD / 2 + 1.6)); terrace.add(l) }
  // Planters, benches and a lit pad ring around the hologram
  for (const [x, z] of [[-TW / 2 + 0.5, TD / 2 - 0.5], [TW / 2 - 0.5, TD / 2 - 0.5], [-TW / 2 + 0.5, -TD / 2 + 0.5], [TW / 2 - 0.5, -TD / 2 + 0.5]]) {
    box(M.stone, 2.4, 0.9, 1.2, x, 0.65, z, terrace); box(M.grass, 2.2, 0.1, 1, x, 1.15, z, terrace)
    for (let k = 0; k < 4; k++) { const t2 = new THREE.Mesh(G.tree, M.leaf); t2.scale.setScalar(0.45); t2.position.set(x - 0.8 + k * 0.55, 1.5, z); terrace.add(t2) }
  }
  for (const z of [-3.2, 3.2]) { box(M.wood, 3.4, 0.12, 0.7, -5.5, 0.62, z, terrace); box(M.dark, 0.12, 0.45, 0.6, -6.9, 0.4, z, terrace); box(M.dark, 0.12, 0.45, 0.6, -4.1, 0.4, z, terrace) }
  const pad = new THREE.Mesh(new THREE.RingGeometry(3.6, 3.8, 64), new THREE.MeshBasicMaterial({ color: C.cyan, side: THREE.DoubleSide })); pad.rotation.x = -Math.PI / 2; pad.position.y = 0.22; terrace.add(pad)
  const pad2 = new THREE.Mesh(new THREE.RingGeometry(2.2, 2.3, 64), new THREE.MeshBasicMaterial({ color: C.amber, side: THREE.DoubleSide })); pad2.rotation.x = -Math.PI / 2; pad2.position.y = 0.22; terrace.add(pad2)
  // Hologram: a head made of points, a bright core and two orbit rings
  const holo = new THREE.Group(); holo.position.set(0, 7.5, 0); terrace.add(holo); holo.userData.keep = true
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

  // Lobby interior: polished marble, a reception desk, a wall of wooden slats with the neon sign,
  // screens, sofas, plants and pendant lights. Sits inside the hollow podium.
  const lobby = new THREE.Group(); lobby.position.set(0, 0.5, 0); scene.add(lobby)
  const marble = new THREE.MeshStandardMaterial({ roughness: 0.12, metalness: 0.05, envMapIntensity: 1.2, map: canvasTex(1024, 1024, (g, w, h) => {
    g.fillStyle = '#e9e6e1'; g.fillRect(0, 0, w, h)
    const r = rng(9)
    for (let k = 0; k < 70; k++) { g.strokeStyle = `rgba(120,118,125,${0.08 + r() * 0.18})`; g.lineWidth = 0.6 + r() * 2.2; g.beginPath(); let x = r() * w, y = r() * h; g.moveTo(x, y); for (let j = 0; j < 8; j++) { x += (r() - 0.3) * 120; y += (r() - 0.5) * 90; g.lineTo(x, y) } g.stroke() }
    g.strokeStyle = 'rgba(180,176,170,.55)'; g.lineWidth = 2; for (let k = 0; k <= 4; k++) { g.beginPath(); g.moveTo(k * w / 4, 0); g.lineTo(k * w / 4, h); g.moveTo(0, k * h / 4); g.lineTo(w, k * h / 4); g.stroke() }
  }) })
  marble.map.wrapS = marble.map.wrapT = THREE.RepeatWrapping; marble.map.repeat.set(4, 3)
  box(marble, PW - 1.3, 0.12, PD - 1.3, 0, 0.12, 0, lobby)
  // Slat wall behind reception
  const walnut = new THREE.MeshStandardMaterial({ color: '#7a5233', roughness: 0.5 })
  box(new THREE.MeshStandardMaterial({ color: '#1b1612', roughness: 0.8 }), 22, PH - 0.4, 0.3, -2, PH / 2 - 0.1, -6.2, lobby)
  for (let x = -12.6; x <= 8.6; x += 0.42) box(walnut, 0.2, PH - 0.6, 0.18, x, PH / 2 - 0.1, -5.95, lobby)
  box(M.warm, 21.6, 0.06, 0.1, -2, 0.35, -5.8, lobby); box(M.warm, 21.6, 0.06, 0.1, -2, PH - 0.55, -5.8, lobby)
  const ls = new THREE.Mesh(new THREE.PlaneGeometry(12, 2.2), new THREE.MeshBasicMaterial({ map: neonText('CORPORATE AI', { size: 140 }), transparent: true, depthWrite: false }))
  ls.position.set(-2, PH - 2.0, -5.75); lobby.add(ls)
  const tag = new THREE.Mesh(new THREE.PlaneGeometry(6, 0.5), new THREE.MeshBasicMaterial({ map: neonText('LED BY JARVIS   25 AI STAFF', { size: 70, color: '#e8f6ff' }), transparent: true }))
  tag.position.set(-2, PH - 3.05, -5.74); lobby.add(tag)
  // Reception desk: a long walnut counter with a white top and a glowing base line
  box(walnut, 9, 1.1, 1.3, -2, 0.67, -2, lobby)
  box(new THREE.MeshStandardMaterial({ color: '#f4f2ee', roughness: 0.2 }), 9.4, 0.1, 1.6, -2, 1.27, -2, lobby)
  box(M.cyan, 9, 0.05, 0.05, -2, 0.18, -1.33, lobby)
  for (const dx of [-3, 0, 3]) box(dx ? M.screenDash : M.screenDoc, 0.6, 0.38, 0.03, -2 + dx, 1.55, -2.4, lobby)
  // Screens on the side walls
  box(M.dark, 4.2, 2.6, 0.12, 10.5, 3, -5.9, lobby)
  for (let b = 0; b < 9; b++) { const h = 0.4 + ((b * 37) % 11) / 6; box(new THREE.MeshBasicMaterial({ color: b % 3 ? '#9ff3d6' : '#ffd28a' }), 0.26, h, 0.05, 9.0 + b * 0.38, 1.9 + h / 2, -5.82, lobby) }
  box(M.dark, 3.4, 2.3, 0.12, -14.2, 3, -5.9, lobby)
  for (let q = 0; q < 4; q++) box(new THREE.MeshBasicMaterial({ color: ['#ffd8a8', '#c7f0ff', '#ffe9c9', '#ffffff'][q] }), 1.45, 0.95, 0.05, -14.95 + (q % 2) * 1.55, 3.55 - Math.floor(q / 2) * 1.08, -5.82, lobby)
  // Lounge: two sofas around low tables on rugs
  const fabric = new THREE.MeshStandardMaterial({ color: '#3a3f47', roughness: 0.9 })
  function sofa(x, z, rot) {
    const s2 = new THREE.Group(); s2.position.set(x, 0, z); s2.rotation.y = rot; lobby.add(s2)
    box(fabric, 3.2, 0.45, 1.1, 0, 0.45, 0, s2); box(fabric, 3.2, 0.8, 0.3, 0, 0.85, -0.45, s2)
    box(fabric, 0.3, 0.65, 1.1, -1.6, 0.6, 0, s2); box(fabric, 0.3, 0.65, 1.1, 1.6, 0.6, 0, s2)
  }
  for (const [x, z] of [[-10, 4.5], [7, 4.5]]) {
    box(new THREE.MeshStandardMaterial({ color: '#5b4a3e', roughness: 1 }), 5, 0.02, 4, x, 0.2, z + 1, lobby)
    sofa(x, z, 0); sofa(x, z + 2.6, Math.PI)
    cyl(new THREE.MeshStandardMaterial({ color: '#1d1f24', roughness: 0.3, metalness: 0.6 }), 0.7, 0.4, x, 0.4, z + 1.3, lobby)
  }
  // Plants in white pots
  const pot = new THREE.MeshStandardMaterial({ color: '#eeeeea', roughness: 0.4 })
  const leafDark = new THREE.MeshStandardMaterial({ color: '#2f6e43', roughness: 0.8, flatShading: true })
  for (const [x, z, s3] of [[-15, -4.5, 1.2], [9.5, -4.5, 1.2], [-15, 9, 1], [14.5, 9, 1], [-7.5, -3.5, 0.8], [3.5, -3.5, 0.8], [14.5, -4.5, 1.1]]) {
    cyl(pot, 0.45 * s3, 0.9 * s3, x, 0.6 * s3, z, lobby)
    for (let k = 0; k < 6; k++) { const l = new THREE.Mesh(G.tree, leafDark); const a = k * 1.1; l.scale.set(0.35 * s3, 0.9 * s3, 0.35 * s3); l.position.set(x + Math.cos(a) * 0.35 * s3, (1.6 + (k % 3) * 0.45) * s3, z + Math.sin(a) * 0.35 * s3); l.rotation.set(Math.sin(a) * 0.5, a, Math.cos(a) * 0.5); lobby.add(l) }
  }
  // Pendant lights over the desk, round columns, and glass mullions across the entrance
  for (let k = 0; k < 5; k++) { const x = -5.2 + k * 1.6; cyl(M.dark, 0.01, 1.6, x, PH - 1.1, -2, lobby); const b2 = new THREE.Mesh(G.sphere, M.lamp); b2.scale.setScalar(0.32); b2.position.set(x, PH - 1.95, -2); lobby.add(b2) }
  for (const x of [-9, 5]) cyl(new THREE.MeshStandardMaterial({ color: '#f0eee9', roughness: 0.3 }), 0.45, PH - 0.4, x, PH / 2 - 0.1, 2.5, lobby)
  for (let x = -12; x <= 6.01; x += 2.25) box(M.mullion, 0.08, PH - 1.3, 0.12, x, (PH - 1.3) / 2 + 0.1, PD / 2 - 0.05, lobby)
  const lobbyLight = new THREE.PointLight('#ffd9a8', 22, 26, 1.6); lobbyLight.position.set(-2, PH - 1.2, 1); lobby.add(lobbyLight)
  const lobbyLight2 = new THREE.PointLight('#cfe6ff', 8, 22, 1.6); lobbyLight2.position.set(-2, 2.5, -4); lobby.add(lobbyLight2)
  const lobbyPick = new THREE.Mesh(G.box, new THREE.MeshBasicMaterial({ visible: false })); lobbyPick.scale.set(PW, PH, PD); lobbyPick.position.set(0, 0.5 + PH / 2, 0); lobbyPick.userData.id = 'lobby'; scene.add(lobbyPick)

  // ---------- Trees, lamps, cars ----------
  function roundTree(x, z, s = 1) {
    cyl(M.trunk, 0.15 * s, 1.8 * s, x, 0.9 * s + 0.5, z)
    for (const [dx, dy, dz, r] of [[0, 2.6, 0, 1.2], [0.6, 2.2, 0.3, 0.9], [-0.5, 2.3, -0.3, 0.9], [0, 3.3, 0, 0.8]]) { const t = new THREE.Mesh(G.tree, M.leaf); t.scale.setScalar(r * s); t.position.set(x + dx * s, dy * s + 0.5, z + dz * s); scene.add(t) }
  }
  const frondMat = new THREE.MeshStandardMaterial({ color: '#2f8a4f', roughness: 0.75, side: THREE.DoubleSide, flatShading: true })
  const ringMat = new THREE.MeshStandardMaterial({ color: '#6b5440', roughness: 1 })
  function palm(x, z, h = 6, lean = 0.12) {
    const segs = 7, top = new THREE.Vector3()
    for (let k = 0; k < segs; k++) {
      const t = k / segs, y = 0.5 + t * h, bend = lean * t * t * h
      const seg = new THREE.Mesh(G.cyl, k % 2 ? ringMat : M.trunk); seg.scale.set(0.34 - t * 0.12, h / segs + 0.02, 0.34 - t * 0.12)
      seg.position.set(x + bend, y + h / segs / 2, z); seg.rotation.z = -lean * t * 2; scene.add(seg)
      top.set(x + bend, y + h / segs, z)
    }
    // fronds: each a chain of flat leaves arching out and down
    for (let k = 0; k < 9; k++) {
      const a = (k / 9) * Math.PI * 2 + x
      for (let j = 0; j < 5; j++) {
        const len = 0.8, out = 0.3 + j * 0.6, drop = j * j * 0.11
        const leaf = new THREE.Mesh(G.box, frondMat); leaf.scale.set(len, 0.03, 0.62 - j * 0.09)
        leaf.position.set(top.x + Math.cos(a) * out, top.y + 0.25 - drop, top.z + Math.sin(a) * out)
        leaf.rotation.set(0, -a, -0.15 - j * 0.32); scene.add(leaf)
      }
    }
    const crown = new THREE.Mesh(G.sphere, M.trunk); crown.scale.setScalar(0.5); crown.position.copy(top); scene.add(crown)
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
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(), color: '#ffe2b0', transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending })); halo.scale.set(3.2, 3.2, 1); halo.position.set(k * 14 + 1.2, 6.1, z); scene.add(halo)
    const pool = new THREE.Mesh(new THREE.PlaneGeometry(9, 9), new THREE.MeshBasicMaterial({ map: glowTex(), color: '#ffcf8f', transparent: true, opacity: 0.32, depthWrite: false, blending: THREE.AdditiveBlending }))
    pool.rotation.x = -Math.PI / 2; pool.position.set(k * 14 + 1.2, 0.09, z + (z > 0 ? 3 : -3)); scene.add(pool)
  }
  const cars = []
  const tint = new THREE.MeshStandardMaterial({ color: '#0d1117', roughness: 0.1, metalness: 0.6 })
  const tyre = new THREE.MeshStandardMaterial({ color: '#141518', roughness: 0.9 })
  const carMat = [new THREE.MeshStandardMaterial({ color: '#b9bec6', roughness: 0.5 }), new THREE.MeshStandardMaterial({ color: '#3d4450', roughness: 0.5 }), new THREE.MeshStandardMaterial({ color: '#7d8590', roughness: 0.5 })]
  for (let k = 0; k < 8; k++) {
    const car = new THREE.Group(); car.userData.keep = true
    box(carMat[k % 3], 4.2, 0.9, 1.9, 0, 0.85, 0, car); box(carMat[k % 3], 2.3, 0.75, 1.7, -0.3, 1.65, 0, car)
    box(tint, 2.36, 0.5, 1.74, -0.3, 1.68, 0, car)
    for (const wx of [-1.35, 1.35]) for (const wz of [-0.92, 0.92]) { const wh = new THREE.Mesh(G.cyl, tyre); wh.scale.set(0.72, 0.28, 0.72); wh.rotation.x = Math.PI / 2; wh.position.set(wx, 0.4, wz); car.add(wh) }
    box(M.lamp, 0.1, 0.25, 0.4, 2.12, 0.95, 0.6, car); box(M.lamp, 0.1, 0.25, 0.4, 2.12, 0.95, -0.6, car)
    box(new THREE.MeshBasicMaterial({ color: '#ff4b3a' }), 0.1, 0.2, 0.4, -2.12, 0.95, 0.6, car); box(new THREE.MeshBasicMaterial({ color: '#ff4b3a' }), 0.1, 0.2, 0.4, -2.12, 0.95, -0.6, car)
    const lane = k % 4, alongX = lane < 2
    Object.assign(car.userData, { alongX, lane, speed: 9 + (k % 3) * 3, off: k * 97 })
    if (!alongX) car.rotation.y = Math.PI / 2
    scene.add(car); cars.push(car)
  }

  // ---------- City ----------
  const cr = rng(7)
  const texCache = [0, 1, 2, 3, 4, 5].map(s => cityWindows(100 + s * 31, 6, 14))
  const cityRoof = new THREE.MeshStandardMaterial({ color: '#2b2e35', roughness: 0.8 })
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
    box(cityRoof, w + 0.4, 0.8, d + 0.4, x, h + 0.4, z)
    if (cr() < 0.45) { cyl(cityRoof, 1.2, 2.2, x + w * 0.2, h + 1.9, z - d * 0.2); cyl(cityRoof, 0.08, 1.2, x + w * 0.2 + 0.9, h + 0.9, z - d * 0.2 + 0.9) }
    if (h > 55) { const rl = new THREE.Mesh(G.sphere, new THREE.MeshBasicMaterial({ color: '#ff2a1a' })); rl.scale.setScalar(0.6); rl.position.set(x, h + 1.4, z); rl.userData.keep = true; scene.add(rl); blink.push(rl) }
  }

  // ---------- Merge everything static into one mesh per material (thousands of draw calls -> a few hundred) ----------
  function bake() {
    scene.updateMatrixWorld(true)
    const groups = new Map(), victims = []
    scene.traverse(o => {
      if (!o.isMesh || o.isSkinnedMesh || !o.material || Array.isArray(o.material) || o.material.visible === false) return
      for (let q = o; q; q = q.parent) if (q.userData.keep || !q.visible) return
      let geo = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone()
      for (const name of Object.keys(geo.attributes)) if (!['position', 'normal', 'uv'].includes(name)) geo.deleteAttribute(name)
      if (!geo.attributes.normal || !geo.attributes.uv) return
      geo.applyMatrix4(o.matrixWorld)
      const key = o.material.uuid
      if (!groups.has(key)) groups.set(key, { mat: o.material, geos: [], ro: 0 })
      const gg = groups.get(key); gg.geos.push(geo); gg.ro = Math.max(gg.ro, o.renderOrder); victims.push(o)
    })
    for (const o of victims) o.parent.remove(o)
    for (const { mat, geos, ro } of groups.values()) {
      const merged = mergeGeometries(geos, false); if (!merged) continue
      const m = new THREE.Mesh(merged, mat); m.renderOrder = ro; m.matrixAutoUpdate = false; m.updateMatrix(); scene.add(m)
    }
  }
  bake()

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
  const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 }))
  composer.addPass(new RenderPass(scene, camera))
  const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.45, 0.45, 0.9)
  composer.addPass(bloom)
  composer.addPass(new OutputPass())

  // ---------- Camera ----------
  let focus = 0, inside = null
  const cam = { pos: new THREE.Vector3(140, 110, 190), look: new THREE.Vector3(0, 30, 0) }   // starts high over the city and flies in
  const goal = { pos: cam.pos.clone(), look: cam.look.clone() }
  let drift = 0

  function overviewShot(i) {
    const y = levelMid(i)
    if (i === 10) return { pos: new THREE.Vector3(30, towerTop + 18, 52), look: new THREE.Vector3(0, towerTop + 2, 0) }
    const lift = i === 0 ? 7 : 5
    return { pos: new THREE.Vector3(27, Math.max(7, y + lift), 47), look: new THREE.Vector3(-2, y + (i === 0 ? 3 : 0), 0) }
  }
  function insideShot(i) {
    if (i === 0) return { pos: new THREE.Vector3(1.6, 3.0, 11.3), look: new THREE.Vector3(1.6, 2.9, -6) }
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
  const roomLight = new THREE.PointLight('#ffe2b8', 0, 20, 1.5); scene.add(roomLight)
  function enter(id) {
    const i = LEVELS.indexOf(id); if (i < 0) return
    if (i >= 1 && i <= 9) { roomLight.position.set(2.5, levelBase(i) + 0.5 + FH - 0.7, -1.5); roomLight.intensity = 6 } else roomLight.intensity = 0
    focus = i; inside = id; placeFrame(i)
    frame.visible = frameFill.visible = false
    apply(insideShot(i))
    onEnter(id)
  }
  function exit() {
    roomLight.intensity = 0
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

  let busyMap = {}
  function applyBusy() {
    floors.forEach((f) => { const b = !!busyMap[f.id]; f.heads.forEach(h => { h.material = b ? M.headBusy : M.head }) })
    for (const r of robots) {
      if (!r.floor) continue
      const want = busyMap[r.floor] ? 'Yes' : 'Idle'
      if (want !== r.current) { r.actions[r.current].fadeOut(0.4); r.actions[want].reset().fadeIn(0.4).play(); r.current = want }
    }
  }
  function setBusy(map) { busyMap = map || {}; applyBusy() }

  function resize() {
    const w = canvas.clientWidth, h = canvas.clientHeight
    renderer.setSize(w, h, false); composer.setSize(w, h)
    camera.aspect = w / h; camera.fov = w < 700 ? 58 : 38; camera.updateProjectionMatrix()
  }
  addEventListener('resize', resize); resize()

  const still = matchMedia('(prefers-reduced-motion: reduce)').matches
  const clock = new THREE.Clock()
  const perf = { frames: 0, time: 0, since: performance.now() + 3000 }
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
      for (const b of blink) b.visible = Math.sin(t * 2.4) > 0.2
      for (const jet of jets) {
        const a = jet.geo.attributes.position.array
        for (let q = 0; q < jet.seeds.length; q++) {
          const ph = (t * 0.9 + jet.seeds[q]) % 1, ang = jet.seeds[q] * 40
          a[q * 3] = jet.x + Math.cos(ang) * ph * 0.35; a[q * 3 + 1] = 1.2 + ph * 2.6 - ph * ph * 2.4; a[q * 3 + 2] = jet.z + Math.sin(ang) * ph * 0.35
        }
        jet.geo.attributes.position.needsUpdate = true
      }
      for (const w of walkers) {
        const u = (t * w.speed + w.off) % (Math.PI * 2)
        w.obj.position.set(w.cx + Math.cos(u) * w.rx, 0.52, w.cz + Math.sin(u) * w.rz)
        w.obj.rotation.y = Math.atan2(-Math.sin(u) * w.rx, Math.cos(u) * w.rz) * (w.speed > 0 ? 1 : -1) + (w.speed > 0 ? 0 : Math.PI)
      }
    }
    for (const m of mixers) m.update(dt)
    // Keep it smooth: if the frame rate sags, render at a slightly lower resolution.
    perf.frames++
    if (performance.now() - perf.since > 2000) {
      const fps = perf.frames / ((performance.now() - perf.since) / 1000)
      if (fps < 50 && pixelRatio > 0.85) { pixelRatio = Math.max(0.85, pixelRatio - 0.25); renderer.setPixelRatio(pixelRatio); composer.setPixelRatio?.(pixelRatio); resize() }
      perf.frames = 0; perf.since = performance.now()
    }
    composer.render()
  })

  setFocus(0, { silent: true })
  return { focus: (id) => setFocus(LEVELS.indexOf(id)), focusIndex: () => focus, step: (d) => setFocus(focus + d), enter, exit, setBusy, levels: LEVELS, isInside: () => inside }
}
