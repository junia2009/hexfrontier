// 島の飾りの見た目。**置き場所と値段は decor.js**(THREE を使わない表)で、
// ここはそれをメッシュにするだけ ── hats.js と body.js の関係と同じ。
//
// 寸法は decor.js の r(太さ)と h(高さ)に合わせる。合わせないと、
// 見えている大きさとぶつかる大きさが食い違って「触っていないのに止まる」。

import * as THREE from 'three';
import { DECOR_BY_ID } from './decor.js';

const WOOD = 0x8a5a32;
const DARK = 0x4a3a24;
const STONE = 0x9aa0a6;

function bench(d) {
  const g = new THREE.Group();
  const wood = new THREE.MeshStandardMaterial({ color: WOOD, roughness: 0.85 });
  const dark = new THREE.MeshStandardMaterial({ color: DARK, roughness: 0.8 });
  const w = d.r * 2;
  const seat = new THREE.Mesh(new THREE.BoxGeometry(w, d.h * 0.12, d.r * 0.8), wood);
  seat.position.y = d.h * 0.5;
  seat.castShadow = true;
  seat.receiveShadow = true;
  g.add(seat);
  // 背もたれ。**後ろに倒す** ── 垂直だと板が1枚立っているだけに見える
  const back = new THREE.Mesh(new THREE.BoxGeometry(w, d.h * 0.42, d.h * 0.07), wood);
  back.position.set(0, d.h * 0.76, -d.r * 0.34);
  back.rotation.x = 0.16;
  back.castShadow = true;
  g.add(back);
  for (const sx of [-1, 1]) {
    const leg = new THREE.Mesh(
      new THREE.BoxGeometry(d.h * 0.09, d.h * 0.5, d.h * 0.09), dark,
    );
    leg.position.set(sx * (d.r - d.h * 0.1), d.h * 0.25, 0);
    leg.castShadow = true;
    g.add(leg);
  }
  return { group: g, lamp: null };
}

function lamp(d) {
  const g = new THREE.Group();
  const stone = new THREE.MeshStandardMaterial({ color: STONE, roughness: 0.95 });
  const base = new THREE.Mesh(
    new THREE.CylinderGeometry(d.r * 0.9, d.r * 1.05, d.h * 0.12, 8), stone,
  );
  base.position.y = d.h * 0.06;
  base.receiveShadow = true;
  g.add(base);
  const post = new THREE.Mesh(
    new THREE.CylinderGeometry(d.r * 0.34, d.r * 0.4, d.h * 0.5, 8), stone,
  );
  post.position.y = d.h * 0.37;
  post.castShadow = true;
  g.add(post);
  // 火袋。夜はここが光る
  const box = new THREE.Mesh(
    new THREE.CylinderGeometry(d.r * 0.72, d.r * 0.72, d.h * 0.22, 6),
    new THREE.MeshStandardMaterial({ color: 0xffe9b0, roughness: 0.6, emissive: 0x000000 }),
  );
  box.position.y = d.h * 0.73;
  g.add(box);
  const roof = new THREE.Mesh(new THREE.ConeGeometry(d.r * 1.05, d.h * 0.2, 6), stone);
  roof.position.y = d.h * 0.93;
  roof.castShadow = true;
  g.add(roof);
  return { group: g, lamp: box.material };
}

function flag(d) {
  const g = new THREE.Group();
  const dark = new THREE.MeshStandardMaterial({ color: DARK, roughness: 0.8 });
  const cloth = new THREE.MeshStandardMaterial({
    color: 0xe2604a, roughness: 0.8, side: THREE.DoubleSide,
  });
  const pole = new THREE.Mesh(
    new THREE.CylinderGeometry(d.r * 0.25, d.r * 0.3, d.h, 7), dark,
  );
  pole.position.y = d.h / 2;
  pole.castShadow = true;
  g.add(pole);
  // 旗。棒の片側にだけ張る
  const cloth1 = new THREE.Mesh(new THREE.PlaneGeometry(d.h * 0.34, d.h * 0.22), cloth);
  cloth1.position.set(d.h * 0.17, d.h * 0.85, 0);
  cloth1.castShadow = true;
  g.add(cloth1);
  return { group: g, lamp: null };
}

