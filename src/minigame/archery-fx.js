// 「蛮族を射る」の見た目。進行は archery.js が決めていて、ここは映すだけ。
//
// 盤にある物をそのまま借りる ── 蛮族船と見張り塔は board3d が対戦用に
// 持っているので、作り直さない(見た目が2種類に分かれない)。

import * as THREE from 'three';
import { makeTower, makeBarbarianShip } from '../render3d/board3d.js';
import { POST_DECK_R, pileDrop } from './ground.js';
import { RANGE_PROPS } from './archery.js';

const SHIP_SCALE = 0.42;     // 盤の駒より小ぶりに。等倍だと浜を覆う
const FOE_H = 0.20;          // 蛮族の背丈(盤の寸法)
const TOWER_SCALE = 0.85;    // 浜に建てる櫓。盤の駒の大きさだと浜を覆う
// 矢。**盤の寸法にしては大きい。** 実物の比なら細い棒だが、
// 携帯の画面で 5 タイル先を飛ぶ矢は、正しい太さだと1画素も残らない
// ── 実際「飛んでいる矢が見えない」ところから太くした。
const ARROW_LEN = 0.30;
const ARROW_R = 0.011;
// 尾を引かせる。1フレームに 0.25 タイル進むので、1本の矢だけだと
// 点滅しているようにしか見えない
const TRACER_LEN = 0.55;
// 櫓の置き場所。立ち位置から見て、陸のほう(TOWER_BACK)と岸に沿った横
// (TOWER_SIDE)へずらす。
//
// **構えたときのカメラより後ろに置くのが肝。** カメラは肩の横・少し後ろに
// 付くので、それより後ろの物は画面に入りようがない。
//   横だけにずらす  … 端に映って邪魔だった(0.34)
//   横へ大きく逃がす … 邪魔ではなくなるが、歩いて近づいても見えず、
//                      「あの浜に何かある」の目印にならなかった(0.85)
//   後ろへ回す      … 陸から歩いてくる人は必ず通り、狙う間は映らない
const TOWER_BACK = 1.05;
const TOWER_SIDE = -0.45;

// 蛮族ひとり。棒人間ほど作り込まない ── 何人も出るし、遠くの浜で見るので、
// 「暗い色の人影が浜を上がってくる」ことのほうが大事。
function makeFoe() {
  const g = new THREE.Group();
  const cloth = new THREE.MeshStandardMaterial({ color: 0x3b2f3a, roughness: 0.9 });
  const skin = new THREE.MeshStandardMaterial({ color: 0xc09a72, roughness: 0.8 });
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(FOE_H * 0.24, FOE_H * 0.5, 3, 6), cloth);
  body.position.y = FOE_H * 0.5;
  body.castShadow = true;
  const head = new THREE.Mesh(new THREE.SphereGeometry(FOE_H * 0.2, 8, 6), skin);
  head.position.y = FOE_H * 0.92;
  // 斧。持たせるだけで「攻めてきている」が伝わる
  const axe = new THREE.Mesh(
    new THREE.BoxGeometry(FOE_H * 0.06, FOE_H * 0.55, FOE_H * 0.06),
    new THREE.MeshStandardMaterial({ color: 0x4a3423, roughness: 0.9 }),
  );
  axe.position.set(FOE_H * 0.26, FOE_H * 0.6, 0);
  axe.rotation.z = -0.35;
  const blade = new THREE.Mesh(
    new THREE.BoxGeometry(FOE_H * 0.18, FOE_H * 0.16, FOE_H * 0.04),
    new THREE.MeshStandardMaterial({ color: 0x9aa4ad, roughness: 0.5, metalness: 0.3 }),
  );
  blade.position.set(FOE_H * 0.36, FOE_H * 0.84, 0);
  g.add(body, head, axe, blade);
  return g;
}

