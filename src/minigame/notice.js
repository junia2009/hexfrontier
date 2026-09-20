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
import {
  BOARD_H, HALF, HEAD_H, PANEL_D, PANEL_Z, PAPER, PAPER_H, PAPER_W, PAPER_Z,
  POST_BURY, POST_H, POST_TOP, flapAngle,
} from './notice-fit.js';

export function makeNoticeBoard(scene, x, z, groundY, facing = 0) {
  const g = new THREE.Group();
  g.position.set(x, groundY, z);
  g.rotation.y = facing;
  g.scale.setScalar(WALK_SCALE);

  const wood = new THREE.MeshStandardMaterial({ color: 0x8a5a32, roughness: 0.85 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x4a3a24, roughness: 0.8 });
  const cork = new THREE.MeshStandardMaterial({ color: 0x6b4a2a, roughness: 0.95 });
  // 紙は板の上に**貼ってある**ので、深さの争いでは必ず紙が勝つようにする。
  // 隙間(notice-fit.js の PAPER_Z)だけでも足りるはずだが、奥行きの
  // ビット数は端末まかせ ── 手元は24ビットで出なかったのに実機で出た。
  const paperMat = new THREE.MeshStandardMaterial({
    color: 0xfaf0d8,
    roughness: 0.95,
    side: THREE.DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -4,
  });

  // 柱2本。地面に刺さるぶんだけ下へ伸ばす(浮いて見えないように)。
  // 上端は見出しの板の中へ埋める(notice-fit.js の POST_TOP)
  for (const sx of [-1, 1]) {
    const post = new THREE.Mesh(
      new THREE.CylinderGeometry(0.028, 0.032, POST_TOP + POST_BURY, 7), dark,
    );
    post.position.set(sx * (HALF - 0.015), (POST_TOP - POST_BURY) / 2, 0);
    post.castShadow = true;
    g.add(post);
  }

  // 見出しの板。表だけ焼き込み(desk.js と同じ口)、裏と側面は木のまま。
  // **板の実寸を渡す。** ここは 0.52×0.13 の横長(4:1)で、
  // 渡さなかったころは 2:1 の canvas を引き伸ばしていて字が2倍に太っていた
  const face = makeSignFace(['島の掲示板', 'きょうの依頼'], HALF * 2, HEAD_H);
  const head = new THREE.Mesh(
    new THREE.BoxGeometry(HALF * 2, HEAD_H, 0.03),
    [wood, wood, wood, wood, face, wood],
  );
  head.position.set(0, POST_H - HEAD_H / 2, 0.008);
  head.castShadow = true;
  g.add(head);

  // 貼り紙を留める板。ここに紙を貼る
  const panel = new THREE.Mesh(new THREE.BoxGeometry(HALF * 2, BOARD_H, PANEL_D), cork);
  panel.position.set(0, POST_H - HEAD_H - BOARD_H / 2 - 0.005, PANEL_Z);
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
    pin.position.set((i - (PAPER - 1) / 2) * 0.155, paperY, PAPER_Z);
    const sheet = new THREE.Mesh(new THREE.PlaneGeometry(PAPER_W, PAPER_H), paperMat);
    sheet.position.y = -PAPER_H / 2;
    pin.add(sheet);
    g.add(pin);
    papers.push(pin);
  }

  scene.add(g);

  return {
    group: g,
    // near: そばに立っているか。t: 通しの秒数
    update(t, { near = false } = {}) {
      // めくれ角は notice-fit.js が決める(手前へ片側だけ。離れていれば小さく)
      for (const [i, p] of papers.entries()) p.rotation.x = flapAngle(t, i, near);
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
