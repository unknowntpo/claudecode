// 仿生健身女性 v2：每一片外殼、每一個關節、每一支液壓缸都是程式寫出來的。
// 做法：每個身體部位是一個「連續的解剖曲面」（肌肉 = 曲面上的隆起），再切成一片片外殼，
//       片與片之間只留細縫；機構只從幾個窗口露出來（脊椎、腰、膝後、阿基里斯腱）。
// 座標：公尺，y 朝上，她面向 -z（背面朝 +z = 鏡頭側）。站姿全高 1.65 m。
// 角度慣例：0° = 身體右側 (+x)，90° = 背後 (+z)，180° = 左側，270° = 前方。左半邊的肌肉用鏡像。
// 比例取自 CHECKLIST.md 的量測表。
import * as THREE from 'three';
import {V3, D2R, sweepX, solid, ring, gearX, rbox, cylX, tube, taperTube, plate, put, aimX, capsuleR} from './vendor/parts.js';

const lerp = (a, b, k) => a + (b - a) * k;
const clamp01 = (x) => Math.min(1, Math.max(0, x));
const sstep = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const hash = (n) => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };
const gauss = (d) => Math.exp(-d * d);
const wrapDeg = (a) => ((a % 360) + 540) % 360 - 180; // → -180..180
// 把實際角度換成「右半邊」的解剖角度（左半邊鏡像）
const anat = (th) => { const t = ((th % 360) + 360) % 360; return Math.cos(t * D2R) >= 0 ? t : (540 - t) % 360; };
const dA = (a, b) => wrapDeg(a - b); // 角距

export function makeMats() {
  const phys = (o) => new THREE.MeshPhysicalMaterial(o);
  const std = (o) => new THREE.MeshStandardMaterial(o);
  return {
    shell: phys({color: '#f4f2ee', roughness: 0.32, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.05}),
    sand: phys({color: '#d6b597', roughness: 0.36, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.08}),
    sandDark: phys({color: '#b4927a', roughness: 0.42, metalness: 0, clearcoat: 0.7, clearcoatRoughness: 0.12}),
    bra: phys({color: '#4a4c52', roughness: 0.46, metalness: 0.05, clearcoat: 0.5, clearcoatRoughness: 0.16}),
    hair: phys({color: '#2e211b', roughness: 0.34, metalness: 0.05, clearcoat: 0.9, clearcoatRoughness: 0.1, side: THREE.DoubleSide}),
    graphite: std({color: '#2f3238', roughness: 0.36, metalness: 0.72}),
    gunmetal: std({color: '#555a62', roughness: 0.28, metalness: 0.9}),
    black: phys({color: '#111214', roughness: 0.3, metalness: 0.15, clearcoat: 0.8, clearcoatRoughness: 0.12}),
    rubber: std({color: '#1b1c1f', roughness: 0.75, metalness: 0}),
    steel: std({color: '#cdd1d6', roughness: 0.2, metalness: 1}),
    accent: std({color: '#000000', emissive: '#2fe39a', emissiveIntensity: 2.0}),
    visor: phys({color: '#050506', roughness: 0.05, metalness: 0.2, clearcoat: 1, clearcoatRoughness: 0.02}),
  };
}

// ------------------------------------------------------------------ 外殼片：從參數曲面切一塊有厚度的板
// S(u,v) → 局部座標的 V3；out(p) 給大致的外法線方向，用來自動校正正反面
function tile(group, mat, S, [u0, u1], [v0, v1], out, {t = 0.0055, nu = 12, nv = 12, bevel = 0.6} = {}) {
  const um = (u0 + u1) / 2, vm = (v0 + v1) / 2, e = 1e-4;
  const n = new V3().crossVectors(S(um + e, vm).sub(S(um - e, vm)), S(um, vm + e).sub(S(um, vm - e)));
  const flip = n.dot(out(S(um, vm))) < 0;
  const S2 = flip ? (u, v) => S(u, v0 + v1 - v) : S;
  return put(group, plate(S2, [u0, u1], [v0, v1], t, nu, nv, null, bevel), mat);
}

