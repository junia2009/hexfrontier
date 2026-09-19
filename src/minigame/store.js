// 島の店(屋台)と、そこに立つ店番。
//
// **店は島の上に建てる。** 画面の上のアイコンから開く形にしていたが、
// 島に実体の無いものをボタンで開くと、何を見ているのか分からなくなる。
// 受付と同じで、歩いて行って、目の前の人に話しかけて買う。
//
// 売り物も購入も持たない(src/shop.js の純粋関数)。ここは見た目と、
// 店番が「いらっしゃい」と手を振るところだけ。
//
// 寸法は素の値で書いて、いちばん外の入れ物に縮尺を1回だけ掛ける
// (desk.js と同じ流儀)。ぶつかる大きさと近づける距離は ground.js。

import * as THREE from 'three';
import { WALK_SCALE, s as sc } from './scale.js';
import { makeSignFace } from './desk.js';
import { STORE_PROPS } from './ground.js';
import { makeWalker } from './body.js';
import { applyPose } from './walker.js';
import { speciesById } from './species.js';
import { emotePose, standPose } from './pose.js';

// 店番。**くま**にしてある ── 体が大きいので、屋台の陰に隠れず遠目にも
// 「誰か立っている」と分かる(species.js の id。並びではなく id で持つ)。
export const KEEPER_LOOK = 3;
export const KEEPER_COLOR = 0xc2703a;   // くまらしい飴色。屋台の木とも紛れない
export const KEEPER_NAME = '店主';
// 近づいてから手を振る長さ(秒)。ずっと振らせると挙動不審になる
export const WAVE_SEC = 2.2;

const TOP_Y = 0.20;        // カウンターの高さ
const HALF = 0.30;         // カウンターの横幅の半分
const DEPTH = 0.13;        // カウンターの奥行き
const POST_H = 0.62;       // 柱の高さ(屋根まで)
const KEEPER_BACK = 0.20;  // 店番はカウンターのこれだけ奥に立つ

// 日よけの縞。赤と生成りを交互に張って、遠目にも「店」と分かるようにする
const AWNING = [0xe25c3c, 0xf3e6cf];