function makeArrow() {
  const g = new THREE.Group();
  // 光らせる(emissive)。海と空を背にすると、明るい色でないと沈む
  const shaft = new THREE.Mesh(
    new THREE.CylinderGeometry(ARROW_R, ARROW_R, ARROW_LEN, 5),
    new THREE.MeshStandardMaterial({
      color: 0xf2e2b8, roughness: 0.6, emissive: 0x554521,
    }),
  );
  shaft.rotation.x = Math.PI / 2;   // 長さの向きを +Z へ
  const head = new THREE.Mesh(
    new THREE.ConeGeometry(ARROW_R * 2, 0.05, 5),
    new THREE.MeshStandardMaterial({
      color: 0xdfe6ec, roughness: 0.4, metalness: 0.35, emissive: 0x3a4550,
    }),
  );
  head.rotation.x = Math.PI / 2;
  head.position.z = ARROW_LEN / 2;
  // 矢羽根。後ろ端に十字で入れると、遠くでも「矢」に見える
  const featherMat = new THREE.MeshStandardMaterial({
    color: 0xe2604a, roughness: 0.8, side: THREE.DoubleSide, emissive: 0x401510,
  });
  for (const a of [0, Math.PI / 2]) {
    const f = new THREE.Mesh(new THREE.PlaneGeometry(0.05, 0.07), featherMat);
    f.rotation.set(Math.PI / 2, 0, a);
    f.position.z = -ARROW_LEN / 2 + 0.03;
    g.add(f);
  }
  // 尾。飛んだ跡を細く引く
  const tracer = new THREE.Mesh(
    new THREE.CylinderGeometry(ARROW_R * 0.5, ARROW_R * 1.4, TRACER_LEN, 4),
    new THREE.MeshBasicMaterial({ color: 0xfff0c8, transparent: true, opacity: 0.35 }),
  );
  tracer.rotation.x = Math.PI / 2;
  tracer.position.z = -ARROW_LEN / 2 - TRACER_LEN / 2;
  g.add(shaft, head, tracer);
  return g;
}

