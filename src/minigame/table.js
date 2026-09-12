// 円卓(大富豪の島)。みんなで囲んで座るための家具。
//
// 受付の台(desk.js)の代わりに島の中心へ据える。**台と同じ扱い**にして
// あるので、近づけば受付のパネルが開くし、ぶつかりもする ── walk-mode は
// 「受付が台か円卓か」だけを見分ければよい。
//
// 寸法は素のまま書いて、いちばん外の入れ物に縮尺を1回だけ掛ける
// (desk.js と同じ。ぶつかる大きさと席の並びは ground.js)。
//
// **手札は置かない。場に出ている札だけを天板へ並べる。**
// 手札まで卓の上で読ませようとすると、カメラを寄せるしかなくなり、誰が
// 座っているのか分からなくなる ── 読ませるのは画面下の HUD の仕事。
// 卓の上の札は「いま何が出ているか」が遠目に分かればよいので、小さくてよい。

import * as THREE from 'three';
import { WALK_SCALE, HIP_Y } from './scale.js';
import { TABLE_RADIUS, SEAT_R, tableSeats } from './ground.js';
import { makeSignFace } from './desk.js';
import { RANKS, SUITS, isJoker, rankOf, suitOf } from './daifugo.js';
import { arcSegments } from './table-cue.js';

// 素の寸法(縮尺を掛ける前)
const R = TABLE_RADIUS / WALK_SCALE;      // 天板の半径
const RING = SEAT_R / WALK_SCALE;         // 腰かけの輪
const TOP_Y = 0.17;                       // 天板の高さ
const STOOL_Y = HIP_Y;                    // 腰かけの座面 = 棒人間の腰の高さ
const STOOL_R = 0.055;
// 天板に置く札。並べる幅は天板に収まるまで詰める
const CARD_W = 0.13;
const CARD_H = 0.18;
const CARD_GAP = 0.095;

// 手番の印。**天板の縁を光らせる**。
//
// 足元に輪を置くのも試したが、座った目の高さでは向かいの人の体と脚が
// ちょうど重なって、肝心の輪が隠れる。天板なら必ず視界にあるし、
// 「その方角の人の番」が席に着いたまま一目で分かる。
const TURN_Y = TOP_Y + 0.0215;        // 布のすぐ上。場の札(+0.022)より下
const TURN_ARC = 0.62;                // 光る幅(ラジアン)
// 残り時間。内側に細い輪をもう1本。**幅ではなく長さで減らす** ──
// 手番の印そのものを細めていくと、残り少ないときにいちばん見えなくなる。
const CLOCK_SEGS = 24;
// 残りがこれを切ってから出す(45 秒のうち、のこり 20 秒あたりから)
const CLOCK_FROM = 0.45;

// RingGeometry は XY 平面で、θ=0 が +X。寝かせる(X 回り −90°)と
// θ=0 が +X のまま、θ=+90° が −Z になる。席の方角 a は (sin a, cos a) なので
// θ = a − π/2 が同じ向き。
const thetaFor = (a) => a - Math.PI / 2;

