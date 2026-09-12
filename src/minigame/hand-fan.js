// 手札の扇。円卓に着いている人が胸の前に持つ、裏向きの札。
//
// **枚数が体に出ているのが大事**で、中身は出さない ── 何を持っているかは
// 隠し情報だし、遠目には読めない。「あと2枚」が数字を読まずに分かると、
// 卓の緊張感がまるで変わる。
//
// 札の絵も板も**1つを使い回す**。6人 × 10枚 ぶん作り直すと、配り直しの
// たびに 60 枚のメッシュを捨てることになる。

import * as THREE from 'three';
import { fanLayout, FAN_MAX } from './table-cue.js';

// 札の大きさ(棒人間の素の寸法。胸の幅が 0.15 くらい)
// 胴の半径が 0.076。扇の端から端が胴幅を超えると、体が札に隠れる
const CARD_W = 0.056;
const CARD_H = 0.072;

// 裏模様。1枚だけ作って全員で使う
let backTex = null;
function cardBack() {
  if (backTex) return backTex;
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 90;
  const c = canvas.getContext('2d');
  c.fillStyle = '#2f4f7a';
  c.fillRect(0, 0, 64, 90);
  c.strokeStyle = '#f3ead6';
  c.lineWidth = 4;
  c.strokeRect(4, 4, 56, 82);
  // 斜めの格子。無地だと厚紙にしか見えない
  c.strokeStyle = 'rgba(243, 234, 214, 0.45)';
  c.lineWidth = 2;
  for (let i = -90; i < 64; i += 12) {
    c.beginPath();
    c.moveTo(i, 0);
    c.lineTo(i + 90, 90);
    c.stroke();
  }
  backTex = new THREE.CanvasTexture(canvas);
  backTex.colorSpace = THREE.SRGBColorSpace;
  return backTex;
}

let fanGeo = null;
let fanMat = null;

// 胸に付ける扇。setCount(n) で枚数を変える。
//
// **扇の要は札の下端**。板の中心で回すと、開いたときに札が横へ散って
// 「持っている」形にならない。入れ子にして、板を上へずらしてから回す。
export function makeHandFan() {
  if (!fanGeo) fanGeo = new THREE.PlaneGeometry(CARD_W, CARD_H);
  if (!fanMat) {
    fanMat = new THREE.MeshStandardMaterial({
      map: cardBack(), roughness: 0.85, side: THREE.DoubleSide,
    });
  }
  const group = new THREE.Group();
  const pivots = [];
  for (let i = 0; i < FAN_MAX; i += 1) {
    const pivot = new THREE.Group();
    const card = new THREE.Mesh(fanGeo, fanMat);
    card.position.y = CARD_H * 0.42;
    card.castShadow = true;
    pivot.add(card);
    pivot.visible = false;
    group.add(pivot);
    pivots.push(pivot);
  }

  return {
    group,
    setCount(n) {
      const lay = fanLayout(n);
      group.visible = lay.length > 0;
      pivots.forEach((p, i) => {
        p.visible = i < lay.length;
        if (i >= lay.length) return;
        p.rotation.z = -lay[i].a;
        // 横のずれは**札の幅**が単位(table-cue.js)
        p.position.x = lay[i].x * CARD_W;
        // 重なる順。奥から手前へ少しずつずらさないと、同じ面で
        // ちらつく(z ファイティング)
        p.position.z = i * 0.0016;
      });
    },
    dispose() {
      group.removeFromParent();
    },
  };
}

// 胸のどこに付けるか(body.js の chest から見た位置)。
//
// **手の位置を測ってから決める。** 札を持つ姿勢での手は、胸から見て
// (±0.060, −0.037, +0.048)。扇の要はその真ん中あたりに置く。
// 上げすぎると札が口にかかる(口は胸から y=+0.076)。
// **腕より前に出すこと。** 手のすぐそば(z=0.058)に置いたら、上腕の
// 太い部分(手前の面が z≈0.092)が扇をまるごと隠した。扇は「手に持って
// いるように見える」より「見える」ほうが大事なので、腕の前へ回す。
// 傾けすぎるのも同じ理由でだめ ── 上端が奥へ逃げて腕の陰に入る。
export const FAN_AT = { y: -0.058, z: 0.104, tilt: -0.15 };