function planter(d) {
  const g = new THREE.Group();
  const wood = new THREE.MeshStandardMaterial({ color: WOOD, roughness: 0.9 });
  const soil = new THREE.MeshStandardMaterial({ color: 0x5a4330, roughness: 1 });
  const box = new THREE.Mesh(
    new THREE.BoxGeometry(d.r * 2, d.h * 0.7, d.r * 1.3), wood,
  );
  box.position.y = d.h * 0.35;
  box.castShadow = true;
  box.receiveShadow = true;
  g.add(box);
  const dirt = new THREE.Mesh(new THREE.BoxGeometry(d.r * 1.8, d.h * 0.1, d.r * 1.1), soil);
  dirt.position.y = d.h * 0.72;
  g.add(dirt);
  // 花。3本。色を変えて並べる
  const colors = [0xff9ec4, 0xffd97d, 0xb08ee8];
  for (let i = 0; i < 3; i += 1) {
    const stem = new THREE.Mesh(
      new THREE.CylinderGeometry(d.h * 0.03, d.h * 0.03, d.h * 0.38, 5),
      new THREE.MeshStandardMaterial({ color: 0x6fae5a, roughness: 0.9 }),
    );
    const x = (i - 1) * d.r * 0.62;
    stem.position.set(x, d.h * 0.92, 0);
    g.add(stem);
    const head = new THREE.Mesh(
      new THREE.SphereGeometry(d.h * 0.16, 8, 6),
      new THREE.MeshStandardMaterial({ color: colors[i], roughness: 0.8 }),
    );
    head.scale.y = 0.72;
    head.position.set(x, d.h * 1.14, 0);
    head.castShadow = true;
    g.add(head);
  }
  return { group: g, lamp: null };
}

// ---- あとで足したもの ----
//
// **見上げる目印・火のもの・動くもの**を混ぜてある(decor.js の下半分)。
// どれも「地面から h の高さに収まる」ことだけ守れば、当たり判定と噛み合う。

// 大きなキノコ。低くて丸いので、並べても景色を塞がない
function shroom(d) {
  const g = new THREE.Group();
  const stalk = new THREE.Mesh(
    new THREE.CylinderGeometry(d.r * 0.3, d.r * 0.42, d.h * 0.6, 8),
    new THREE.MeshStandardMaterial({ color: 0xf0e4d0, roughness: 0.95 }),
  );
  stalk.position.y = d.h * 0.3;
  stalk.castShadow = true;
  g.add(stalk);
  // かさ。**半球を潰す** ── 円錐だと三角の帽子に見えてキノコにならない
  const cap = new THREE.Mesh(
    new THREE.SphereGeometry(d.r, 12, 7, 0, Math.PI * 2, 0, Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: 0xd6503f, roughness: 0.8 }),
  );
  cap.scale.y = 0.68;
  cap.position.y = d.h * 0.58;
  cap.castShadow = true;
  g.add(cap);
  // 白い斑点。かさの上に散らす
  const dot = new THREE.MeshStandardMaterial({ color: 0xfdf4e6, roughness: 0.9 });
  for (const [a, t] of [[0.4, 0.45], [2.3, 0.62], [4.3, 0.5], [5.6, 0.72]]) {
    const s = new THREE.Mesh(new THREE.SphereGeometry(d.r * 0.15, 7, 5), dot);
    const rr = d.r * t;
    s.position.set(Math.cos(a) * rr, d.h * 0.58 + Math.sqrt(Math.max(0, 1 - t * t)) * d.r * 0.66, Math.sin(a) * rr);
    s.scale.y = 0.5;
    g.add(s);
  }
  return { group: g, lamp: null };
}