// ------------------------------------------------------------------ 軀幹：超橢圓截面 + 肌肉隆起
// y, 半寬 a, 半深 b, 深度中心 zc
const TORSO = [
  [0.74, 0.160, 0.090, 0.004], [0.82, 0.178, 0.094, 0.004], [0.90, 0.170, 0.092, 0.0], [0.98, 0.148, 0.086, 0.0],
  [1.05, 0.124, 0.080, 0.0], [1.10, 0.115, 0.078, 0.0], [1.16, 0.116, 0.082, 0.0], [1.22, 0.127, 0.090, -0.004],
  [1.29, 0.142, 0.094, -0.004], [1.35, 0.140, 0.086, 0.002], [1.40, 0.118, 0.070, 0.008], [1.44, 0.068, 0.052, 0.012],
];
function sec(y) {
  const T = TORSO;
  if (y <= T[0][0]) return {a: T[0][1], b: T[0][2], zc: T[0][3]};
  for (let i = 0; i < T.length - 1; i++) {
    if (y <= T[i + 1][0]) {
      const e = sstep(T[i][0], T[i + 1][0], y);
      return {a: lerp(T[i][1], T[i + 1][1], e), b: lerp(T[i][2], T[i + 1][2], e), zc: lerp(T[i][3], T[i + 1][3], e)};
    }
  }
  const L = T[T.length - 1];
  return {a: L[1], b: L[2], zc: L[3]};
}
// 肌肉：以右半邊的解剖角度定義
function torsoBump(th, y) {
  const a = anat(th);
  let d = 0;
  // 背闊肌：V 型帶，上方靠外側、下方往脊椎收
  const latC = lerp(70, 18, sstep(1.16, 1.34, y));
  d += 0.013 * gauss(dA(a, latC) / 17) * sstep(1.14, 1.2, y) * (1 - sstep(1.33, 1.38, y));
  // 棘下肌（肩胛）
  d += 0.012 * gauss(dA(a, 60) / 15) * gauss((y - 1.305) / 0.045);
  // 大圓肌 / 後肩
  d += 0.008 * gauss(dA(a, 30) / 14) * gauss((y - 1.35) / 0.03);
  // 豎脊肌兩條 + 脊椎溝
  d += 0.010 * gauss(dA(a, 80) / 5.5) * sstep(0.98, 1.04, y) * (1 - sstep(1.2, 1.28, y));
  d -= 0.006 * gauss(dA(a, 90) / 3.5) * (1 - sstep(1.3, 1.4, y));
  // 臀大肌：圓，下緣收得比上緣快（臀溝）
  const gy = y - 0.865;
  d += 0.032 * gauss(dA(a, 64) / 26) * gauss(gy / (gy < 0 ? 0.06 : 0.085));
  // 臀中肌
  d += 0.012 * gauss(dA(a, 22) / 18) * gauss((y - 0.975) / 0.045);
  // 胸（前）
  d += 0.034 * gauss(dA(a, 290) / 17) * gauss((y - 1.285) / (y < 1.285 ? 0.04 : 0.065));
  // 腹肌（前）淺淺的
  d += 0.004 * gauss(dA(a, 280) / 8) * sstep(1.04, 1.08, y) * (1 - sstep(1.17, 1.21, y));
  return d;
}
const SE = 2.25;
function torsoPt(thDeg, y, off = 0) {
  const {a, b, zc} = sec(y);
  const t = thDeg * D2R, c = Math.cos(t), s = Math.sin(t);
  const x = a * Math.sign(c) * Math.pow(Math.abs(c), 2 / SE);
  const z = zc + b * Math.sign(s) * Math.pow(Math.abs(s), 2 / SE);
  const n = new V3(x / (a * a), 0, (z - zc) / (b * b)).normalize();
  return new V3(x, y, z).addScaledVector(n, off + torsoBump(thDeg, y));
}
const torsoOut = (o) => (p) => { const q = p.clone().add(o); const {zc} = sec(q.y); return new V3(q.x, 0, q.z - zc).normalize(); };
// 軀幹上的一片：th 與 y 可以是 (u,v) 的函式（做出曲線的縫）
function torsoTile(group, o, mat, th0, th1, y0, y1, {off = 0, gap = 0.0035, thFn = null, yFn = null, ...opt} = {}) {
  const r = 0.12; // 換算縫寬用的平均半徑
  const gTh = (gap / r) / D2R / 2;
  const S = (u, v) => {
    const th = thFn ? thFn(u, v) : lerp(th0 + gTh * Math.sign(th1 - th0), th1 - gTh * Math.sign(th1 - th0), u);
    const y = yFn ? yFn(u, v) : lerp(y0 + gap / 2, y1 - gap / 2, v);
    return torsoPt(th, y, off).sub(o);
  };
  return tile(group, mat, S, [0, 1], [0, 1], torsoOut(o), opt);
}
const M_ = (s, th) => (s > 0 ? th : 180 - th);

