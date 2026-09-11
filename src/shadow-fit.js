// 影を焼き付ける箱(平行投影)を、どこに・どう置くか。
//
// 描画から切り離してあるのは、**ここが影のチラつきの原因そのもの**だから
// (THREE を読まないので node --test から直接試せる)。
//
// 「キャラの影がなびく・チカチカして安定しない」という報告があった。
// 原因はふたつ:
//
// 1. **箱が大きすぎた。** 島ぜんぶを入れる ±15 の箱に 2048 の影マップだと、
//    1 単位あたり 68 テクセルしかない。キャラは身長 0.9 単位・腕の太さ
//    0.05 単位なので、腕は 3 テクセル。歩くたびに升目に入ったり出たりして
//    消えたり出たりする。歩きモードでは箱を主役の足元に寄せて ±5 にする
//    (205 テクセル/単位、3 倍)。
//
// 2. **箱が升目の上を滑っていた。** 太陽は 300 秒かけて空を巡るので、
//    箱は毎フレーム少しずつ動く。テクセル半個ぶんのずれが残ると、影の輪郭が
//    升目の境目を行ったり来たりして、ゆらゆら動いて見える。
//    箱の中心を升目に吸着させると、ずれが「ぴったり 0 か 1 テクセル」に
//    なって止まる。
//
// 実測(真上から、同じ立ち位置、キャラを少しずつ動かしながら6回):
//   直す前 影 739 px / 面積の振れ 9% / いちばん濃いところ 75%
//   直した後 影 1699 px / 振れ 1% / 55%   ← 濃く・大きく・揺れない

// 太陽を置く距離。平行光源なので明るさには関係しない(影の箱の奥行きだけ決まる)。
export const SUN_DIST = 18;
// 影の箱の半幅。
export const SHADOW_BOX_BOARD = 15; // 盤面表示: 島ぜんぶを入れる
export const SHADOW_BOX_WALK = 5;   // 歩きモード: 主役のまわりだけ

const UP = [0, 1, 0];

const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const unit = (a) => {
  const l = Math.hypot(a[0], a[1], a[2]);
  return l > 1e-9 ? [a[0] / l, a[1] / l, a[2] / l] : null;
};

// 影マップ1画素ぶんのワールド距離。
export function texelSize(box, mapSize) {
  return (box * 2) / mapSize;
}

// 影カメラの基底。**THREE の Object3D.lookAt と同じ作り方**でないと、
// 吸着させた升目が実際の影マップの升目とずれて意味がなくなる
// (奥行 = 的から光源へ / 横 = 上×奥行 / 縦 = 奥行×横)。
export function shadowBasis(sunDir) {
  const fwd = unit(sunDir) || [0, 1, 0];
  // 太陽が真上に来ると横軸が決まらない。この島ではそこまで上がらないが、
  // 0 除算で影が消えるよりはどこかに倒しておくほうがいい。
  const right = unit(cross(UP, fwd)) || [1, 0, 0];
  return { right, up: cross(fwd, right), fwd };
}

// 影の箱の中心を升目に吸着させた点を返す。
//   focus   寄せたい先 [x, y, z](歩きモードなら主役の足元)
//   sunDir  的から太陽へ向かう単位ベクトル
// 奥行き方向(sunDir 方向)はずらさない ── 平行投影なので影の見た目に
// 影響しないうえ、動かすと箱の前後が切れる。
export function snapFocus(focus, sunDir, box, mapSize) {
  const { right, up, fwd } = shadowBasis(sunDir);
  const t = texelSize(box, mapSize);
  const a = Math.round(dot(focus, right) / t) * t;
  const b = Math.round(dot(focus, up) / t) * t;
  const d = dot(focus, fwd);
  return [
    right[0] * a + up[0] * b + fwd[0] * d,
    right[1] * a + up[1] * b + fwd[1] * d,
    right[2] * a + up[2] * b + fwd[2] * d,
  ];
}
