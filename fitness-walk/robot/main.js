// 舞台（沿用 cutaway 的攝影棚：紙背景、軟陰影、清漆反光、GTAO）+ 仿生健身女性
import * as THREE from 'three';
import {createStage} from './vendor/stage.js';
import {makeMats, buildRobot, pose, walkState, STAND} from './robot.js';

const canvas = document.getElementById('c');
const q = new URLSearchParams(location.search);
const W = +(q.get('w') || 900), H = +(q.get('h') || 1600);
const stage = createStage({canvas, floorY: 0, span: 1.3});
stage.resize(W, H, 1);
const M = makeMats();
const R = buildRobot(M);
stage.addBody(R);

// 預設鏡頭：az 從 +z 往 +x 量（az=0 = 正背面），el 仰角，d 距離
const SHOTS = {
  back: {state: () => STAND, cam: {tx: 0, ty: 0.86, tz: 0, az: 0, el: 0.03, d: 3.75}},
  walk: {state: () => walkState(0.12), cam: {tx: 0, ty: 0.92, tz: 0, az: -0.38, el: -0.02, d: 3.5}},
  walkLow: {state: () => walkState(0.62), cam: {tx: 0, ty: 1.0, tz: 0, az: 0.3, el: -0.12, d: 3.1}},
  upper: {state: () => walkState(0.12), cam: {tx: 0, ty: 1.22, tz: 0, az: -0.25, el: 0.06, d: 1.55}},
};
window.shot = (name, hide = false) => {
  const s = SHOTS[name];
  R.root.visible = !hide;
  pose(R, s.state());
  stage.frame(s.cam);
  return true;
};
window.ready = true;
if (!q.has('capture')) window.shot(q.get('shot') || 'back');