// ------------------------------------------------------------------ 肢體：沿局部 -y 的解剖曲面 r(s, θ)
function limbTile(group, mat, side, rFn, s0, s1, a0, a1, {gap = 0.003, off = 0, ...opt} = {}) {
  const rm = rFn((s0 + s1) / 2, (a0 + a1) / 2);
  const gA = (gap / rm) / D2R / 2;
  const S = (u, v) => {
    const s = lerp(s0 + gap / 2, s1 - gap / 2, u);
    const a = lerp(a0 + gA, a1 - gA, v); // 解剖角
    const act = (side > 0 ? a : 180 - a) * D2R; // 實際角
    const r = rFn(s, a) + off;
    return new V3(r * Math.cos(act), -s, r * Math.sin(act));
  };
  const out = (p) => new V3(p.x, 0, p.z).normalize();
  return tile(group, mat, S, [0, 1], [0, 1], out, opt);
}
function limbCore(group, mat, s0, s1, rFn) {
  const g = solid(s0, s1, (u) => rFn(lerp(s0, s1, u)), {segs: 24}, 24);
  g.rotateZ(-Math.PI / 2);
  return put(group, g, mat);
}
// 小型伺服：齒輪 + 軸蓋（嵌在關節側面，不外凸）
function servo(parent, M, x, y, z, r, w) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  parent.add(g);
  put(g, gearX(16, r, r * 0.86, w, r * 0.35, 5), M.graphite);
  put(g, cylX(r * 0.45, r * 0.45, w * 1.2, 20), M.gunmetal);
  put(g, cylX(r * 0.2, r * 0.2, w * 1.4, 12), M.steel);
  return g;
}

export const DIM = {pelvisY: 0.97, waistY: 1.07, chestY: 1.27, neckY: 1.43, headY: 1.555, hipX: 0.085, hipDY: -0.075,
  thigh: 0.425, shin: 0.40, shoulderX: 0.15, shoulderDY: 0.07, upper: 0.28, fore: 0.24};

