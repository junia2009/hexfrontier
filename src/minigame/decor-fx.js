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

const BUILD = { bench, lamp, flag, planter };

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
    // 夜だけ光るもの(石灯籠)。night は 0〜1
    update(night = 0) {
      if (!made.lamp) return;
      made.lamp.emissive.setHex(0xffca63);
      made.lamp.emissiveIntensity = night;
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
