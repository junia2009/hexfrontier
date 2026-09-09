// 丸太乗りの見た目。でっかい丸太を1本、海に半分沈めて浮かべる。
//
// 当たり判定は logroll.js が持っていて、ここは**それを映すだけ**。
// 「見えている切れ目」と「抜ける切れ目」がずれると、何もないところで
// 落ちることになるので、角の合わせかたはここのコメントに残す。
//
// 組み立て(親から順に):
//   root  … 丸太の場所へ移し、丸太の向きへ回す
//   tilt  … X を +90° 回して、円柱の軸(THREE では Y)を丸太の Z へ倒す
//   spin  … その軸まわりに回す。これが「丸太が転がる」
//
// **root の回転は -anchor.angle。符号を落としやすいので理由を書いておく。**
//   THREE の rotation.y は行列が [cosθ, sinθ; -sinθ, cosθ] で、
//   logroll.js の toWorld が使う [cosθ, -sinθ; sinθ, cosθ] と**逆向き**。
//   +anchor.angle のままだと、丸太の中心は合うのに長さ方向だけ逆へ開く。
//   -anchor.angle にすると root の座標系が logroll.js の local と一致する
//   (root の +x → 局所 +x、+z → 局所 +z、+y → 上)。
//
// 角の合わせかた:
//   THREE の CylinderGeometry は角 θ の点が (r sinθ, y, r cosθ)。
//   tilt で +Z が下を向くので、root では (r sinθ, -r cosθ, y) ──
//   局所 x = r sinθ、高さ = -r cosθ。
//   logroll.js の角 a は x = R sin a、高さ = +R cos a なので **θ = π - a**。
//   spin.rotation.y = φ は θ を φ だけ進めるので、丸太自身の角 a0 の点を
//   時刻 t に a0 + turn へ持っていくには φ = -turn。

import * as THREE from 'three';
import {
  DRUM_AXIS, DRUM_LEN, DRUM_R, HOLE_ARC, toWorld, turnOf,
} from './logroll.js';

// 当たり判定より気持ち太く見せる ── 細いと、乗っているのに落ちそうに見えて、
// 実際の判定より厳しく感じる。
const DRAW_R = DRUM_R * 1.01;

// **面で回転を見せる。** のっぺり滑らかな円柱は、回しても輪郭が変わらない
// ので止まって見える ── 「どちらへどれだけ流れているか」を目で読んで足を
// 出す遊びなのに、回っているのが画面に出ない。
//
// はじめは木肌の筋を別のメッシュで貼っていたが、筋は切れ目の上も通るので
// **開いた穴の上に板が浮く**ことになった(判定と食い違う点として実測で
// 出た)。切れ目ごとに筋を切ると 100 枚を超えるメッシュになる。
// 分割を粗くして平面シェーディングにすれば、面の明るさが回転で移り変わって
// 同じことが**1枚も足さずに**できる ── 島と同じローポリの見た目にも合う。
const RADIAL = 24;          // 円周の分割。粗いほど面がはっきり出る

const BARK = 0x6b4423;      // 木肌
const WOOD = 0x9a6a3c;      // 木口(切り口)

// 角 a の弧を描く円柱を1つ作る(a1 < a2)。θ = π - a なので向きは逆になる
function arcGeo(a1, a2, len) {
  return new THREE.CylinderGeometry(
    DRAW_R, DRAW_R, len,
    Math.max(3, Math.round((RADIAL * (a2 - a1)) / (Math.PI * 2))),
    1, false, Math.PI - a2, a2 - a1,
  );
}

// 丸太を海に浮かべる。course / anchor は logroll.js のもの。
export function makeDrum(scene, course, anchor) {
  const group = new THREE.Group();
  const bark = new THREE.MeshStandardMaterial({
    color: BARK, roughness: 0.95, flatShading: true,
  });
  const wood = new THREE.MeshStandardMaterial({ color: WOOD, roughness: 0.85 });
  const geos = [];

  const root = new THREE.Group();
  const w = toWorld(anchor, 0, 0);
  root.position.set(w.x, DRUM_AXIS, w.z);
  root.rotation.y = -anchor.angle;   // 上のコメント参照(THREE は逆回り)
  const tilt = new THREE.Group();
  tilt.rotation.x = Math.PI / 2;
  const spin = new THREE.Group();
  tilt.add(spin);
  root.add(tilt);
  group.add(root);

  // 長さ方向を、切れ目のふちで区切る。区間ごとに「その区間で抜けている角」が
  // 決まるので、残っている角の弧だけを筒として描く。
  const edges = new Set([-DRUM_LEN / 2, DRUM_LEN / 2]);
  for (const h of course.holes) {
    edges.add(Math.max(-DRUM_LEN / 2, Math.min(DRUM_LEN / 2, h.z0)));
    edges.add(Math.max(-DRUM_LEN / 2, Math.min(DRUM_LEN / 2, h.z1)));
  }
  const cuts = [...edges].sort((a, b) => a - b);

  for (let i = 0; i + 1 < cuts.length; i++) {
    const z0 = cuts[i];
    const z1 = cuts[i + 1];
    const len = z1 - z0;
    if (len <= 1e-6) continue;
    const mid = (z0 + z1) / 2;
    // この区間で抜けている切れ目。makeCourse が角を離して置いているので
    // 重なることはなく、残りは切れ目と切れ目のあいだの弧になる
    const act = course.holes
      .filter((h) => mid > h.z0 && mid < h.z1)
      .map((h) => h.a)
      .sort((a, b) => a - b);
    const arcs = [];
    if (act.length === 0) {
      arcs.push([0, Math.PI * 2]);
    } else {
      for (let k = 0; k < act.length; k++) {
        const from = act[k] + HOLE_ARC / 2;
        const to = (k + 1 < act.length ? act[k + 1] : act[0] + Math.PI * 2) - HOLE_ARC / 2;
        if (to > from + 1e-4) arcs.push([from, to]);
      }
    }
    for (const [a1, a2] of arcs) {
      const geo = arcGeo(a1, a2, len);
      geos.push(geo);
      const mesh = new THREE.Mesh(geo, bark);
      // 円柱は自分の中心が原点。長さ方向(いまは Y)へずらして並べる
      mesh.position.y = mid;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      spin.add(mesh);
    }
  }

  // 木口。両端に丸を貼ると「筒」がひと目で分かる
  for (const end of [-1, 1]) {
    const geo = new THREE.CircleGeometry(DRAW_R, RADIAL);
    geos.push(geo);
    const m = new THREE.Mesh(geo, wood);
    m.position.y = (DRUM_LEN / 2) * end;
    m.rotation.x = end > 0 ? -Math.PI / 2 : Math.PI / 2;
    spin.add(m);
  }

  scene.add(group);
  return {
    group,
    // t は丸太が回りはじめてからの秒数(logroll.js の rollTime)。
    // **判定と同じ t を渡すこと** ── 別々に数えると、見えている切れ目と
    // 抜ける切れ目がずれて、何もないところで落ちる。
    setTime(t) { spin.rotation.y = -turnOf(course, t); },
    dispose() {
      group.removeFromParent();
      for (const g of geos) g.dispose();
      bark.dispose();
      wood.dispose();
    },
  };
}