export function buildRobot(M) {
  const root = new THREE.Group();
  const J = {};
  const mk = (name, parent, x, y, z) => { const g = new THREE.Group(); g.name = name; g.position.set(x, y, z); g.rotation.order = 'YZX'; parent.add(g); J[name] = g; return g; };
  const pelvis = mk('pelvis', root, 0, DIM.pelvisY, 0);
  const waist = mk('waist', pelvis, 0, DIM.waistY - DIM.pelvisY, 0);
  const chest = mk('chest', waist, 0, DIM.chestY - DIM.waistY, 0);
  const neck = mk('neck', chest, 0, DIM.neckY - DIM.chestY, 0.008);
  const head = mk('head', neck, 0, DIM.headY - DIM.neckY, -0.012);
  const O = {pelvis: new V3(0, DIM.pelvisY, 0), waist: new V3(0, DIM.waistY, 0), chest: new V3(0, DIM.chestY, 0)};
  const updaters = [];

  // ---------------- 軀幹核心（深色），在每條縫底下
  for (const [g, o, y0, y1] of [[pelvis, O.pelvis, 0.77, 1.075], [waist, O.waist, 1.06, 1.175], [chest, O.chest, 1.16, 1.445]]) {
    torsoTile(g, o, g === pelvis ? M.sandDark : M.graphite, 0, 360, y0, y1, {off: -0.008, gap: 0, t: 0.03, nu: 64, nv: 12});
  }

  // ---------------- 脊椎窗：腰段完全外露，胸段在 racerback 底下
  const spinePts = [];
  for (let i = 0; i < 20; i++) {
    const y = lerp(1.11, 1.43, i / 19);
    const p = torsoPt(90, y, -0.006);
    spinePts.push(p);
    const [g, o] = y < 1.17 ? [waist, O.waist] : [chest, O.chest];
    const q = p.clone().sub(o);
    put(g, rbox(0.026, 0.014, 0.022, 0.004), M.black, q.x, q.y, q.z - 0.004);
    put(g, rbox(0.01, 0.01, 0.012, 0.003), M.gunmetal, q.x, q.y + 0.008, q.z + 0.004);
  }
  for (const [g, o, y0, y1] of [[waist, O.waist, 1.105, 1.175], [chest, O.chest, 1.16, 1.43]]) {
    const pts = spinePts.filter((p) => p.y >= y0 - 0.025 && p.y <= y1 + 0.025).map((p) => p.clone().sub(o).add(new V3(0, 0, 0.006)));
    if (pts.length >= 2) put(g, tube(pts, 0.0016, 40, 6), M.accent);
  }
  // 腰窗兩側的斜向連桿（腹斜肌）
  for (const s of [-1, 1]) {
    for (let k = 0; k < 2; k++) {
      const a = torsoPt(M_(s, 84 - k * 3), 1.08 + k * 0.045, -0.004).sub(O.waist);
      const b = torsoPt(M_(s, 70 - k * 3), 1.12 + k * 0.045, -0.004).sub(O.waist);
      const g = new THREE.Group(); g.position.copy(a); aimX(g, b.clone().sub(a)); waist.add(g);
      const L = b.distanceTo(a);
      put(g, cylX(0.004, 0.004, L * 0.6, 10), M.gunmetal, L * 0.3, 0, 0);
      put(g, cylX(0.002, 0.002, L * 0.5, 8), M.steel, L * 0.72, 0, 0);
    }
  }

  // ---------------- 上身外殼（白）
  for (const s of [-1, 1]) {
    const T = (th) => M_(s, th);
    const ch = (th0, th1, y0, y1, opt) => torsoTile(chest, O.chest, M.shell, T(th0), T(th1), y0, y1, opt);
    ch(46, 87, 1.165, 1.27);                // 下背
    ch(42, 87, 1.27, 1.375);                // 肩胛
    ch(4, 46, 1.165, 1.34, {thFn: (u, v) => lerp(T(lerp(8, 2, v)), T(lerp(44, 42, v)), u), yFn: (u, v) => lerp(1.168, 1.338, v)}); // 背闊肌側
    ch(-40, 4, 1.165, 1.355);               // 側肋
    ch(10, 87, 1.375, 1.445, {nv: 8});      // 斜方肌
    ch(-90, -40, 1.165, 1.40);              // 前胸外側（罩杯下）
    ch(-90, -40, 1.40, 1.445, {nv: 6});     // 鎖骨
    // 腰：豎脊肌片（脊椎窗兩旁）、側腰、腹
    const wa = (th0, th1, y0, y1, opt) => torsoTile(waist, O.waist, M.shell, T(th0), T(th1), y0, y1, opt);
    wa(70, 86.5, 1.105, 1.172);
    wa(18, 70, 1.105, 1.172);
    wa(-40, 18, 1.105, 1.172);
    wa(-90, -60, 1.105, 1.172);
    wa(-60, -40, 1.105, 1.172);
  }

  // ---------------- 運動內衣（racerback，深灰）：疊在外殼上
  const braT = {off: 0.006, gap: 0.0, t: 0.007};
  torsoTile(chest, O.chest, M.bra, 0, 360, 1.16, 1.2, {...braT, nu: 72, nv: 4});
  torsoTile(chest, O.chest, M.bra, 0, 1, 1.195, 1.32, {...braT, nu: 12, nv: 10,
    thFn: (u, v) => lerp(64, 116, v) + (90 - lerp(64, 116, v)) * 0.42 * sstep(0.1, 1, u), yFn: (u) => lerp(1.195, 1.32, u)});
  for (const s of [-1, 1]) {
    torsoTile(chest, O.chest, M.bra, 0, 1, 1.31, 1.446, {...braT, off: 0.0065, nu: 12, nv: 5,
      thFn: (u, v) => M_(s, lerp(lerp(86, 74, v), lerp(60, 50, v), sstep(0, 1, u))), yFn: (u) => lerp(1.31, 1.446, u)});
  }
  torsoTile(chest, O.chest, M.bra, 196, 344, 1.195, 1.385, {...braT, nu: 28, nv: 14});

  // ---------------- 緊身褲（沙色）：腰帶、臀、髖、小腹
  torsoTile(waist, O.waist, M.sandDark, 0, 360, 1.072, 1.106, {off: 0.004, gap: 0, nu: 72, nv: 4});
  for (const s of [-1, 1]) {
    const T = (th) => M_(s, th);
    const pv = (th0, th1, y0, y1, opt) => torsoTile(pelvis, O.pelvis, M.sand, T(th0), T(th1), y0, y1, opt);
    // 臀：下緣是一道弧（臀溝），上緣接臀中肌
    pv(0, 1, 0.78, 0.945, {nu: 18, nv: 18,
      thFn: (u, v) => T(lerp(30, 89.6, v)),
      yFn: (u, v) => lerp(0.775 + 0.06 * Math.pow(Math.max(0, (89.6 - lerp(30, 89.6, v)) / 60), 1.5), 0.945, u)});
    pv(16, 89.6, 0.945, 1.075);
    pv(-40, 16, 0.945, 1.075);
    pv(-40, 30, 0.83, 0.945);
    pv(-90, -40, 0.86, 1.075);
  }

  torsoTile(pelvis, O.pelvis, M.sandDark, 86, 94, 0.77, 1.075, {off: -0.004, gap: 0, nu: 4, nv: 24});

  // ---------------- 頸
  {
    const L = DIM.headY - DIM.neckY;
    put(neck, new THREE.CylinderGeometry(0.034, 0.04, L + 0.02, 20).translate(0, L / 2 - 0.02, 0), M.graphite);
    for (let k = 0; k < 4; k++) put(neck, ring(-0.004, 0.004, 0.034, 0.043 - k * 0.002, 0.002, {segs: 32}).rotateZ(Math.PI / 2), M.gunmetal, 0, 0.008 + k * 0.022, 0);
    for (const s of [-1, 1]) {
      const g = new THREE.Group(); g.position.set(s * 0.036, -0.01, 0.015); neck.add(g);
      const b = new V3(s * 0.02, L - 0.035, -0.012); aimX(g, b.clone().sub(g.position));
      const LL = b.distanceTo(g.position);
      put(g, cylX(0.007, 0.007, LL * 0.6, 12), M.shell, LL * 0.3, 0, 0);
      put(g, cylX(0.0035, 0.0035, LL * 0.5, 8), M.steel, LL * 0.72, 0, 0);
    }
  }

  // ---------------- 頭與鮑伯頭
  {
    const skull = solid(-0.1, 0.095, capsuleR(0.078, 0.07, 0.5), {segs: 32}, 24).rotateZ(Math.PI / 2).scale(0.9, 1, 1.08);
    put(head, skull, M.shell);
    const vis = sweepX([[-0.035, 0.083], [0.022, 0.087], [0.022, 0.08], [-0.035, 0.076]], {a0: 215 * D2R, a1: 325 * D2R, segs: 24}).rotateZ(Math.PI / 2);
    put(head, vis, M.visor, 0, 0.0, 0);
    // 頭髮：一層連續的曲面，帶細細的髮束起伏，下緣不齊；外層 + 內層兩層
    const H0 = -0.02, TOP = 0.097;
    const hairR = (h) => {
      if (h >= H0) return 0.112 * Math.sqrt(Math.max(0, 1 - Math.pow((h - H0) / (TOP - H0), 2)));
      const d = (H0 - h) / 0.165;
      return 0.112 - 0.004 * d - 0.012 * sstep(0.82, 1.0, d);
    };
    const bottomAt = (thDeg, k) => { // thDeg: 0 = 右, 90 = 背, 270 = 前
      const df = Math.abs(dA(thDeg, 270));
      if (df < 50) return 0.0 - 0.014 * hash(Math.floor(thDeg / 7) + k);           // 瀏海
      if (df < 78) return lerp(-0.03, -0.15, (df - 50) / 28);                       // 臉側
      return -0.168 - 0.02 * sstep(78, 180, df) - 0.008 * hash(Math.floor(thDeg / 9) + k * 5);
    };
    const hairLayer = (k, scale, phase) => {
      const N = 160;
      const S = (u, v) => { // u: 角度 0..1, v: 0 = 下緣 → 1 = 頭頂
        const th = u * 360;
        const hb = bottomAt(th, k);
        const h = lerp(hb, TOP, Math.pow(v, 1.0));
        const strands = 0.0028 * Math.sin(th * D2R * 46 + phase + 2.2 * Math.sin(th * D2R * 7 + h * 25)) * sstep(TOP, TOP - 0.06, h);
        const flick = 0.006 * sstep(-0.12, -0.19, h) * (Math.abs(dA(th, 270)) > 80 ? 1 : 0);
        const r = (hairR(h) + strands + flick) * scale;
        const a = th * D2R;
        return new V3(r * Math.cos(a), h, r * Math.sin(a) * 1.08 + 0.008);
      };
      const out = (p) => new V3(p.x, p.y * 0.4, p.z - 0.008).normalize();
      return tile(head, M.hair, S, [0, 1], [0, 1], out, {t: 0.006, nu: N, nv: 40, bevel: 0.2});
    };
    hairLayer(0, 1.0, 0);
    hairLayer(3, 0.955, 1.3);
  }

  // ---------------- 手臂
  for (const s of [-1, 1]) {
    const sh = mk(`shoulder${s}`, chest, s * DIM.shoulderX, DIM.shoulderDY, 0.012);
    const el = mk(`elbow${s}`, sh, 0, -DIM.upper, 0);
    const wr = mk(`wrist${s}`, el, 0, -DIM.fore, 0);
    // 上臂：三角肌圓蓋 + 三頭肌（後）+ 二頭肌（前）
    const rU = (x, a = 0) => {
      const base = lerp(0.043, 0.031, clamp01(x / DIM.upper));
      const cap = 0.048 * Math.sqrt(Math.max(0, 1 - Math.pow((x - 0.035) / 0.105, 2))) * (1 + 0.12 * Math.cos(a * D2R));
      const r0 = x < 0.035 ? cap : Math.max(base, cap);
      return r0 + 0.009 * gauss(dA(a, 105) / 35) * gauss((x - 0.17) / 0.06) + 0.007 * gauss(dA(a, 270) / 35) * gauss((x - 0.18) / 0.05);
    };
    limbCore(sh, M.graphite, -0.03, DIM.upper, (x) => Math.max(0.02, rU(x, 0) * 0.8));
    limbTile(sh, M.shell, s, rU, -0.058, 0.125, 35, 150, {nu: 14});
    limbTile(sh, M.shell, s, rU, -0.058, 0.125, -40, 35, {nu: 14});
    limbTile(sh, M.shell, s, rU, -0.058, 0.125, -150, -40, {nu: 14});
    limbTile(sh, M.shell, s, rU, 0.125, 0.268, 35, 150);
    limbTile(sh, M.shell, s, rU, 0.125, 0.268, -40, 35);
    limbTile(sh, M.shell, s, rU, 0.125, 0.268, -140, -40);
    limbTile(sh, M.shell, s, rU, 0.08, 0.268, 150, 220);
    // 手肘
    servo(el, M, s * 0.012, 0, 0, 0.024, 0.03);
    const rF = (x, a = 0) => lerp(0.039, 0.023, clamp01(x / DIM.fore)) + 0.006 * gauss((x - 0.06) / 0.06) * (1 + 0.3 * Math.cos((a - 60) * D2R));
    limbCore(el, M.graphite, -0.02, DIM.fore, (x) => rF(x) * 0.78);
    limbTile(el, M.shell, s, rF, 0.008, 0.15, 20, 160);
    limbTile(el, M.shell, s, rF, 0.008, 0.15, 160, 380);
    limbTile(el, M.shell, s, rF, 0.15, 0.218, 0, 180);
    limbTile(el, M.shell, s, rF, 0.15, 0.218, 180, 360);
    put(el, ring(-0.003, 0.003, rF(0.226) - 0.004, rF(0.226) + 0.002, 0.001, {segs: 32}).rotateZ(Math.PI / 2), M.gunmetal, 0, -0.226, 0);
    // 手
    put(wr, rbox(0.022, 0.08, 0.058, 0.008), M.graphite, s * -0.002, -0.045, 0);
    put(wr, rbox(0.008, 0.066, 0.054, 0.004), M.shell, s * 0.011, -0.04, 0);
    for (let f = 0; f < 4; f++) {
      const z = lerp(-0.021, 0.021, f / 3), len = [0.072, 0.082, 0.078, 0.062][f];
      put(wr, taperTube([[0, -0.085, z], [s * -0.007, -0.085 - len * 0.55, z], [s * -0.017, -0.085 - len, z * 1.05]], 0.0072, 0.0052, 16, 8), M.shell);
      put(wr, new THREE.SphereGeometry(0.0065, 10, 8), M.graphite, s * -0.004, -0.085 - len * 0.32, z);
    }
    put(wr, taperTube([[s * -0.008, -0.03, -0.03], [s * -0.016, -0.065, -0.042], [s * -0.022, -0.092, -0.04]], 0.009, 0.006, 16, 8), M.shell);
  }

  // ---------------- 腿
  for (const s of [-1, 1]) {
    const hip = mk(`hip${s}`, pelvis, s * DIM.hipX, DIM.hipDY, 0);
    const knee = mk(`knee${s}`, hip, 0, -DIM.thigh, 0);
    const ankle = mk(`ankle${s}`, knee, 0, -DIM.shin, 0);
    // 大腿：股外側肌（外）、膕旁肌（後）、股內側肌淚滴（膝上內前）、內收肌（內上）
    const rT = (x, a = 0) => {
      const base = lerp(0.1, 0.06, Math.pow(clamp01(x / DIM.thigh), 1.15));
      return base * (1 + 0.05 * Math.cos(2 * a * D2R))
        + 0.014 * gauss(dA(a, 5) / 40) * gauss((x - 0.16) / 0.14)
        + 0.010 * gauss(dA(a, 95) / 38) * gauss((x - 0.2) / 0.12)
        + 0.011 * gauss(dA(a, 225) / 25) * gauss((x - 0.33) / 0.06)
        + 0.008 * gauss(dA(a, 270) / 30) * gauss((x - 0.18) / 0.12)
        + 0.012 * gauss(dA(a, 175) / 30) * gauss((x - 0.06) / 0.1);
    };
    limbCore(hip, M.graphite, 0.09, DIM.thigh + 0.02, (x) => rT(x, 0) * 0.8);
    const th = (s0, s1, a0, a1, o) => limbTile(hip, M.sand, s, rT, s0, s1, a0, a1, o);
    th(-0.02, 0.2, 48, 135); th(0.2, 0.395, 48, 135);       // 膕旁肌兩段
    th(0.07, 0.405, -45, 48, {nu: 16});                      // 外側
    th(-0.0, 0.31, 225, 315, {nu: 16});                     // 前
    th(0.31, 0.41, 200, 315);                              // 膝上
    th(0.02, 0.405, 135, 225, {nu: 16});                    // 內側
    // 膝：兩側小伺服、膝蓋片、膝後窗口（連桿）
    servo(knee, M, s * 0.05, 0, 0.0, 0.024, 0.02);
    servo(knee, M, -s * 0.048, 0, 0.0, 0.022, 0.016);
    const rS = (x, a = 0) => {
      const base = lerp(0.056, 0.031, Math.pow(clamp01(x / DIM.shin), 0.85)) * (1 + 0.1 * Math.cos(2 * a * D2R));
      return base
        + 0.026 * gauss(dA(a, 138) / 40) * gauss((x - 0.13) / 0.075)
        + 0.019 * gauss(dA(a, 42) / 38) * gauss((x - 0.11) / 0.07)
        - 0.004 * gauss(dA(a, 270) / 30);
    };
    limbCore(knee, M.graphite, -0.03, DIM.shin, (x) => rS(x, 0) * 0.8);
    limbTile(knee, M.sand, s, () => 0.062, -0.035, 0.03, 230, 310, {t: 0.008});
    limbTile(knee, M.sand, s, () => 0.06, -0.03, 0.03, -40, 40, {t: 0.006});
    limbTile(knee, M.sand, s, () => 0.06, -0.03, 0.03, 140, 220, {t: 0.006});
    const sh = (s0, s1, a0, a1, o) => limbTile(knee, M.sand, s, rS, s0, s1, a0, a1, o);
    sh(0.0, 0.23, 92, 180);   // 腓腸肌內側頭
    sh(0.0, 0.21, 20, 92);    // 腓腸肌外側頭
    sh(0.03, 0.34, 200, 340);   // 脛骨前
    sh(0.03, 0.34, -20, 20);   // 外
    sh(0.23, 0.345, 100, 200);  // 下內
    sh(0.21, 0.345, 20, 80);    // 下外（中間留阿基里斯窗）
    put(knee, ring(-0.004, 0.004, rS(0.36) - 0.004, rS(0.36) + 0.004, 0.001, {segs: 32}).rotateZ(Math.PI / 2), M.accent, 0, -0.358, 0);
    // 腳踝與鞋
    servo(ankle, M, 0, 0, 0, 0.02, 0.064);
    const foot = mk(`foot${s}`, ankle, 0, 0, 0);
    const shoe = solid(0, 0.25, (u) => (u < 0.45 ? lerp(0.052, 0.056, u / 0.45) : lerp(0.056, 0.04, (u - 0.45) / 0.55)) * Math.sqrt(Math.min(1, Math.min(u, 1 - u) / 0.12 + 0.15)), {segs: 32}, 32);
    shoe.rotateY(Math.PI / 2).scale(0.8, 0.52, 1).translate(0, -0.04, 0.07);
    put(foot, shoe, M.shell);
    put(foot, rbox(0.084, 0.018, 0.255, 0.008), M.rubber, 0, -0.064, -0.054);
    put(foot, ring(-0.012, 0.012, 0.034, 0.041, 0.003, {segs: 32}).rotateZ(Math.PI / 2), M.shell, 0, -0.008, 0.008);
    J[`heel${s}`] = new THREE.Object3D(); J[`heel${s}`].position.set(0, -0.073, 0.065); foot.add(J[`heel${s}`]);
    J[`toe${s}`] = new THREE.Object3D(); J[`toe${s}`].position.set(0, -0.073, -0.175); foot.add(J[`toe${s}`]);
    // 阿基里斯腱液壓缸、膝後連桿（兩段式，關節動時自然伸縮）
    updaters.push(pistonPair(M, knee, new V3(0, -0.215, 0.032), foot, new V3(0, -0.025, 0.055), 0.0105));
    updaters.push(pistonPair(M, hip, new V3(s * 0.018, -0.33, 0.045), knee, new V3(s * 0.014, -0.06, 0.04), 0.0075));
    updaters.push(pistonPair(M, hip, new V3(-s * 0.018, -0.33, 0.045), knee, new V3(-s * 0.016, -0.06, 0.04), 0.0065));
  }

  root.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return {root, J, updaters, clear: [], M};
}

