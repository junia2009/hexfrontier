// 島の掲示板の寸法と、貼り紙のめくれかた。**THREE を使わない**ので
// テストから直接読める(見た目は notice.js。ground.js と walk-mode.js の関係と同じ)。
//
// ここに数を集めてあるのは、**紙と板の隙間が両方から決まる**から。
// 板の前面を動かしたのに紙を動かし忘れる(あるいはその逆)と、
// 紙が板に食い込む ── 目で見て気づけるのは、ちらついてからになる。

export const HALF = 0.26;        // 板の横はば(半分)
export const HEAD_H = 0.13;      // 見出しの板の高さ
export const BOARD_H = 0.26;     // 貼り紙を留める板の高さ
export const POST_H = 0.62;      // 掲示板の高さ(見出しの板の上端)

export const HEAD_TOP = POST_H;
export const HEAD_BOTTOM = POST_H - HEAD_H;

export const POST_BURY = 0.12;   // 柱が地面に刺さるぶん(浮いて見えないように)

// 柱の上端。**見出しの板の上端とそろえない。** そろえると、柱の天面と
// 板の天面が「同じ高さの2枚の面」になる ── 実測で隙間ぴったり 0 で、
// 上から見るとそこがちらつく(紙と同じ z ファイティング)。
// 板の中へ少し埋めて、天面どうしが出会わないようにする。
export const POST_TOP = POST_H - 0.02;

export const PANEL_Z = 0.008;    // 留め板の中心
export const PANEL_D = 0.025;    // 留め板の厚み

export const PAPER = 3;          // 貼ってある紙の枚数
export const PAPER_W = 0.115;
export const PAPER_H = 0.14;
export const FLAP_SEC = 2.6;     // 紙がめくれる周期(秒)

// 留め板の前面。紙はここより手前に無いといけない
export const PANEL_FRONT = PANEL_Z + PANEL_D / 2;   // 0.0205

// 紙を留める高さ(奥行き)。**留め板の前面から 0.0105 離す。**
// 前は 0.022 に置いてあって、留め板の前面 0.0205 との差が 0.0015
// (世界の長さで 0.00075)しかなかった ── 紙の上端は留め具なので
// めくれても動かず、**そこがずっと板と同じ深さ**にいた。
// 手元(奥行き24ビット)では出ないが、実機で z ファイティングが出た。
export const PAPER_Z = 0.031;

// めくれの最大角(ラジアン)。**手前向きだけ**なので符号は負で使う。
export const FLAP_MAX = 0.34;

// そばに立っていないときの振り幅。ずっと揺れていると遠くからでも気が散る
export const FLAP_FAR = 0.18;

// 紙のめくれ角。**0 から -FLAP_MAX の片側だけに振れる。**
//
// 前は sin で両側(±0.3)に振っていた。紙の留め具は上の辺なので、
// 正の側へ回すと下半分が**板の中へ入っていく** ── 実測で紙の下端が
// z = -0.019(留め板の裏 -0.0045 よりさらに奥)まで潜っていた。
// 実物の貼り紙は手前にしかめくれない。
export function flapAngle(t, i, near = false) {
  const k = near ? 1 : FLAP_FAR;
  // (1 - cos) / 2 は 0〜1 をなめらかに行き来する。sin と違って負にならない
  const lift = (1 - Math.cos((t / FLAP_SEC) * Math.PI * 2 + i * 1.7)) / 2;
  return -lift * FLAP_MAX * k;
}

// めくれ角 angle のときの、紙のいちばん奥の点の奥行き。
//
// 紙は留め具(上端)を軸に回る。紙の上で留め具から下へ y だけ離れた点は、
// 回すと奥行きが y·sin(angle) だけ動く(y は下向きに負)。
// angle が負(手前へめくれる)なら、どの点も留め具より手前へ出るので
// いちばん奥は留め具そのもの。角度が正だと下へ行くほど奥へ潜る。
export function paperMinZ(angle) {
  // 手前へめくる(角度が負)と sin も負なので、max で 0 に落ちる ──
  // 場合分けで書くと「0 のときどちらに倒すか」が意味を持たない枝になる
  // (故障注入では捕まえようのない、振る舞いの変わらない違い)。
  return PAPER_Z - PAPER_H * Math.max(0, Math.sin(angle));
}

// 紙と留め板の隙間。**0 以下なら紙が板に食い込んでいる。**
export function paperClearance(angle) {
  return paperMinZ(angle) - PANEL_FRONT;
}