// 札の絵を canvas に描いて板に貼る(フォントも画像も積まずに済む。
// desk.js の看板と同じやり方)。同じ札は作り直さないので溜めておく。
const faceCache = new Map();
function cardFace(c) {
  if (faceCache.has(c)) return faceCache.get(c);
  const canvas = document.createElement('canvas');
  canvas.width = 96;
  canvas.height = 136;
  const g = canvas.getContext('2d');
  g.fillStyle = isJoker(c) ? '#2b3b52' : '#fdfaf3';
  g.fillRect(0, 0, 96, 136);
  g.strokeStyle = isJoker(c) ? '#4a5f7d' : '#d8cdb8';
  g.lineWidth = 5;
  g.strokeRect(2.5, 2.5, 91, 131);
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  if (isJoker(c)) {
    g.fillStyle = '#ffd97d';
    g.font = 'bold 54px system-ui, sans-serif';
    g.fillText('JK', 48, 68);
  } else {
    const suit = suitOf(c);
    g.fillStyle = suit === 1 || suit === 2 ? '#c0392b' : '#1d2733';
    g.font = 'bold 52px system-ui, sans-serif';
    g.fillText(RANKS[rankOf(c)], 48, 50);
    g.font = 'bold 40px system-ui, sans-serif';
    g.fillText(SUITS[suit], 48, 98);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  faceCache.set(c, tex);
  return tex;
}

export function makeTable(scene, x, z, groundY, meet, seats = 6) {
  const g = new THREE.Group();
  g.position.set(x, groundY, z);
  g.scale.setScalar(WALK_SCALE);

  const wood = new THREE.MeshStandardMaterial({ color: 0x8a5a32, roughness: 0.85 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x4a3a24, roughness: 0.8 });
  const cloth = new THREE.MeshStandardMaterial({ color: 0x2f6d4f, roughness: 0.9 });
  const board = new THREE.MeshStandardMaterial({ color: 0xf0dcb4, roughness: 0.9 });

  // 天板。緑の布を張った丸卓(札を置く卓に見えるように)
  const top = new THREE.Mesh(new THREE.CylinderGeometry(R, R, 0.028, 24), wood);
  top.position.y = TOP_Y;
  top.castShadow = true;
  top.receiveShadow = true;
  g.add(top);
  const felt = new THREE.Mesh(new THREE.CylinderGeometry(R * 0.88, R * 0.88, 0.006, 24), cloth);
  felt.position.y = TOP_Y + 0.017;
  g.add(felt);

  // 一本脚と台座。四本脚だと座る足とぶつかって見える
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.055, TOP_Y, 10), wood);
  stem.position.y = TOP_Y / 2;
  stem.castShadow = true;
  g.add(stem);
  const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.15, 0.022, 12), dark);
  foot.position.y = 0.011;
  g.add(foot);

  // 腰かけ。席の数だけ輪の上に並べる(ground.js の tableSeats と同じ並び)
  for (const spot of tableSeats({ x: 0, z: 0 }, seats)) {
    // tableSeats は世界の寸法で返す。この入れ物は縮尺前なので割り戻す
    const sx = spot.x / WALK_SCALE;
    const sz = spot.z / WALK_SCALE;
    const seat = new THREE.Mesh(
      new THREE.CylinderGeometry(STOOL_R, STOOL_R * 0.9, 0.018, 10), wood,
    );
    seat.position.set(sx, STOOL_Y, sz);
    seat.castShadow = true;
    g.add(seat);
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.02, STOOL_Y, 6), dark);
    leg.position.set(sx, STOOL_Y / 2, sz);
    g.add(leg);
  }

  // 柱・看板・旗。卓は低いので、遠くからは何も見えない ── 目印が要る。
  //
  // **卓のまん中から上へ伸ばす。** 席の輪の外に立てると、その席に座った人の
  // 真後ろに柱が来て、カメラと本人の間を塞ぐ(実際そうなっていた)。席は
  // 輪を埋めているので「空いている方角」は無い。真ん中なら誰の邪魔にもならず、
  // 看板は座った人の頭より高いので、向かいの顔も隠さない。
  // 看板は**座った人の頭よりずっと上**へ。低いと、向かいに座っている人の
  // 体にちょうど重なって顔が読めなくなる(卓を挟んで正面に来るため)。
  const SIGN_Y = TOP_Y + 0.62;
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.013, SIGN_Y - TOP_Y, 6), wood);
  pole.position.set(0, TOP_Y + (SIGN_Y - TOP_Y) / 2, 0);
  pole.castShadow = true;

  // 表裏の両面に文字を焼き込む(どちらから来ても読める)
  const faces = [board, board, board, board, makeSignFace(meet.sign), makeSignFace(meet.sign)];
  const sign = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.13, 0.015), faces);
  sign.position.set(0, SIGN_Y, 0);
  sign.castShadow = true;

  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.20, 5), dark);
  mast.position.set(0, SIGN_Y + 0.17, 0);
  const flag = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.11, 3), cloth);
  flag.rotation.z = -Math.PI / 2;
  flag.position.set(0.04, SIGN_Y + 0.23, 0);

  // ---- 手番の印(天板の縁) ----
  //
  // **見る人の向きでは回さない。** 場の札(fieldGroup)は読む向きを
  // 合わせるために回しているが、手番の印は「卓のどの方角の人か」を
  // 指すものなので、卓の向きに固定する。
  // **足し算で重ねる(AdditiveBlending)。** ふつうに塗ると、座った目の高さ
  // からは天板を斜めに見ることになって、緑の上の淡い黄色が「色あせた板」に
  // しか見えなかった。足し算なら下地が何色でも明るくなるので、光に見える。
  const turnMat = new THREE.MeshBasicMaterial({
    color: 0xffc14d, transparent: true, opacity: 0.9, depthWrite: false,
    blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
  const turnArc = new THREE.Mesh(
    new THREE.RingGeometry(R * 0.60, R * 0.86, 18, 1, 0, TURN_ARC), turnMat,
  );
  turnArc.rotation.x = -Math.PI / 2;
  turnArc.position.y = TURN_Y;
  turnArc.renderOrder = 3;
  turnArc.visible = false;
  g.add(turnArc);

  // 残り時間。卓をぐるりと囲む細い輪が、減るほど短くなる。
  //
  // **残りが少なくなるまで出さない。** 45 秒まるまる光らせると、卓の上に
  // ずっと明るい輪があるだけで、肝心の手番の印がその明るさに負ける。
  // 急かす印なのだから、急ぐべきときにだけ出て、近づくほど濃くなればよい。
  //
  // **布の内側に置く。** 縁の外(木の部分)に置いたら、座った目からは
  // 天板の縁に隠れて向こう側がまったく見えなかった。
  const clockMat = new THREE.MeshBasicMaterial({
    color: 0xff9a3c, transparent: true, opacity: 0.85, depthWrite: false,
    blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
  const clockArc = new THREE.Mesh(new THREE.RingGeometry(R * 0.80, R * 0.86, 40, 1), clockMat);
  clockArc.rotation.x = -Math.PI / 2;
  clockArc.position.y = TURN_Y;
  clockArc.renderOrder = 3;
  clockArc.visible = false;
  g.add(clockArc);
  let clockSeen = -1;   // いま何本ぶんの形を作ってあるか

  // 場に札が出たときの「着地」。0 で出たて、1 で落ち着いた形。
  // **どの席から出たかは向きに出さない。** 場の入れ物は見る人の向きへ
  // 回してあるので、出した人の方角から飛ばすには回転を打ち消す計算がいる。
  // 上から落として弾ませるだけで「いま出た」は十分に伝わる。
  let land = 1;
  const LAND_S = 0.22;

  // 場が流れるときの掃き出し。**すぐ消さない** ── 札がふっと消えるだけだと
  // 「流れた」のか「見間違い」なのか分からない。持ち上げながら小さくして、
  // 消えるところを見せる。
  let sweep = -1;               // -1 は掃き出していない
  const SWEEP_S = 0.30;

  // 役が出たときの閃光。布の上に重ねた円盤が、広がりながら消える。
  const flashMat = new THREE.MeshBasicMaterial({
    color: 0xffffff, transparent: true, opacity: 0, depthWrite: false,
    blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
  const flash = new THREE.Mesh(new THREE.CircleGeometry(R * 0.9, 28), flashMat);
  flash.rotation.x = -Math.PI / 2;
  flash.position.y = TURN_Y + 0.001;
  flash.renderOrder = 4;
  flash.visible = false;
  g.add(flash);
  let flashT = -1;
  const FLASH_S = 0.55;

  // 場に出ている札を置くところ。
  //   外(fieldGroup) … 読む向きを合わせるために Y で回す
  //   内(fieldFlat)  … 板を寝かせて、札の上を +Z へ向ける
  const fieldGroup = new THREE.Group();
  fieldGroup.position.y = TOP_Y + 0.022;
  g.add(fieldGroup);
  const fieldFlat = new THREE.Group();
  fieldFlat.rotation.set(-Math.PI / 2, 0, Math.PI);
  // **見ている人のほうへ寄せる。** 天板のまん中に置くと、看板の柱が
  // ちょうど札の上を通って読めなくなる(柱は誰の邪魔にもならない位置に
  // 立てるため、まん中から動かせない)。手前に寄れば読みやすくもなる。
  fieldFlat.position.z = -R * 0.25;
  fieldGroup.add(fieldFlat);
  const cardGeo = new THREE.PlaneGeometry(CARD_W, CARD_H);
  const clearField = () => {
    for (const gone of [...fieldFlat.children]) {
      fieldFlat.remove(gone);
      gone.material?.dispose?.();
    }
  };

  // 柱・看板・旗はひとまとまりにする。一人称で座ると目の前に立つので、
  // 座っている間だけ隠せるようにしておく(遠くからの目印としては要る)。
  const signPost = new THREE.Group();
  signPost.add(pole, sign, mast, flag);
  g.add(signPost);

  scene.add(g);
  return {
    group: g,
    // 看板を出す/隠す。**隠すのは座っている本人の画面だけ** ──
    // 一人称の目の高さでは、卓のまん中から伸びる柱がまともに視界を塞ぐ。
    // 相手の画面では出たままなので、世界から消えるわけではない。
    setSignVisible(on) { signPost.visible = !!on; },
    // 手番の印。angle は席の方角(ground.js の tableSeats の angle)、
    // remain01 は考える時間の残り(1 → 0)。angle が null なら消す。
    //
    // **形を作り直すのは変わったときだけ。** 残り時間は毎フレーム動くので、
    // 素直に作り直すと1秒に 60 回 RingGeometry を捨てることになる。
    // 見た目の刻みは 24 段しかないので、その段が変わったときだけでよい。
    setTurn(angle, remain01 = 0, t = 0) {
      const on = angle != null;
      turnArc.visible = on;
      clockArc.visible = on && remain01 > 0 && remain01 < CLOCK_FROM;
      if (!on) return;
      // 弧は θ∈[0, TURN_ARC] で作ってあるので、真ん中が席の方角に来るよう回す。
      // rotation.z は(既定の XYZ 順では)寝かせる前に自分の面の中で回るので、
      // そのまま「弧をどこから始めるか」になる。
      turnArc.rotation.z = thetaFor(angle) - TURN_ARC / 2;
      // ゆっくり息をする。止まった光より「いま動いている卓」に見える
      turnMat.opacity = 0.55 + Math.sin(t * 3.2) * 0.25;
      if (!clockArc.visible) return;
      // 残りが減るほど濃く。出はじめは薄くて、最後ははっきり
      clockMat.opacity = 0.25 + (1 - remain01 / CLOCK_FROM) * 0.65;
      const seg = arcSegments(remain01, CLOCK_SEGS);
      if (seg === clockSeen) return;
      clockSeen = seg;
      clockArc.geometry.dispose();
      clockArc.geometry = new THREE.RingGeometry(
        R * 0.80, R * 0.86, Math.max(2, seg * 2), 1,
        Math.PI / 2, (seg / CLOCK_SEGS) * Math.PI * 2,
      );
    },
    // 場の札を並べ直す。cards は daifugo.js の番号(空なら片付ける)。
    // seatAngle は見る人の席の角度 ── **札の上をその人と反対側へ向ける**ので、
    // どこに座っていても自分から見て正しい向きで読める。
    // 毎フレーム呼ぶ。着地・掃き出し・閃光を進める
    update(dt) {
      if (flashT >= 0) {
        flashT += dt;
        const k = Math.min(1, flashT / FLASH_S);
        flash.visible = k < 1;
        flashMat.opacity = (1 - k) * 0.55;
        flash.scale.setScalar(0.35 + k * 0.85);
        if (k >= 1) flashT = -1;
      }
      if (sweep >= 0) {
        sweep += dt;
        const k = Math.min(1, sweep / SWEEP_S);
        fieldGroup.position.y = TOP_Y + 0.022 + k * 0.10;
        fieldGroup.scale.setScalar(1 - k * 0.9);
        if (k >= 1) { sweep = -1; clearField(); }
        return;
      }
      if (land >= 1) return;
      land = Math.min(1, land + dt / LAND_S);
      const k = land * land * (3 - 2 * land);   // 両端でなめらかに
      fieldGroup.position.y = TOP_Y + 0.022 + (1 - k) * 0.06;
      fieldGroup.scale.setScalar(1 + (1 - k) * 0.22);
    },
    // 役が出た合図。色だけ変えて、同じ閃光を使い回す
    flash(color = 0xffffff) {
      flashMat.color.setHex(color);
      flashT = 0;
      flash.visible = true;
    },
    setField(cards = [], seatAngle = Math.PI) {
      fieldGroup.rotation.y = seatAngle + Math.PI;
      const n = cards.length;
      // 場が空になった。**いま札が出ているときだけ**掃き出しを始める ──
      // もともと空なら何も起きていないので、毎フレーム動き出してしまう。
      if (!n) {
        if (fieldFlat.children.length && sweep < 0) sweep = 0;
        return;
      }
      sweep = -1;
      land = 0;
      fieldGroup.scale.setScalar(1);
      clearField();
      // 天板からはみ出さないように、枚数が増えたら重ねて詰める
      const gap = Math.min(CARD_GAP, (R * 1.5) / n);
      cards.forEach((c, i) => {
        const m = new THREE.Mesh(cardGeo, new THREE.MeshBasicMaterial({ map: cardFace(c) }));
        m.position.set((i - (n - 1) / 2) * gap, 0, 0);
        fieldFlat.add(m);
      });
    },
    dispose() {
      cardGeo.dispose();
      g.removeFromParent();
      g.traverse((o) => {
        o.geometry?.dispose?.();
        if (o.material) {
          (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m.dispose?.());
        }
      });
    },
  };
}
