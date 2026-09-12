// 散策部屋で「他の人」を描く。
//
// 位置は remote.js が補間した結果を受け取るだけ。ここは見た目の担当で、
// 物理も入力も持たない ── 相手の体を動かすのは相手の端末の仕事。
//
// 姿勢は自分と同じ pose.js を通す。applyPose(walker.js)を共有しているので、
// 項目を足したときに「相手だけ足が交差する」ようなずれが起きない。

import * as THREE from 'three';
import { makeWalker, walkerHeight } from './body.js';
import { applyPose } from './walker.js';
import {
  walkPose, airPose, tumblePose, fishPose, sitPose, emotePose,
  restBlend, phasePerUnit,
} from './pose.js';
import { WALK_SPEED, RUN_GAIT } from './motion.js';
import { ST } from './remote-st.js';
import { emoteById } from './emote.js';
import { speciesById, DEFAULT_SPECIES } from './species.js';
import { makeHandFan, FAN_AT } from './hand-fan.js';

// 席ごとの色。対戦の4色に、散策部屋のぶんを足して8色。
// 隣り合う席が似た色にならないように並べてある。
export const WALK_COLORS = [
  0xf04343, 0x3f8ef7, 0xffa02e, 0xb06ef0,
  0x36c98d, 0xf25fa8, 0x7ad0e8, 0xd9c34a,
];

// 名札は頭の少し上。背丈はすがたによって違う(角やもこもこで伸びる)ので、
// 決め打ちにしない ── 固定値だと、背の高い子の名札が頭にめり込む。
const nameY = (sp) => walkerHeight(sp) + 0.13;
// 名札の高さ(ワールド座標)。棒人間の身長の 2 割ほど。
// 一度これを 0.26 にしたら、近づいたとき画面の半分を名札が占めて
// 肝心の相手が見えなくなった ── 名前は添えるもので、主役ではない。
const NAME_H = 0.17;

// 名札。名前は変わらないので、席ごとに1枚だけ作って使い回す。
function makeNameTag(text, y) {
  const pad = 12;
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  const font = 'bold 40px system-ui, sans-serif';
  ctx.font = font;
  const w = Math.ceil(ctx.measureText(text).width) + pad * 2;
  canvas.width = Math.max(64, w);
  canvas.height = 64;
  const c = canvas.getContext('2d');
  c.font = font;
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  // 下地。空にも地面にも溶けないように、暗い角丸を敷く
  c.fillStyle = 'rgba(8, 22, 38, 0.72)';
  c.beginPath();
  c.roundRect(0, 8, canvas.width, 48, 12);
  c.fill();
  c.fillStyle = '#ffffff';
  c.fillText(text, canvas.width / 2, 32);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map: tex, transparent: true, depthTest: false,
  }));
  sprite.scale.set((canvas.width / canvas.height) * NAME_H, NAME_H, 1);
  sprite.position.y = y;
  sprite.renderOrder = 10;   // 木や山に隠れず、誰がどこにいるか分かるように
  // 文字の長さで横幅が変わるので、縮めるときのために覚えておく
  sprite.userData.w = (canvas.width / canvas.height) * NAME_H;
  return sprite;
}

// エモートの吹き出し。遠くにいる相手は体が小さくて身ぶりが読めないので、
// 名札の上に絵文字を1つ浮かべる。
// 名札(0.17)より気持ち大きいくらい。同じ理由で大きくしすぎない ──
// 絵文字は目立つので、名札より一回り大きいだけで十分に読める。
const BUBBLE_H = 0.2;

function makeBubble(icon, y) {
  const canvas = document.createElement('canvas');
  canvas.width = 96;
  canvas.height = 96;
  const c = canvas.getContext('2d');
  c.fillStyle = 'rgba(255, 255, 255, 0.94)';
  c.beginPath();
  c.arc(48, 48, 44, 0, Math.PI * 2);
  c.fill();
  c.font = '52px system-ui, "Apple Color Emoji", "Noto Color Emoji", sans-serif';
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.fillText(icon, 48, 52);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map: tex, transparent: true, depthTest: false,
  }));
  sprite.scale.set(BUBBLE_H, BUBBLE_H, 1);
  sprite.position.y = y;
  sprite.renderOrder = 11;
  return sprite;
}

// 手番の矢印。円卓で「いまこの人の番」を頭の上に出す。
//
// 卓の縁の光(table.js)だけだと、卓を見ていない向きのときに分からない。
// 人の上に付いていれば、その人が画面に入った瞬間に手番だと分かる。
// 大きさは**棒人間の背丈から決める**。決め打ちで置いたら、背丈 0.47 の体に
// 高さ 0.075 の三角(体の 1/6)が付いて、画面の上まではみ出した。
const MARK_H = 0.075;
function makeTurnMark() {
  const g = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({ color: 0xffd97d, depthTest: false });
  const cone = new THREE.Mesh(new THREE.ConeGeometry(MARK_H * 0.5, MARK_H, 5), mat);
  cone.rotation.x = Math.PI;      // 先を下へ(その人を指す)
  cone.renderOrder = 12;
  g.add(cone);
  g.renderOrder = 12;
  return g;
}
// 名札の上ぶちからどれだけ浮かべるか(名札と同じ倍率で縮む)。
// 頭と名札のあいだに挟むと、名札の下地に隠れてほとんど見えなかった。
const MARK_UP = 0.75;