// 兩段式液壓缸：缸體在 A 上、桿在 B 上，各自朝向對方，所以關節動時會自然伸縮
function pistonPair(M, gA, pA, gB, pB, r) {
  const A = new THREE.Group(); A.position.copy(pA); gA.add(A);
  const B = new THREE.Group(); B.position.copy(pB); gB.add(B);
  const cyl = put(A, cylX(r, r, 1, 14), M.gunmetal);
  put(A, new THREE.SphereGeometry(r * 1.25, 12, 8), M.graphite);
  const rod = put(B, cylX(r * 0.45, r * 0.45, 1, 10), M.steel);
  put(B, new THREE.SphereGeometry(r * 1.05, 12, 8), M.graphite);
  const wa = new V3(), wb = new V3();
  return () => {
    A.parent.updateWorldMatrix(true, false); B.parent.updateWorldMatrix(true, false);
    A.parent.localToWorld(wa.copy(A.position)); B.parent.localToWorld(wb.copy(B.position));
    const L = wa.distanceTo(wb);
    // A 朝向 B
    const la = A.parent.worldToLocal(wb.clone()).sub(A.position); aimX(A, la);
    const lb = B.parent.worldToLocal(wa.clone()).sub(B.position); aimX(B, lb);
    cyl.scale.set(L * 0.58, 1, 1); cyl.position.set(L * 0.29, 0, 0);
    rod.scale.set(L * 0.55, 1, 1); rod.position.set(L * 0.275, 0, 0);
  };
}