// たき火。**夜だけ燃える** ── 昼は消し炭と石だけが残る。
// 炎は揺らす(揺れがないと、赤い三角が刺さっているだけに見える)
function fire(d) {
  const g = new THREE.Group();
  const stone = new THREE.MeshStandardMaterial({ color: 0x8b8f95, roughness: 1 });
  const dark = new THREE.MeshStandardMaterial({ color: DARK, roughness: 0.9 });
  // 囲みの石。輪に並べる
  for (let i = 0; i < 7; i += 1) {
    const a = (i / 7) * Math.PI * 2;
    const s = new THREE.Mesh(new THREE.SphereGeometry(d.r * 0.22, 6, 5), stone);
    s.position.set(Math.cos(a) * d.r * 0.85, d.h * 0.1, Math.sin(a) * d.r * 0.85);
    s.scale.y = 0.72;
    s.castShadow = true;
    g.add(s);
  }
  // 組んだ薪。2本を交差させる
  for (const sx of [-1, 1]) {
    const log = new THREE.Mesh(
      new THREE.CylinderGeometry(d.r * 0.11, d.r * 0.11, d.r * 1.5, 6), dark,
    );
    log.rotation.set(0, sx * 0.9, Math.PI / 2 - 0.28 * sx);
    log.position.y = d.h * 0.2;
    log.castShadow = true;
    g.add(log);
  }
  const flame = new THREE.Mesh(
    new THREE.ConeGeometry(d.r * 0.5, d.h * 0.9, 7),
    new THREE.MeshStandardMaterial({ color: 0xffb03a, roughness: 0.4, transparent: true }),
  );
  flame.position.y = d.h * 0.62;
  g.add(flame);
  return { group: g, lamp: flame.material, flame };
}

// 井戸。石積み + 屋根 + つるべ
function well(d) {
  const g = new THREE.Group();
  const stone = new THREE.MeshStandardMaterial({ color: STONE, roughness: 0.95 });
  const wood = new THREE.MeshStandardMaterial({ color: WOOD, roughness: 0.85 });
  const dark = new THREE.MeshStandardMaterial({ color: DARK, roughness: 0.85 });
  const ring = new THREE.Mesh(
    new THREE.CylinderGeometry(d.r, d.r * 1.05, d.h * 0.34, 12), stone,
  );
  ring.position.y = d.h * 0.17;
  ring.castShadow = true;
  ring.receiveShadow = true;
  g.add(ring);
  // 水面。**上から見たときに中が黒く見えるように**、少し沈めて置く
  const water = new THREE.Mesh(
    new THREE.CircleGeometry(d.r * 0.82, 12),
    new THREE.MeshStandardMaterial({ color: 0x1d3b52, roughness: 0.3 }),
  );
  water.rotation.x = -Math.PI / 2;
  water.position.y = d.h * 0.26;
  g.add(water);
  for (const sx of [-1, 1]) {
    const post = new THREE.Mesh(
      new THREE.BoxGeometry(d.r * 0.14, d.h * 0.42, d.r * 0.14), wood,
    );
    post.position.set(sx * d.r * 0.78, d.h * 0.55, 0);
    post.castShadow = true;
    g.add(post);
  }
  const roof = new THREE.Mesh(
    new THREE.ConeGeometry(d.r * 1.35, d.h * 0.26, 4), dark,
  );
  roof.rotation.y = Math.PI / 4;
  roof.position.y = d.h * 0.88;
  roof.castShadow = true;
  g.add(roof);
  // つるべ。屋根から吊るす
  const bucket = new THREE.Mesh(
    new THREE.CylinderGeometry(d.r * 0.2, d.r * 0.16, d.h * 0.16, 8), wood,
  );
  bucket.position.y = d.h * 0.52;
  g.add(bucket);
  return { group: g, lamp: null };
}