// 名札の大きさを場面で変える倍率。
// 名札は「遠くにいる相手が誰か分かる」ための大きさ(NAME_H)で作ってあり、
// 棒人間の背丈とほぼ同じ。円卓に着くと相手は目と鼻の先なので、そのままだと
// 名札だけで画面の上が埋まる。
export const NAME_SCALE_TABLE = 0.55;

export class RemoteView {
  // groundAt(x, z) → { y }。相手の足を地面に合わせるのに使う
  constructor(scene, groundAt) {
    this.scene = scene;
    this.groundAt = groundAt;
    this.people = new Map();   // seat -> { parts, tag, name, sp, phase, spin, t, y }
    this.nameScale = 1;
    this.turnSeat = null;      // 円卓でいま手番の席(自分なら null のまま)
    this.hands = null;         // 席 → 手札の枚数(円卓に着いている間だけ)
  }

  // 円卓の手札枚数。**枚数だけ**で中身は受け取らない(隠し情報)。
  // null を渡すと扇を片付ける(卓が終わったとき)。
  setHandCounts(counts) {
    this.hands = counts ?? null;
  }

  // 扇を出す/しまう。要るときだけ作る ── 島を歩いているだけの人に
  // 10 枚ぶんの板を持たせても、1枚も見えない。
  _handFan(e, n) {
    if (n > 0 && !e.fan) {
      e.fan = makeHandFan();
      e.fan.group.position.set(0, FAN_AT.y, FAN_AT.z);
      e.fan.group.rotation.x = FAN_AT.tilt;
      e.parts.chest.add(e.fan.group);
    }
    if (!e.fan) return;
    e.fan.setCount(n);
  }

  // 円卓の手番。頭の上に矢印を出す席を1つだけ選ぶ。
  setTurnSeat(seat) {
    this.turnSeat = seat ?? null;
  }

  // 矢印を出す/しまう。上下にゆっくり弾ませる
  _turnMark(e, on, t) {
    if (on && !e.mark) {
      e.mark = makeTurnMark();
      e.parts.group.add(e.mark);
    }
    if (!e.mark) return;
    e.mark.visible = on;
    if (!on) return;
    // 名札と同じ倍率で縮める。卓に着くと相手は目の前なので、
    // そのままだと矢印だけが顔より大きくなる
    const k = this.nameScale;
    e.mark.scale.setScalar(k);
    // 名札の上ぶち(_sizeTag と同じ式)のさらに上へ
    const top = nameY(e.sp) - (1 - k) * NAME_H * 0.5 + NAME_H * k * 0.5;
    e.mark.position.y = top + MARK_H * k * MARK_UP + Math.sin(t * 4.2) * 0.014;
  }

  // 名札の大きさを変える。円卓に着いている間だけ小さくする(上の説明)。
  // すでに出ている名札にもその場で効かせる ── 座ったあとに来た人だけ
  // 大きい、では揃わない。
  setNameScale(k) {
    this.nameScale = k > 0 ? k : 1;
    for (const e of this.people.values()) this._sizeTag(e);
  }

  _sizeTag(e) {
    if (!e.tag) return;
    e.tag.scale.set(e.tagW * this.nameScale, NAME_H * this.nameScale, 1);
    e.tag.position.y = nameY(e.sp) - (1 - this.nameScale) * NAME_H * 0.5;
  }

  _make(seat, name, look) {
    const sp = speciesById(look ?? DEFAULT_SPECIES);
    const parts = makeWalker(WALK_COLORS[seat % WALK_COLORS.length], sp);
    this.scene.add(parts.group);
    const tag = name ? makeNameTag(name, nameY(sp)) : null;
    if (tag) parts.group.add(tag);
    const e = {
      parts, tag, tagW: tag?.userData.w ?? 0, name: name ?? null, sp, look: sp.id,
      phase: 0, spin: 0, t: 0, y: 0,
      rest: restBlend(),   // 止まったら足をそろえる(自分の体と同じ)

      emote: 0, emoteT: 0, bubble: null,
      mark: null,   // 円卓の手番の矢印(要るときだけ作る)
      fan: null,    // 円卓の手札の扇(同じく)
    };
    this._sizeTag(e);
    this.people.set(seat, e);
    return e;
  }