// ------------------------------------------------------------------ 姿勢
// state: {hipFlex:[L,R], knee:[L,R], footPitch:[L,R], hipAbd, armFlex:[L,R], elbow:[L,R], armAbd, yaw, roll, tilt, sway}
export function pose(R, st) {
  const {J} = R;
  J.pelvis.position.x = st.sway || 0;
  J.pelvis.rotation.set(st.tilt || 0, st.yaw || 0, st.roll || 0);
  J.waist.rotation.set(0.0, -(st.yaw || 0) * 0.25, -(st.roll || 0) * 0.25);
  J.chest.rotation.set(0.02, -(st.yaw || 0) * 0.35, -(st.roll || 0) * 0.25);
  J.neck.rotation.set(-(st.tilt || 0) * 0.5, (st.yaw || 0) * 0.3, (st.roll || 0) * 0.25);
  J.head.rotation.set(0, (st.yaw || 0) * 0.15, (st.roll || 0) * 0.15);
  [-1, 1].forEach((s, i) => {
    const hf = st.hipFlex[i], kn = st.knee[i];
    J[`hip${s}`].rotation.set(hf - (st.tilt || 0), 0, s * (st.hipAbd ?? 0.03));
    J[`knee${s}`].rotation.set(-kn, 0, -s * (st.hipAbd ?? 0.03) * 0.8);
    J[`ankle${s}`].rotation.set(st.footPitch[i] - hf + kn, 0, 0);
    J[`shoulder${s}`].rotation.set(st.armFlex[i], 0, s * (st.armAbd ?? 0.16));
    J[`elbow${s}`].rotation.set(st.elbow[i], 0, -s * 0.05);
    J[`wrist${s}`].rotation.set(0.05, 0, s * 0.05);
  });
  // 貼地：最低的腳跟/腳尖碰到 y=0
  R.root.position.y = 0;
  R.root.updateMatrixWorld(true);
  const w = new V3();
  let low = Infinity;
  for (const k of ['heel-1', 'toe-1', 'heel1', 'toe1']) { J[k].getWorldPosition(w); low = Math.min(low, w.y); }
  R.root.position.y = -low;
  R.root.updateMatrixWorld(true);
  for (const u of R.updaters) u();
}