// 射場。木を片付けただけだと「たまたま開けている浜」にしか見えないので、
// 人の手が入った場所にする ── 板張りの台と、脇に積んだ樽と杭。
//
// **海のほうには何も置かない。** 弓を構える高さは地面から 0.11 しかなく、
// そこから撃ち下ろすので、正面に置いた物は低くても射線を塞ぐ。
function makeRange(post) {
  const g = new THREE.Group();
  const plank = new THREE.MeshStandardMaterial({ color: 0x8a6a44, roughness: 0.9 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x5d442a, roughness: 0.9 });

  // 斜め上から見下ろすようにしたぶん、台は小ぶりにする ── 大きいままだと
  // 手前の板が画面の半分を占めて、せっかく広げた海が狭くなる。
  //
  // **大きさは ground.js の POST_DECK_R から取る。** 板は海へせり出して
  // いて、その上も歩けることにしてあるので(makeWalkGround)、見た目と
  // 足場の半径がずれると「見えているのに踏み抜ける」が戻ってくる。
  const deck = new THREE.Mesh(
    new THREE.CylinderGeometry(POST_DECK_R - 0.02, POST_DECK_R + 0.02, 0.035, 12), plank,
  );
  deck.position.y = 0.017;
  deck.receiveShadow = true;
  g.add(deck);
  // 板の目。1枚板だと「土を塗った」ようにしか見えない。
  // 長さは円の弦に合わせる ── 全部同じ長さにすると、端の目が台からはみ出す
  const R = POST_DECK_R;
  for (let i = -2; i <= 2; i++) {
    const z = i * 0.13;
    const half = Math.sqrt(Math.max(0, R * R - z * z));
    const line = new THREE.Mesh(new THREE.BoxGeometry(half * 2, 0.004, 0.012), dark);
    line.position.set(0, 0.036, z);
    g.add(line);
  }
  // 脇の樽。左右にだけ置く(前は射線、後ろは櫓)。
  // **場所は archery.js の RANGE_PROPS**(ぶつかる判定と同じ表を読む)
  for (const o of RANGE_PROPS.filter((q) => q.kind === 'barrel')) {
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(o.r, o.r, o.h, 8), dark);
    barrel.position.set(o.x, o.h / 2, o.z);
    barrel.castShadow = true;
    g.add(barrel);
  }

  // ---- 杭(板を支える柱)----
  //
  // **海へせり出したぶんは、必ず下から支える。** 板の上を歩けるように
  // したら、宙に浮いた板の上に立っていることになって「物理的におかしい」と
  // 言われた。水面より下まで差し込む ── 陸の側は地面に刺さる(見えない)。
  //
  // 落差は「板の高さ − 水面」。post.y は島の地面の高さなので、島ごとに変わる。
  const drop = pileDrop(post.y);
  // **上端と下端から中心と長さを出す口を1つにする。** 別々に書いたら、
  // 舫い杭だけ中心を間違えて、下端が水面の 5cm 上で止まっていた。
  const stand = (topY) => ({ len: topY + drop, y: (topY - drop) / 2 });
  const pile = (x, z, topY = 0, r = 0.03, mat = dark) => {
    const s2 = stand(topY);
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 1.15, s2.len, 6), mat);
    m.position.set(x, s2.y, z);
    m.castShadow = true;
    g.add(m);
  };
  // 海側の縁に3本、横に2本。板の裏の少し内側に立てる(縁から出さない)
  const ring = POST_DECK_R - 0.05;
  for (const a of [-0.75, 0, 0.75]) pile(Math.sin(a) * ring, Math.cos(a) * ring);
  for (const sx of [-1, 1]) pile(sx * ring, -0.06);

  // 舫い杭。板を突き抜けて下まで通す ── 上だけ生えていると、
  // 何にも留まっていない棒が海に浮いていることになる(まさにそう言われた)。
  for (const o of RANGE_PROPS.filter((q) => q.kind === 'stake')) {
    pile(o.x, o.z, o.h, o.r * 0.75, plank);
  }
  // 岸に沿って向ける(板の目が海と平行になる)
  g.rotation.y = Math.atan2(post.outX, post.outZ);
  return g;
}

function dispose(root) {
  root.traverse((o) => {
    o.geometry?.dispose?.();
    if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m.dispose?.());
  });
}

export class ArcheryFx {
  // post: { x, z, y, outX, outZ } 櫓の場所。塔はここに建てる
  constructor(scene, post, towerColor = 0xd9d3c4) {
    this.scene = scene;
    this.post = post;
    // 櫓。撃っていないときも立っている ── 「あの浜に何かある」を先に見せる。
    // **立ち位置の真上ではなく、岸に沿って横へずらす。** 真上に建てると、
    // 海のほうを向いたときに櫓が正面をふさいで、撃つ相手が1隻も見えない
    // (港の看板を横へよけるのと同じ理由。ground.js の STAND_SIDE)。
    this.tower = makeTower(towerColor);
    this.tower.scale.setScalar(TOWER_SCALE);
    this.tower.position.set(
      post.x - post.outX * TOWER_BACK + post.outZ * TOWER_SIDE,
      post.y,
      post.z - post.outZ * TOWER_BACK - post.outX * TOWER_SIDE,
    );
    // 海を背にして立つ(旗が陸から見えるように)
    this.tower.rotation.y = Math.atan2(post.outX, post.outZ);
    scene.add(this.tower);

    // 射場。立ち位置そのものに敷く
    this.range = makeRange(post);
    this.range.position.set(post.x, post.y, post.z);
    scene.add(this.range);

    this.ships = new Map();   // id -> mesh
    this.foes = new Map();
    this.arrows = new Map();
    this.splashes = [];       // 沈んだ跡・倒れた跡(短い演出)
  }