  // people: remote.js の sample() が返したもの
  update(dt, people) {
    const seen = new Set();
    for (const p of people) {
      seen.add(p.seat);
      let e = this.people.get(p.seat);
      if (!e) e = this._make(p.seat, p.name, p.look);
      // すがたを変えた/名簿が後から届いた。体ごと作り直す
      // (耳やしっぽは組み立て時に足しているので、後から差し替えられない)
      if (p.look && p.look !== e.look) {
        this._remove(p.seat, e);
        e = this._make(p.seat, p.name ?? e.name, p.look);
      }
      // 名前は後から名簿が届くことがある
      if (p.name && p.name !== e.name) {
        if (e.tag) { e.tag.removeFromParent(); disposeSprite(e.tag); }
        e.name = p.name;
        e.tag = makeNameTag(p.name, nameY(e.sp));
        e.tagW = e.tag.userData.w;
        this._sizeTag(e);
        e.parts.group.add(e.tag);
      }

      e.t += dt;
      const ground = this.groundAt(p.x, p.z).y;
      const y = ground + p.y;
      // 上下の変化から、跳んでいる勢いを読む(vy は送っていない)
      const vy = dt > 0 ? (y - e.y) / dt : 0;
      e.y = y;

      // エモート。番号が変わったら最初から流し直す(同じ身ぶりの2回目も含む)
      const em = p.emote ?? 0;
      if (em !== e.emote) {
        e.emote = em;
        e.emoteT = 0;
        this._setBubble(e, em);
      } else if (em) {
        e.emoteT += dt;
      }
      const emote = em ? emoteById(em) : null;
      // 送り手が終わりを伝える前に自分の時計で終わってしまったら、立ち姿へ戻す
      const emoteK = emote ? e.emoteT / (emote.ms / 1000) : 1;
      if (e.bubble) e.bubble.visible = emoteK < 1;
      // 手番の矢印は座っている人にだけ。歩いている人の頭に出ても意味が無い
      this._turnMark(e, p.st === ST.sit && p.seat === this.turnSeat, e.t);
      // 手札の扇も座っている人にだけ
      const cards = p.st === ST.sit ? (this.hands?.[p.seat] ?? 0) : 0;
      this._handFan(e, cards);

      e.parts.rod.group.visible = p.st === ST.fish;
      let pose;
      if (emote && emoteK < 1 && p.st === ST.walk) {
        pose = emotePose(emote.key, e.emoteT, p.facing, emoteK);
      } else if (p.st === ST.sit) {
        // 円卓に着いている人。座り姿を出さないと、卓を囲んでいるはずの
        // 全員が立ったまま札を出しているように見える。
        // 札を持っていれば、その形に寄せる
        pose = sitPose(e.t, p.facing, cards > 0 ? 1 : 0);
      } else if (p.st === ST.fish) {
        pose = fishPose(e.t, p.facing, { phase: 'wait' });
      } else if (p.st === ST.fall) {
        e.spin += dt * 3.4;
        pose = tumblePose(e.spin, p.facing);
      } else if (p.st === ST.air) {
        pose = airPose(vy, p.facing);
      } else {
        // **位相は進んだ距離から引く。** 決め打ちの係数(5.2)が残っていて、
        // 自分の体(walker.js)だけ直してここが取り残されていた ──
        // 縮尺を ×0.5 にしたとき、相手だけ 1歩で進む距離が足の振れ幅の
        // 8.8 倍になって、他人の足がずっと滑っていた。
        const gait = Math.min(RUN_GAIT, p.speed / WALK_SPEED);
        e.phase += p.speed * dt * phasePerUnit(gait);
        // 止まったら足をそろえる。**自分の体と同じ扱いにする** ──
        // ここを忘れると、相手だけ片足を前に出したまま突っ立って見える。
        pose = e.rest.pose(
          walkPose(e.phase, gait, p.facing), p.facing,
          p.speed > WALK_SPEED * 0.06, dt,
        );
      }
      applyPose(e.parts, pose, p.x, y, p.z);
    }

    // 消えた人は片付ける
    for (const [seat, e] of this.people) {
      if (seen.has(seat)) continue;
      this._remove(seat, e);
    }
  }

  // 吹き出しを掛け替える。0 なら外す。
  _setBubble(e, id) {
    if (e.bubble) {
      e.bubble.removeFromParent();
      disposeSprite(e.bubble);
      e.bubble = null;
    }
    const em = id ? emoteById(id) : null;
    if (!em) return;
    e.bubble = makeBubble(em.icon, nameY(e.sp) + 0.19);
    e.parts.group.add(e.bubble);
  }

  _remove(seat, e) {
    e.parts.group.removeFromParent();
    e.parts.group.traverse((o) => {
      o.geometry?.dispose?.();
      if (o.material) {
        (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m.dispose?.());
      }
    });
    this.people.delete(seat);
  }

  dispose() {
    for (const [seat, e] of [...this.people]) this._remove(seat, e);
  }
}

function disposeSprite(sprite) {
  sprite.material.map?.dispose();
  sprite.material.dispose();
}
