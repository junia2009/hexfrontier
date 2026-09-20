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

// 留め板の前面。紙はここより手前に無いといけない
export const PANEL_FRONT = PANEL_Z + PANEL_D / 2;   // 0.0205

// 紙を留める高さ(奥行き)。**留め板の前面から 0.0105 離す。**
// 前は 0.022 に置いてあって、留め板の前面 0.0205 との差が 0.0015
// (世界の長さで 0.00075)しかなかった ── そこがずっと板と同じ深さにいて、
// 手元(奥行き24ビット)では出ないのに実機で z ファイティングが出た。
//
// **貼り紙は動かさない。** 以前は下端がめくれる演出を入れていたが、
// 掲示板は島の真ん中にずっと立っているので、視界のすみで何かが動き続ける
// ことになる(「パタパタしなくていい」)。止めたぶん、隙間はこの1つの数で
// 決まりきる ── 回すと紙の下半分が板の中へ潜っていく問題も無くなる。
export const PAPER_Z = 0.031;

// 紙と留め板の隙間。**0 以下なら紙が板に食い込んでいる。**
export function paperClearance() {
  return PAPER_Z - PANEL_FRONT;
}
