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

const BUILD = { bench, lamp, flag, planter, shroom, fire, well, statue, koi, torii };

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