// 石像。island の古い顔。**正面を向かせる**ので facing が効く
function statue(d) {
  const g = new THREE.Group();
  const stone = new THREE.MeshStandardMaterial({ color: 0x8d8579, roughness: 1 });
  const dim = new THREE.MeshStandardMaterial({ color: 0x5d564d, roughness: 1 });
  const base = new THREE.Mesh(
    new THREE.BoxGeometry(d.r * 2, d.h * 0.12, d.r * 1.7), dim,
  );
  base.position.y = d.h * 0.06;
  base.receiveShadow = true;
  g.add(base);
  // 胴。上へ少し細くする(切り出した石らしく、角は残す)
  const body = new THREE.Mesh(
    new THREE.CylinderGeometry(d.r * 0.7, d.r * 0.9, d.h * 0.52, 6), stone,
  );
  body.position.y = d.h * 0.38;
  body.castShadow = true;
  g.add(body);
  const head = new THREE.Mesh(
    new THREE.BoxGeometry(d.r * 1.3, d.h * 0.3, d.r * 1.1), stone,
  );
  head.position.y = d.h * 0.8;
  head.castShadow = true;
  g.add(head);
  // 目と口。くぼみを暗い板で出す(彫るより軽い)
  for (const sx of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.BoxGeometry(d.r * 0.26, d.h * 0.06, d.r * 0.06), dim);
    eye.position.set(sx * d.r * 0.32, d.h * 0.85, d.r * 0.55);
    g.add(eye);
  }
  const mouth = new THREE.Mesh(new THREE.BoxGeometry(d.r * 0.5, d.h * 0.04, d.r * 0.06), dim);
  mouth.position.set(0, d.h * 0.73, d.r * 0.55);
  g.add(mouth);
  return { group: g, lamp: null };
}

// こいのぼり。竿に吹き流しを3つ。**なびく**(update で揺らす)
function koi(d) {
  const g = new THREE.Group();
  const dark = new THREE.MeshStandardMaterial({ color: DARK, roughness: 0.85 });
  const pole = new THREE.Mesh(
    new THREE.CylinderGeometry(d.r * 0.3, d.r * 0.38, d.h, 7), dark,
  );
  pole.position.y = d.h / 2;
  pole.castShadow = true;
  g.add(pole);
  const colors = [0x2b4f7d, 0xd8483c, 0x4fa36a];
  const fish = [];
  for (let i = 0; i < colors.length; i += 1) {
    // 吹き流し1つ。**筒にする** ── 板だと真横から見たときに消える
    const body = new THREE.Mesh(
      new THREE.CylinderGeometry(d.h * 0.075, d.h * 0.035, d.h * 0.3, 8, 1, true),
      new THREE.MeshStandardMaterial({
        color: colors[i], roughness: 0.85, side: THREE.DoubleSide,
      }),
    );
    // 筒を横に倒して、竿から水平に伸ばす
    body.rotation.z = -Math.PI / 2;
    body.position.set(d.h * 0.17, 0, 0);
    const arm = new THREE.Group();
    arm.add(body);
    arm.position.y = d.h * (0.9 - i * 0.2);
    arm.castShadow = true;
    g.add(arm);
    fish.push(arm);
  }
  return { group: g, lamp: null, fish };
}

// 鳥居。島でいちばん高い目印
function torii(d) {
  const g = new THREE.Group();
  const paint = new THREE.MeshStandardMaterial({ color: 0xc4432f, roughness: 0.8 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x2c211c, roughness: 0.85 });
  const span = d.r * 1.7;          // 柱の間隔(当たり半径に収まる幅にする)
  for (const sx of [-1, 1]) {
    const post = new THREE.Mesh(
      new THREE.CylinderGeometry(d.r * 0.16, d.r * 0.2, d.h * 0.88, 8), paint,
    );
    post.position.set(sx * span * 0.5, d.h * 0.44, 0);
    post.castShadow = true;
    g.add(post);
  }
  // 笠木(いちばん上の横木)。**反らせる**代わりに、端を少し垂らした形にする
  const top = new THREE.Mesh(
    new THREE.BoxGeometry(span * 1.45, d.h * 0.07, d.r * 0.42), dark,
  );
  top.position.y = d.h * 0.94;
  top.castShadow = true;
  g.add(top);
  for (const sx of [-1, 1]) {
    const tip = new THREE.Mesh(
      new THREE.BoxGeometry(span * 0.16, d.h * 0.06, d.r * 0.42), dark,
    );
    tip.position.set(sx * span * 0.69, d.h * 0.905, 0);
    tip.rotation.z = sx * 0.22;
    g.add(tip);
  }
  // 貫(ひとつ下の横木)
  const beam = new THREE.Mesh(
    new THREE.BoxGeometry(span * 1.12, d.h * 0.05, d.r * 0.3), paint,
  );
  beam.position.y = d.h * 0.74;
  beam.castShadow = true;
  g.add(beam);
  // 額束(2本の横木をつなぐ短い柱)
  const tie = new THREE.Mesh(
    new THREE.BoxGeometry(d.r * 0.2, d.h * 0.14, d.r * 0.22), dark,
  );
  tie.position.y = d.h * 0.845;
  g.add(tie);
  return { group: g, lamp: null };
}

