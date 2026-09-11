// 画面の形が変わったとき、構図を取り直すかどうかの判断。
//
// 描画から切り離してあるのは、**ここが一番こじれたところ**だから
// (THREE を読まないので node --test から直接試せる)。
//
// 端末を横から縦に戻すと、画面が「ブルブル揺れてズレる」という報告があった。
// 原因は、高さがほんの少し動くたびに構図を取り直していたこと。
// 構図の取り直しはカメラの距離を計算し直して置き直すので、呼ぶたびに
// 寄り引きが起きる。実機では縦に戻したあと URL バーが出入りして高さが
// 何度も変わるため、そのあいだずっと画面が脈打っていた
// (高さ 844↔788 の揺れで、カメラ距離が 19.12↔17.85 と往復していた)。

// 縦構図と横構図の境目。**入るときと出るときで線をずらす(ヒステリシス)。**
// ここをまたぐと盤の見せ方が 90° 回るので、境目ちょうどで画面が少し
// 揺れただけで、盤がくるくる回ってしまう。
const TO_PORTRAIT = 0.8;   // 横構図から縦構図へ入る線
const TO_LANDSCAPE = 0.95; // 縦構図から横構図へ出る線

// 構図を取り直す最小の変化。画面の形の「比」で見る(対数なので、
// 縦横どちら向きの変化も同じ尺度で測れる)。
// 0.12 ≒ 13% の変化。URL バーの出入り(高さ 844→788 で 7%)では動かず、
// 本当に回したとき(4.7 倍)は確実に動く。
const REFIT_LOG = 0.12;

// いまの形が縦構図か。was は直前の判定(ヒステリシスに要る)。
export function isPortrait(aspect, wasPortrait = false) {
  if (!Number.isFinite(aspect) || aspect <= 0) return wasPortrait;
  return wasPortrait ? aspect < TO_LANDSCAPE : aspect < TO_PORTRAIT;
}

// 構図を取り直すべきか。
//   aspect    いまの形
//   fitAspect 最後に取り直したときの形(未設定なら必ず取り直す)
//   wasPortrait 直前の構図
// **基準は「前回の resize」ではなく「最後に取り直したとき」。**
// そうしないと、小さな変化が積み重なったときに取りこぼす。
export function needsRefit(aspect, fitAspect, wasPortrait = false) {
  if (!Number.isFinite(aspect) || aspect <= 0) return false;
  if (!Number.isFinite(fitAspect) || fitAspect <= 0) return true;
  if (isPortrait(aspect, wasPortrait) !== wasPortrait) return true;
  return Math.abs(Math.log(aspect / fitAspect)) > REFIT_LOG;
}

export const FIT_LIMITS = { TO_PORTRAIT, TO_LANDSCAPE, REFIT_LOG };