export function makeStore(scene, x, z, groundY, facing = 0) {
  const g = new THREE.Group();
  g.position.set(x, groundY, z);
  g.rotation.y = facing;     // 局所座標の +z が店の正面(客の来る側)
  g.scale.setScalar(WALK_SCALE);

  const wood = new THREE.MeshStandardMaterial({ color: 0x8a5a32, roughness: 0.85 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x4a3a24, roughness: 0.8 });
  const board = new THREE.MeshStandardMaterial({ color: 0xf0dcb4, roughness: 0.9 });

  // カウンター(天板と前板)
  const top = new THREE.Mesh(new THREE.BoxGeometry(HALF * 2, 0.04, DEPTH), wood);
  top.position.set(0, TOP_Y, 0);
  top.castShadow = true;
  g.add(top);
  const front = new THREE.Mesh(new THREE.BoxGeometry(HALF * 2, TOP_Y, 0.02), dark);
  front.position.set(0, TOP_Y / 2, DEPTH / 2);
  g.add(front);

  // 柱4本と、上をつなぐ梁
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, POST_H, 6), wood);
      post.position.set(sx * (HALF - 0.02), POST_H / 2, sz * (DEPTH / 2));
      post.castShadow = true;
      g.add(post);
    }
  }
  const beam = new THREE.Mesh(new THREE.BoxGeometry(HALF * 2 + 0.04, 0.03, 0.03), wood);
  beam.position.set(0, POST_H, DEPTH / 2);
  g.add(beam);

  // 日よけ(手前へ傾けた縞の屋根)
  const awning = new THREE.Group();
  const slats = 6;
  for (let i = 0; i < slats; i += 1) {
    const w = (HALF * 2 + 0.08) / slats;
    const slat = new THREE.Mesh(
      new THREE.BoxGeometry(w, 0.02, 0.34),
      new THREE.MeshStandardMaterial({ color: AWNING[i % 2], roughness: 0.75 }),
    );
    slat.position.set(-HALF - 0.04 + w * (i + 0.5), 0, 0);
    slat.castShadow = true;
    awning.add(slat);
  }
  awning.position.set(0, POST_H + 0.02, DEPTH / 2 + 0.06);
  awning.rotation.x = -0.32;   // 手前が下がる
  g.add(awning);

  // 看板。受付と同じ作り方(canvas に焼く)で、両面から読める
  const faceMat = makeSignFace(['島の店', 'なんでも屋']);
  const sign = new THREE.Mesh(
    new THREE.BoxGeometry(0.30, 0.14, 0.015),
    [board, board, board, board, faceMat, faceMat],
  );
  sign.position.set(0, POST_H + 0.16, DEPTH / 2 + 0.02);
  sign.castShadow = true;
  g.add(sign);

  // 品物。カウンターの上に並べておく(何を売っているか、近づけば分かる)
  const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.007, 0.34, 5), dark);
  rod.position.set(-HALF + 0.06, TOP_Y + 0.15, -0.02);
  rod.rotation.z = 0.32;
  g.add(rod);
  const scroll = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.10, 8), board);
  scroll.position.set(0.02, TOP_Y + 0.04, 0.0);
  scroll.rotation.z = Math.PI / 2;
  g.add(scroll);

  // 旗。**いちばん高いところに**立てる ── 島は木や岩で見通しが悪く、
  // 屋台だけだと広場からでも「どこにあるか分からない」(受付と同じ理由で
  // desk.js も旗を上げている)。
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.52, 5), dark);
  mast.position.set(-HALF + 0.03, POST_H + 0.22, -DEPTH * 0.3);
  mast.castShadow = true;
  g.add(mast);
  const flag = new THREE.Mesh(
    new THREE.ConeGeometry(0.06, 0.13, 3),
    new THREE.MeshStandardMaterial({ color: AWNING[0], roughness: 0.7 }),
  );
  flag.rotation.z = -Math.PI / 2;
  flag.position.set(-HALF + 0.09, POST_H + 0.42, -DEPTH * 0.3);
  g.add(flag);

  // 看板を吊る紐。宙に浮いて見えないように、梁とつないでおく
  for (const sx of [-1, 1]) {
    const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.12, 4), dark);
    cord.position.set(sx * 0.10, POST_H + 0.09, DEPTH / 2 + 0.02);
    g.add(cord);
  }

  // 吊りランタン。**夜になると灯る**(店が開いているのが遠目に分かる)
  const lampMat = new THREE.MeshStandardMaterial({
    color: 0xffd98a, emissive: 0xffb347, emissiveIntensity: 0, roughness: 0.6,
  });
  const lamp = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.035, 0.07, 10), lampMat);
  lamp.position.set(HALF - 0.05, POST_H - 0.10, DEPTH / 2 + 0.01);
  g.add(lamp);

  // 樽と木箱(屋台の裏。人の立つところは空けておく)。
  // **置き場所は ground.js の STORE_PROPS**(ぶつかる判定と同じ表を読む)
  for (const o of STORE_PROPS) {
    const mesh = o.kind === 'barrel'
      ? new THREE.Mesh(new THREE.CylinderGeometry(o.r, o.r * 0.92, o.h, 10), dark)
      : new THREE.Mesh(new THREE.BoxGeometry(o.r * 1.6, o.h, o.r * 1.6), wood);
    mesh.position.set(o.x, o.h / 2, o.z);
    mesh.castShadow = true;
    g.add(mesh);
  }

  scene.add(g);

  // ---- 店番 ----
  //
  // 棒人間と同じ体・同じ姿勢を使う(body.js / pose.js)。**世界座標に置く**
  // ので、屋台の入れ物の子にはしない ── 入れ物には縮尺が掛かっていて、
  // 体にも同じ縮尺が掛かっているので、入れ子にすると二重に縮む。
  const sp = speciesById(KEEPER_LOOK);
  const keeper = makeWalker(KEEPER_COLOR, sp);
  scene.add(keeper.group);
  const kx = x + Math.sin(facing) * -sc(KEEPER_BACK);
  const kz = z + Math.cos(facing) * -sc(KEEPER_BACK);

  let waveT = 0;      // 手を振っている残り(秒)
  let wasNear = false;

  return {
    group: g,
    keeper: keeper.group,
    // near: 客が目の前にいるか。night: 夜の濃さ(0〜1)
    update(dt, t, { near = false, night = 0 } = {}) {
      if (near && !wasNear) waveT = WAVE_SEC;   // 寄ってきたら「いらっしゃい」
      wasNear = near;
      waveT = Math.max(0, waveT - dt);
      // 客に向き直る(正面を向いたまま。屋台から出ては行かない)
      const face = facing;
      const pose = waveT > 0
        ? emotePose('wave', t, face, Math.min(1, waveT / 0.3))
        : standPose(face);
      // 息づかい。止まった人形に見えないよう、ごくわずかに上下させる
      const bob = Math.sin(t * 1.5) * sc(0.004);
      applyPose(keeper, pose, kx, groundY + bob, kz);
      lampMat.emissiveIntensity = night * 1.4;
    },
    dispose() {
      for (const root of [g, keeper.group]) {
        root.removeFromParent();
        root.traverse((o) => {
          o.geometry?.dispose?.();
          if (o.material) {
            (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m.dispose?.());
          }
        });
      }
    },
  };
}