// 貝がら。**ごく小さい** ── 道ばたや浜に散らすためのもの。
//
// **島には灰色の石が転がっている。** はじめ半球をクリーム色で潰して
// 置いたら、遠目にはその石と見分けが付かなかった(実測の絵で気づいた)。
// 桃色にして、**筋の入った扇**にする ── 形と色の両方で石と違えておく。
function shell(d) {
  const g = new THREE.Group();
  const pale = new THREE.MeshStandardMaterial({ color: 0xffd3c8, roughness: 0.45 });
  const deep = new THREE.MeshStandardMaterial({ color: 0xe79a88, roughness: 0.55 });
  // 扇。細い板を蝶番から放射に並べる(交互に色を変えて筋にする)
  const n = 7;
  for (let i = 0; i < n; i += 1) {
    const a = -0.62 + (1.24 * i) / (n - 1);
    const w = new THREE.Mesh(
      new THREE.BoxGeometry(d.r * 0.3, d.h * 0.42, d.r * 1.5), i % 2 ? deep : pale,
    );
    w.position.set(Math.sin(a) * d.r * 0.52, d.h * 0.32, Math.cos(a) * d.r * 0.6);
    w.rotation.set(-0.2, a, 0);
    w.castShadow = true;
    g.add(w);
  }
  // 蝶番(扇の要)
  const hinge = new THREE.Mesh(new THREE.SphereGeometry(d.r * 0.34, 8, 6), deep);
  hinge.scale.set(1, 0.55, 0.7);
  hinge.position.y = d.h * 0.26;
  hinge.castShadow = true;
  g.add(hinge);
  return { group: g, lamp: null };
}

// 丸太の柵。**幅のある、ただ1つの飾り** ── 並べて道や庭を囲うためのもの
function fence(d) {
  const g = new THREE.Group();
  const wood = new THREE.MeshStandardMaterial({ color: WOOD, roughness: 0.9 });
  const dark = new THREE.MeshStandardMaterial({ color: DARK, roughness: 0.9 });
  const w = d.r * 2;
  for (const sx of [-1, 0, 1]) {
    const post = new THREE.Mesh(
      new THREE.CylinderGeometry(d.h * 0.09, d.h * 0.1, d.h, 6), dark,
    );
    post.position.set(sx * d.r * 0.88, d.h * 0.5, 0);
    post.castShadow = true;
    g.add(post);
  }
  // 横木2本。**丸太らしく、少しだけ傾ける**(水平に揃えると板塀に見える)
  for (const [y, tilt] of [[0.72, 0.012], [0.38, -0.01]]) {
    const rail = new THREE.Mesh(
      new THREE.CylinderGeometry(d.h * 0.075, d.h * 0.075, w * 0.98, 6), wood,
    );
    rail.rotation.z = Math.PI / 2 + tilt;
    rail.position.y = d.h * y;
    rail.castShadow = true;
    g.add(rail);
  }
  return { group: g, lamp: null };
}