  // 進行(archery.js の Raid)を1フレームぶん映す
  update(raid, t) {
    this._sync(raid.ships, this.ships, () => {
      const m = makeBarbarianShip();
      m.scale.setScalar(SHIP_SCALE);
      return m;
    }, (m, s) => {
      m.position.set(s.x, s.y, s.z);
      // 進む向き(岸のほう)を向く。船首が +X なので 90° ずらす
      m.rotation.y = Math.atan2(-this.post.outX, -this.post.outZ) + Math.PI / 2;
      m.position.y = s.y + Math.sin(t / 620 + s.id) * 0.012;
      m.rotation.z = Math.sin(t / 900 + s.id) * 0.05;
    });

    this._sync(raid.foes, this.foes, makeFoe, (m, f) => {
      m.position.set(f.x, f.y, f.z);
      m.rotation.y = Math.atan2(this.post.x - f.x, this.post.z - f.z);
      // 歩いているように上下させる(脚は作っていないので、跳ねで代える)
      m.position.y = f.y + Math.abs(Math.sin(t / 150 + f.id)) * 0.012;
    });

    this._sync(raid.arrows, this.arrows, makeArrow, (m, a) => {
      m.position.set(a.x, a.y, a.z);
      // 飛んでいる向きを向く。落ちるにつれて先が下を向く
      m.rotation.y = Math.atan2(a.vx, a.vz);
      m.rotation.x = -Math.atan2(a.vy, Math.hypot(a.vx, a.vz));
    });

    this._tickSplash(t);
  }

  // 当たった/降りたの合図(archery.js の events)
  onEvents(events) {
    for (const e of events) {
      if (e.type === 'sink') this._splash(e.x, this.post.y - 0.24, e.z, 0.30, 0x9fd4e8);
      if (e.type === 'down') this._splash(e.x, this.post.y, e.z, 0.14, 0xb84a3a);
    }
  }

  _splash(x, y, z, r, color) {
    const m = new THREE.Mesh(
      new THREE.SphereGeometry(r, 8, 6),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.7 }),
    );
    m.position.set(x, y, z);
    m.scale.setScalar(0.3);
    this.scene.add(m);
    this.splashes.push({ m, t: 0 });
  }

  _tickSplash(t) {
    const keep = [];
    for (const s of this.splashes) {
      s.t += 1 / 60;
      const k = s.t / 0.45;
      if (k >= 1) { s.m.removeFromParent(); dispose(s.m); continue; }
      s.m.scale.setScalar(0.3 + k * 1.1);
      s.m.material.opacity = 0.7 * (1 - k);
      keep.push(s);
    }
    this.splashes = keep;
  }

  // 進行の配列と、置いてあるメッシュを突き合わせる。
  // 増えたら作り、減ったら捨てる ── 毎フレーム作り直すと、船が瞬く。
  _sync(list, map, make, place) {
    const alive = new Set();
    for (const item of list) {
      alive.add(item.id);
      let m = map.get(item.id);
      if (!m) { m = make(item); this.scene.add(m); map.set(item.id, m); }
      place(m, item);
    }
    for (const [id, m] of map) {
      if (alive.has(id)) continue;
      m.removeFromParent();
      dispose(m);
      map.delete(id);
    }
  }

  // 撃つのをやめた。櫓は残して、船と蛮族と矢だけ片付ける
  reset() {
    for (const map of [this.ships, this.foes, this.arrows]) {
      for (const m of map.values()) { m.removeFromParent(); dispose(m); }
      map.clear();
    }
    for (const s of this.splashes) { s.m.removeFromParent(); dispose(s.m); }
    this.splashes = [];
  }

  dispose() {
    this.tower.removeFromParent();
    dispose(this.tower);
    this.range.removeFromParent();
    dispose(this.range);
    for (const map of [this.ships, this.foes, this.arrows]) {
      for (const m of map.values()) { m.removeFromParent(); dispose(m); }
      map.clear();
    }
    for (const s of this.splashes) { s.m.removeFromParent(); dispose(s.m); }
    this.splashes = [];
  }
}