// 步態：沿用第一版的關鍵影格（髖、膝、腳掌）
const LEG_KEYS = [
  [0.00, 0.40, 0.04, 0.24], [0.10, 0.33, 0.20, 0.00], [0.22, 0.19, 0.22, 0.00], [0.36, 0.01, 0.10, 0.00],
  [0.50, -0.15, 0.38, -0.32], [0.60, -0.17, 0.72, -0.80], [0.70, 0.02, 1.05, -0.45], [0.80, 0.30, 0.95, -0.10], [0.90, 0.46, 0.42, 0.14],
];
function herm(p, col) {
  const K = LEG_KEYS, n = K.length;
  const P = (i) => K[((i % n) + n) % n][0] + Math.floor(i / n);
  const Vv = (i) => K[((i % n) + n) % n][col];
  let i = n - 1; for (let k = 0; k < n; k++) if (K[k][0] <= p) i = k;
  const p0 = P(i), p1 = P(i + 1);
  const m0 = (Vv(i + 1) - Vv(i - 1)) / (P(i + 1) - P(i - 1)), m1 = (Vv(i + 2) - Vv(i)) / (P(i + 2) - P(i));
  const h = p1 - p0, s = (p - p0) / h, s2 = s * s, s3 = s2 * s;
  return (2 * s3 - 3 * s2 + 1) * Vv(i) + (s3 - 2 * s2 + s) * h * m0 + (-2 * s3 + 3 * s2) * Vv(i + 1) + (s3 - s2) * h * m1;
}
export function walkState(t, T = 1.0) {
  const fr = (x) => x - Math.floor(x);
  const pL = fr(t / T), pR = fr(t / T + 0.5), TAU = Math.PI * 2;
  const g = (p) => [herm(p, 1), herm(p, 2), herm(p, 3)];
  const [hL, kL, fL] = g(pL), [hR, kR, fR] = g(pR);
  return {
    hipFlex: [hL, hR], knee: [kL, kR], footPitch: [fL, fR], hipAbd: 0.02,
    armFlex: [0.55 * (hR - 0.13), 0.55 * (hL - 0.13)],
    elbow: [0.3 + 0.35 * Math.max(0.55 * (hR - 0.13), 0), 0.3 + 0.35 * Math.max(0.55 * (hL - 0.13), 0)],
    armAbd: 0.17, yaw: -0.085 * Math.cos(TAU * pL), roll: -0.06 * Math.sin(TAU * pL), tilt: -0.06, sway: -0.022 * Math.sin(TAU * pL),
  };
}
export const STAND = {hipFlex: [0, 0], knee: [0.02, 0.02], footPitch: [0, 0], hipAbd: 0.045, armFlex: [0.02, 0.02], elbow: [0.12, 0.12], armAbd: 0.2, yaw: 0, roll: 0, tilt: -0.04, sway: 0};