// 錨。浜に立てかける
function anchor(d) {
  const g = new THREE.Group();
  const iron = new THREE.MeshStandardMaterial({ color: 0x5c6167, roughness: 0.55, metalness: 0.45 });
  const rust = new THREE.MeshStandardMaterial({ color: 0x7a5a42, roughness: 0.9 });
  // 全体を少し倒して「立てかけてある」形にする
  const lean = new THREE.Group();
  lean.rotation.x = 0.22;
  g.add(lean);
  const shank = new THREE.Mesh(
    new THREE.CylinderGeometry(d.r * 0.1, d.r * 0.1, d.h * 0.92, 8), iron,
  );
  shank.position.y = d.h * 0.46;
  shank.castShadow = true;
  lean.add(shank);
  // 腕。**下から外へ出て、跳ね上がって爪になる** ── これが無いと、
  // ただの十字に足が生えた道しるべに見えた(実測の絵で直した)。
  // 棒を X 方向に置いて Z まわりに回すと、外側の端が持ち上がる
  for (const sx of [-1, 1]) {
    const a1 = new THREE.Mesh(new THREE.BoxGeometry(d.r * 0.8, d.r * 0.13, d.r * 0.13), iron);
    a1.position.set(sx * d.r * 0.34, d.h * 0.05, 0);
    a1.rotation.z = sx * 0.32;
    a1.castShadow = true;
    lean.add(a1);
    const a2 = new THREE.Mesh(new THREE.BoxGeometry(d.r * 0.6, d.r * 0.13, d.r * 0.13), iron);
    a2.position.set(sx * d.r * 0.82, d.h * 0.16, 0);
    a2.rotation.z = sx * 0.95;
    a2.castShadow = true;
    lean.add(a2);
    // 爪。先を尖らせる(ここがあると一目で錨になる)
    const fluke = new THREE.Mesh(new THREE.ConeGeometry(d.r * 0.24, d.r * 0.46, 4), iron);
    fluke.position.set(sx * d.r * 1.0, d.h * 0.3, 0);
    fluke.rotation.z = sx * 0.55;
    fluke.castShadow = true;
    lean.add(fluke);
  }
  // 横木(ストック)と、上の輪
  const stock = new THREE.Mesh(
    new THREE.CylinderGeometry(d.r * 0.07, d.r * 0.07, d.r * 1.8, 6), rust,
  );
  stock.rotation.z = Math.PI / 2;
  stock.position.y = d.h * 0.78;
  lean.add(stock);
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(d.r * 0.2, d.r * 0.055, 6, 10), iron,
  );
  ring.position.y = d.h * 0.95;
  lean.add(ring);
  return { group: g, lamp: null };
}

// 桜の木。**島の緑のなかで、ここだけ色が変わる**
function sakura(d) {
  const g = new THREE.Group();
  const bark = new THREE.MeshStandardMaterial({ color: 0x6b4a3a, roughness: 0.95 });
  const bloom = new THREE.MeshStandardMaterial({ color: 0xf3a9c4, roughness: 0.85 });
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(d.r * 0.16, d.r * 0.26, d.h * 0.5, 7), bark,
  );
  trunk.position.y = d.h * 0.25;
  trunk.castShadow = true;
  g.add(trunk);
  // 枝。3本、外へ伸ばす
  for (let i = 0; i < 3; i += 1) {
    const a = (i / 3) * Math.PI * 2 + 0.4;
    const br = new THREE.Mesh(
      new THREE.CylinderGeometry(d.r * 0.07, d.r * 0.1, d.h * 0.3, 5), bark,
    );
    br.position.set(Math.cos(a) * d.r * 0.3, d.h * 0.55, Math.sin(a) * d.r * 0.3);
    br.rotation.set(Math.sin(a) * 0.5, 0, -Math.cos(a) * 0.5);
    g.add(br);
  }
  // 花の塊。**球をいくつか寄せる** ── 1つの球だと風船に見える
  for (const [dx, dy, dz, s] of [
    [0, 0.82, 0, 1], [0.52, 0.72, 0.1, 0.72], [-0.48, 0.74, -0.12, 0.7],
    [0.1, 0.72, -0.5, 0.66], [-0.12, 0.7, 0.48, 0.64],
  ]) {
    const ball = new THREE.Mesh(new THREE.SphereGeometry(d.r * 0.62 * s, 9, 7), bloom);
    ball.scale.y = 0.78;
    ball.position.set(dx * d.r, d.h * dy, dz * d.r);
    ball.castShadow = true;
    g.add(ball);
  }
  return { group: g, lamp: null };
}

