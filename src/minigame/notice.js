// 島の掲示板(見た目)。中身は quests.js、置き場所は ground.js の boardPoint。
//
// 形は「掲示板」そのものにする ── 上に**見出しの板**、その下に**貼り紙を
// 留める板**。見出しと貼り紙を同じ面に重ねたら、紙が文字を隠して看板が
// 読めなくなった(実機で確認)。
//
// **棒人間より少し高いだけ**にすること。受付の広場に立てるので、大きいと
// 受付も店も隠れる(はじめは背丈の 1.7 倍あって、広場を塞いでいた)。

import * as THREE from 'three';
import { WALK_SCALE } from './scale.js';
import { makeSignFace } from './desk.js';

const HALF = 0.26;        // 板の横はば(半分)
const HEAD_H = 0.13;      // 見出しの板の高さ
const BOARD_H = 0.26;     // 貼り紙を留める板の高さ
const POST_H = 0.62;      // 柱の高さ(見出しの板の上端まで)
const PAPER = 3;          // 貼ってある紙の枚数
const FLAP_SEC = 2.6;     // 紙がめくれる周期(秒)

export function makeNoticeBoard(scene, x, z, groundY, facing = 0) {
  const g = new THREE.Group();
  g.position.set(x, groundY, z);
  g.rotation.y = facing;
  g.scale.setScalar(WALK_SCALE);

  const wood = new THREE.MeshStandardMaterial({ color: 0x8a5a32, roughness: 0.85 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x4a3a24, roughness: 0.8 });
  const cork = new THREE.MeshStandardMaterial({ color: 0x6b4a2a, roughness: 0.95 });
  const paperMat = new THREE.MeshStandardMaterial({
    color: 0xfaf0d8, roughness: 0.95, side: THREE.DoubleSide,
  });

  // 柱2本。地面に刺さるぶんだけ下へ伸ばす(浮いて見えないように)
  for (const sx of [-1, 1]) {
    const post = new THREE.Mesh(
      new THREE.CylinderGeometry(0.028, 0.032, POST_H + 0.12, 7), dark,
    );
    post.position.set(sx * (HALF - 0.015), (POST_H - 0.12) / 2, 0);
    post.castShadow = true;
    g.add(post);
  }

  // 見出しの板。表だけ焼き込み(desk.js と同じ口)、裏と側面は木のまま
  const face = makeSignFace(['島の掲示板', 'きょうの依頼']);
  const head = new THREE.Mesh(
    new THREE.BoxGeometry(HALF * 2, HEAD_H, 0.03),
    [wood, wood, wood, wood, face, wood],
  );
  head.position.set(0, POST_H - HEAD_H / 2, 0.008);
  head.castShadow = true;
  g.add(head);

  // 貼り紙を留める板。ここに紙を貼る
  const panel = new THREE.Mesh(new THREE.BoxGeometry(HALF * 2, BOARD_H, 0.025), cork);
  panel.position.set(0, POST_H - HEAD_H - BOARD_H / 2 - 0.005, 0.008);
  panel.receiveShadow = true;
  g.add(panel);

  // 屋根。雨よけがあると「読ませるための物」に見える
  const roof = new THREE.Mesh(new THREE.BoxGeometry(HALF * 2.25, 0.025, 0.18), wood);
  roof.position.set(0, POST_H + 0.03, 0.05);
  roof.rotation.x = -0.24;
  roof.castShadow = true;
  g.add(roof);

  // 貼り紙。**留め具は上の辺**なので、めくれるのは下 ── 回す軸を紙の上端に
  // 置きたいので、紙は入れ物(ピン)の子にして、その中で下へずらす。
  const papers = [];
  const paperY = panel.position.y + BOARD_H / 2 - 0.03;
  for (let i = 0; i < PAPER; i += 1) {
    const pin = new THREE.Group();
    pin.position.set((i - (PAPER - 1) / 2) * 0.155, paperY, 0.022);
    const sheet = new THREE.Mesh(new THREE.PlaneGeometry(0.115, 0.14), paperMat);
    sheet.position.y = -0.07;
    pin.add(sheet);
    g.add(pin);
    papers.push(pin);
  }

  scene.add(g);

  return {
    group: g,
    // near: そばに立っているか。t: 通しの秒数
    update(t, { near = false } = {}) {
      for (const [i, p] of papers.entries()) {
        // 離れているときはほとんど動かさない ── ずっと揺れていると、
        // 遠くからでも気が散る
        const k = near ? 1 : 0.18;
        p.rotation.x = Math.sin((t / FLAP_SEC) * Math.PI * 2 + i * 1.7) * 0.3 * k;
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
