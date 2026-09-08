// 丸太乗りの見た目。回る丸太の筏を海に浮かべる。
//
// 当たり判定は logroll.js が持っていて、ここは**それを映すだけ**。
// 「見えている切れ目」と「抜ける切れ目」がずれると、何もないところで
// 落ちることになるので、位相の合わせかたはここのコメントに残す。
//
// 丸太の向きの作りかた(親から順に):
//   root  … 筏の場所へ移し、筏の向き(anchor.angle)へ回す
//   tilt  … X を +90° 回して、円柱の軸(THREE では Y)を筏の Z へ倒す
//   spin  … その軸まわりに回す。これが「丸太が転がる」
//
// **root の回転は -anchor.angle。符号を落としやすいので理由を書いておく。**
//   THREE の rotation.y は行列が [cosθ, sinθ; -sinθ, cosθ] で、
//   logroll.js の toWorld が使う [cosθ, -sinθ; sinθ, cosθ] と**逆向き**。
//   +anchor.angle のままだと、丸太の中心(toWorld で置いている)は合うのに
//   長さ方向だけ逆へ開いて、丸太が斜めに交差する筏が描かれる。
//   実測では中心から 0.5 タイル離れるともう当たり判定と重ならなかった。
//   -anchor.angle にすると root の座標系が logroll.js の local と一致する
//   (root の +x → 局所 +x、+z → 局所 +z、+y → 上)。
//
// 切れ目の位相合わせ:
//   THREE の CylinderGeometry は角 θ の点が (r sinθ, y, r cosθ)。
//   tilt で +Z が下を向くので、**てっぺんは θ = π**。
//   logroll.js は「h.phase + spin·t が 0 のとき、その切れ目が上」なので、
//   欠けを θ = π − h.phase に置いて、spin.rotation.y = −spin·t で回せば、
//   両者はいつでも一致する。

import * as THREE from 'three';
import {
  HOLE_ARC, LOG_COUNT, LOG_LEN, LOG_R, LOG_TOP, toWorld,
} from './logroll.js';

// 丸太の見た目。当たり判定より気持ち太く見せる ── 細いと、乗っているのに
// 落ちそうに見えて、実際の判定より厳しく感じる。
const DRAW_R = LOG_R * 1.02;
const RADIAL = 14;

// 木口(切り口)の色。切れ目の断面が黒くなると穴に見えないので、明るくする
const WOOD = 0x8a5a32;
const BARK = 0x6b4423;

// 木肌の筋。**これが無いと丸太が回って見えない。**
//
// のっぺりした円柱は、回しても輪郭が変わらないので止まって見える
// (実測: 動画にすると人だけが滑っていて、丸太は板に見えた)。
// 遊びのほうは「どちらへどれだけ流れているか」を目で読んで足を出す
// ものなので、回っているのが見えないと、何が起きているのか分からない。
// 長さ方向の細い筋を数本、円周に散らして貼る ── 回ると筋が上を横切る。
// **細いと見えない。** 0.16 ラジアン(= 幅 3cm)で試したところ、
// 0.25 秒違いの2枚を並べても絵が変わらなかった ── 遊ぶ距離では
// 線が細すぎて、回転が画面に出ていない。上面を横切るのが分かる幅にする。
const RIDGE = 0x3f2512;
const RIDGES = 6;              // 1本あたりの筋の数
const RIDGE_W = 0.38;          // ラジアン(約22°)。上面をひと筋ずつ横切る

// 筏を海に浮かべる。course / anchor は logroll.js のもの。
// **高さは LOG_TOP をそのまま使う**(世界の高さ)── 判定と同じ数を通す。
export function makeRaft(scene, course, anchor) {
  const group = new THREE.Group();
  const bark = new THREE.MeshStandardMaterial({ color: BARK, roughness: 0.95 });
  const wood = new THREE.MeshStandardMaterial({ color: WOOD, roughness: 0.85 });
  const ridge = new THREE.MeshStandardMaterial({ color: RIDGE, roughness: 1 });
  const geos = [];
  const spins = [];

  for (const log of course.logs) {
    const w = toWorld(anchor, log.x, 0);
    const root = new THREE.Group();
    root.position.set(w.x, LOG_TOP - LOG_R, w.z);
    root.rotation.y = -anchor.angle;   // 上のコメント参照(THREE は逆回り)
    const tilt = new THREE.Group();
    tilt.rotation.x = Math.PI / 2;
    const spin = new THREE.Group();
    tilt.add(spin);
    root.add(tilt);
    group.add(root);
    spins.push({ spin, log });

    // 長さ方向を、切れ目とそれ以外に切り分ける
    const holes = [...log.holes].sort((a, b) => a.z0 - b.z0);
    const spans = [];
    let at = -LOG_LEN / 2;
    for (const h of holes) {
      if (h.z0 > at) spans.push({ z0: at, z1: h.z0, hole: null });
      spans.push({ z0: Math.max(at, h.z0), z1: h.z1, hole: h });
      at = h.z1;
    }
    if (at < LOG_LEN / 2) spans.push({ z0: at, z1: LOG_LEN / 2, hole: null });

    for (const sp of spans) {
      const len = sp.z1 - sp.z0;
      if (len <= 1e-6) continue;
      // 切れ目のところは、欠けたぶんだけ足りない筒にする
      const geo = sp.hole
        ? new THREE.CylinderGeometry(
          DRAW_R, DRAW_R, len, RADIAL, 1, false,
          Math.PI - sp.hole.phase + HOLE_ARC / 2, Math.PI * 2 - HOLE_ARC,
        )
        : new THREE.CylinderGeometry(DRAW_R, DRAW_R, len, RADIAL, 1, false);
      geos.push(geo);
      const mesh = new THREE.Mesh(geo, sp.hole ? wood : bark);
      // 円柱は自分の中心が原点。長さ方向(いまは Y)へずらして並べる
      mesh.position.y = (sp.z0 + sp.z1) / 2;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      spin.add(mesh);
    }

    // 木肌の筋。丸太の全長に通す(切れ目のところも通ってよい ── 筋は
    // 飾りで、足場があるかは logroll.js が決める)。少しだけ外へ出して
    // Z ファイティングを避ける。
    for (let k = 0; k < RIDGES; k++) {
      const at = (k / RIDGES) * Math.PI * 2;
      const geo = new THREE.CylinderGeometry(
        DRAW_R * 1.02, DRAW_R * 1.02, LOG_LEN, 3, 1, true, at, RIDGE_W,
      );
      geos.push(geo);
      const m = new THREE.Mesh(geo, ridge);
      m.castShadow = false;
      spin.add(m);
    }
  }

  scene.add(group);
  return {
    group,
    // t は丸太が回りはじめてからの秒数(logroll.js の rollTime)。
    // **判定と同じ t を渡すこと** ── 別々に数えると、見えている切れ目と
    // 抜ける切れ目がずれて、何もないところで落ちる。
    setTime(t) {
      for (const { spin, log } of spins) spin.rotation.y = -log.spin * t;
    },
    dispose() {
      group.removeFromParent();
      for (const g of geos) g.dispose();
      bark.dispose();
      wood.dispose();
      ridge.dispose();
    },
  };
}

export { LOG_COUNT };