// 風車。**羽根が回る** ── 遠くからでも動いているのが分かる
function mill(d) {
  const g = new THREE.Group();
  const wall = new THREE.MeshStandardMaterial({ color: 0xe6dcc8, roughness: 0.95 });
  const wood = new THREE.MeshStandardMaterial({ color: WOOD, roughness: 0.85 });
  const dark = new THREE.MeshStandardMaterial({ color: DARK, roughness: 0.85 });
  const tower = new THREE.Mesh(
    new THREE.CylinderGeometry(d.r * 0.55, d.r * 0.85, d.h * 0.66, 8), wall,
  );
  tower.position.y = d.h * 0.33;
  tower.castShadow = true;
  tower.receiveShadow = true;
  g.add(tower);
  const roof = new THREE.Mesh(new THREE.ConeGeometry(d.r * 0.68, d.h * 0.2, 8), dark);
  roof.position.y = d.h * 0.76;
  roof.castShadow = true;
  g.add(roof);
  // 羽根。**車軸を前に出す**(胴に埋めると、回っても壁に隠れる)
  const hub = new THREE.Group();
  hub.position.set(0, d.h * 0.68, d.r * 0.62);
  g.add(hub);
  const axle = new THREE.Mesh(
    new THREE.CylinderGeometry(d.r * 0.07, d.r * 0.07, d.r * 0.3, 6), dark,
  );
  axle.rotation.x = Math.PI / 2;
  hub.add(axle);
  for (let i = 0; i < 4; i += 1) {
    const arm = new THREE.Group();
    arm.rotation.z = (i / 4) * Math.PI * 2;
    const bar = new THREE.Mesh(
      new THREE.BoxGeometry(d.r * 0.08, d.h * 0.46, d.r * 0.06), wood,
    );
    bar.position.y = d.h * 0.23;
    bar.castShadow = true;
    arm.add(bar);
    const sail = new THREE.Mesh(
      new THREE.BoxGeometry(d.r * 0.3, d.h * 0.3, d.r * 0.03),
      new THREE.MeshStandardMaterial({ color: 0xf5f1e6, roughness: 0.9 }),
    );
    sail.position.set(d.r * 0.2, d.h * 0.3, 0);
    sail.castShadow = true;
    arm.add(sail);
    hub.add(arm);
  }
  return { group: g, lamp: null, hub };
}

// 灯台。**島でいちばん高い。夜は明かりが回る**
function beacon(d) {
  const g = new THREE.Group();
  const white = new THREE.MeshStandardMaterial({ color: 0xf2f0ea, roughness: 0.9 });
  const red = new THREE.MeshStandardMaterial({ color: 0xc4432f, roughness: 0.85 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x33383d, roughness: 0.8 });
  // 胴。**紅白の縞にする** ── 昼でも灯台だと分かる
  const bands = 5;
  for (let i = 0; i < bands; i += 1) {
    const y0 = (i / bands) * d.h * 0.72;
    const r0 = d.r * (0.85 - 0.3 * (i / bands));
    const r1 = d.r * (0.85 - 0.3 * ((i + 1) / bands));
    const seg = new THREE.Mesh(
      new THREE.CylinderGeometry(r1, r0, d.h * 0.72 / bands, 10),
      i % 2 ? red : white,
    );
    seg.position.y = y0 + d.h * 0.36 / bands;
    seg.castShadow = true;
    g.add(seg);
  }
  // 手すりのある踊り場
  const deck = new THREE.Mesh(
    new THREE.CylinderGeometry(d.r * 0.72, d.r * 0.72, d.h * 0.035, 10), dark,
  );
  deck.position.y = d.h * 0.74;
  deck.castShadow = true;
  g.add(deck);
  // 灯室。**回る明かりはこの中**(夜だけ光る)
  const glassMat = new THREE.MeshStandardMaterial({
    color: 0x9fb6c4, roughness: 0.25, transparent: true, opacity: 0.55,
  });
  const glass = new THREE.Mesh(
    new THREE.CylinderGeometry(d.r * 0.5, d.r * 0.5, d.h * 0.14, 10), glassMat,
  );
  glass.position.y = d.h * 0.83;
  g.add(glass);
  const spin = new THREE.Group();
  spin.position.y = d.h * 0.83;
  g.add(spin);
  const lampMat = new THREE.MeshStandardMaterial({
    color: 0xfff0c4, roughness: 0.4, emissive: 0x000000,
  });
  // 板を1枚だけ。**回ると、こちらを向いたときだけ強く光る**
  const panel = new THREE.Mesh(
    new THREE.BoxGeometry(d.r * 0.72, d.h * 0.1, d.r * 0.18), lampMat,
  );
  spin.add(panel);
  const cap = new THREE.Mesh(new THREE.ConeGeometry(d.r * 0.6, d.h * 0.12, 10), red);
  cap.position.y = d.h * 0.95;
  cap.castShadow = true;
  g.add(cap);
  return { group: g, lamp: lampMat, spin };
}

const BUILD = {
  bench, lamp, flag, planter, shroom, fire, well, statue, koi, torii,
  shell, fence, anchor, sakura, mill, beacon,
};

// 1つぶん。x/z は盤の座標、groundY はその場所の地面の高さ。
export function makeDecor(scene, spec, groundY) {
  const d = DECOR_BY_ID[spec?.id];
  if (!d) return null;
  const made = BUILD[d.id](d);
  const g = made.group;
  g.position.set(spec.x, groundY, spec.z);
  g.rotation.y = spec.facing ?? 0;
  scene.add(g);
  return {
    group: g,
    // night は 0〜1(いま夜か)、t は経過秒。
    //
    // **動くものは時計が要る。** はじめ night しか渡していなかったので、
    // こいのぼりは竿に刺さったまま、たき火は赤い三角が立っているだけだった。
    update(night = 0, t = 0) {
      if (made.lamp) {
        made.lamp.emissive.setHex(0xffca63);
        made.lamp.emissiveIntensity = night;
      }
      // たき火。**昼は消えている** ── 炎だけ消して、石と薪は残す
      if (made.flame) {
        made.flame.visible = night > 0.04;
        if (made.flame.visible) {
          // 揺らぎ。周期の違う2つを足して、同じ形の繰り返しに見せない
          const w = 1 + Math.sin(t * 7.3) * 0.12 + Math.sin(t * 11.7) * 0.06;
          made.flame.scale.set(1, w, 1);
          made.flame.rotation.z = Math.sin(t * 5.1) * 0.09;
          made.flame.material.opacity = 0.7 + 0.3 * night;
        }
      }
      // こいのぼり。**竿を軸に振る** ── 1匹ずつ位相をずらすと、
      // 上から順に風が抜けていくように見える
      if (made.fish) {
        for (let i = 0; i < made.fish.length; i += 1) {
          made.fish[i].rotation.y = Math.sin(t * 1.6 + i * 0.7) * 0.42;
        }
      }
      // 風車。**ゆっくり回す** ── 速いとおもちゃの羽根に見える。
      // 風が強くなったり弱くなったりするぶんを、ゆらぎで足す
      if (made.hub) made.hub.rotation.z = t * 0.9 + Math.sin(t * 0.37) * 0.35;
      // 灯台。明かりが回る。**板が1枚なので、こちらを向いたときだけ強く光る**
      if (made.spin) made.spin.rotation.y = t * 1.15;
    },
    dispose() {
      g.removeFromParent();
      g.traverse((o) => {
        o.geometry?.dispose?.();
        const m = o.material;
        if (m) (Array.isArray(m) ? m : [m]).forEach((q) => q.dispose?.());
      });
    },
  };
}
