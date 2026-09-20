// 看板の字を焼く。**THREE も DOM も知らない** ── canvas の ctx だけ受け取るので、
// 記録用の偽 ctx でテストできる(render/minimap.js と同じ手)。
//
// **canvas は板の縦横比に合わせる。** ここが合っていないと、そのぶん字が伸びる。
// 掲示板の見出しは板が 0.52×0.13(4:1)なのに canvas が 256×128(2:1)で、
// **ちょうど2倍に横へ引き伸ばされていた** ── これが「フォントが良くない、
// やっすいアプリって感じ」の正体。受付(0.24×0.12)と円卓(0.26×0.13)は
// たまたま 2:1 だったので無事だった。板の実寸をもらって、ここで決める。

// 板の1単位あたりの画素数。上げるとくっきりするが、そのぶん重くなる。
// 256px を板の幅いっぱいに引き伸ばしていたころは、寄るとぼやけていた。
export const PX_PER_UNIT = 2400;

// 1辺の上限。端末のテクスチャ上限に余裕をもって収める
export const MAX_PX = 1024;

// 看板の字。**明朝系を先に置く。** 彫った木の看板は明朝のほうが似合う ──
// system-ui のままだと、木の板に「アプリの既定の字」が乗っているように見える。
// 端末に無ければ serif に落ちる。**フォントは積まない**(配信物を増やすと
// オフラインの初回取得が重くなる)。
export const SIGN_FONT = '"Hiragino Mincho ProN", "Yu Mincho", YuMincho, '
  + '"Noto Serif JP", "Noto Serif CJK JP", IPAMincho, "Songti SC", serif';

// 字間(字の大きさに対する割合)。看板は少し開けるほうが「作った物」に見える
export const TRACK_BIG = 0.10;
export const TRACK_SMALL = 0.06;

// 色。木に彫って塗った看板のつもり
export const INK = '#4a2e14';        // 彫った字
export const GLOW = 'rgba(255, 248, 226, 0.55)'; // 彫り跡の下側が光を拾う
export const WOOD = '#e8d3a8';
export const GRAIN = [122, 84, 44];   // 木目(濃さは1本ごとに変える)
export const FRAME = 'rgba(96, 62, 28, 0.55)';

// 板の実寸(w×h)から canvas の大きさを決める。**縦横比は板のまま**
export function signCanvasSize(w, h) {
  const k = Math.min(PX_PER_UNIT, MAX_PX / Math.max(w, h));
  // 8の倍数に丸める(縦横比はほぼそのまま。端数で1px ずれるのを避ける)
  const r = (v) => Math.max(8, Math.round((v * k) / 8) * 8);
  return { w: r(w), h: r(h) };
}

// 字間を入れたときの一行の幅。measure(ch) はその字1つぶんの幅
export function lineWidth(measure, text, px, track) {
  const chars = [...text];
  if (!chars.length) return 0;
  let w = 0;
  for (const ch of chars) w += measure(ch);
  // 字間は字と字のあいだだけ。**最後の1つぶんは足さない** ──
  // 足すと右へ寄って、中央ぞろえに見えなくなる
  return w + px * track * (chars.length - 1);
}

// 幅に収まるまで字を小さくする。width(px) は「その大きさで描いたときの一行の幅」。
// **収まるまで縮める**ので、島ごとに文言の長さが違っても板からはみ出さない。
export function fitPx(width, maxWidth, startPx, minPx = 6) {
  let px = Math.round(startPx);
  while (px > minPx && width(px) > maxWidth) px -= 1;
  return px;
}

// 一行ぶん。**字ごとに置く**(字間を入れるため)。
// 彫ったように見せるため、下へずらした明るい色を先に敷いてから字を重ねる。
export function drawLine(ctx, text, { cx, cy, px, track, weight = 700 }) {
  const chars = [...text];
  if (!chars.length) return;
  ctx.font = `${weight} ${px}px ${SIGN_FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const w = lineWidth((ch) => ctx.measureText(ch).width, text, px, track);
  let x = cx - w / 2;
  const lift = Math.max(1, px * 0.035);
  for (const ch of chars) {
    const cw = ctx.measureText(ch).width;
    ctx.fillStyle = GLOW;
    ctx.fillText(ch, x + cw / 2, cy + lift);
    ctx.fillStyle = INK;
    ctx.fillText(ch, x + cw / 2, cy);
    x += cw + px * track;
  }
}

// ばらつきの種。**Math.random は使わない** ── 撮り直すたびに木目が変わると、
// 見た目を見比べられない(遊びの乱数は state.rng。ここは絵なので固定の式で足りる)
function jitter(n) {
  const v = Math.sin(n * 12.9898) * 43758.5453;
  return v - Math.floor(v);
}

// 板の地。木目と、彫り込んだ縁。**無地の1色をやめる** ── 塗りつぶしただけの
// 板は、字を直しても「間に合わせ」に見える。
export function drawBoard(ctx, W, H) {
  ctx.fillStyle = WOOD;
  ctx.fillRect(0, 0, W, H);
  // 木目。**等間隔にしない** ── そろえると罫線に見えて、木に見えない。
  // 位置も太さも濃さもばらす。
  const lines = 9;
  for (let i = 0; i < lines; i += 1) {
    const y = ((i + 0.15 + jitter(i + 1) * 0.7) / lines) * H;
    const t = Math.max(1, H * (0.004 + jitter(i + 40) * 0.016));
    ctx.fillStyle = `rgba(${GRAIN.join(', ')}, ${(0.05 + jitter(i + 80) * 0.09).toFixed(3)})`;
    ctx.fillRect(0, y, W, t);
  }
  // 彫り込んだ縁。溝なので**濃い線の内側に明るい線**を添える(光は上から)
  const m = Math.round(Math.min(W, H) * 0.075);
  const lw = Math.max(2, H * 0.020);
  ctx.lineWidth = lw;
  ctx.strokeStyle = FRAME;
  ctx.strokeRect(m, m, W - m * 2, H - m * 2);
  ctx.lineWidth = Math.max(1, lw * 0.5);
  ctx.strokeStyle = GLOW;
  ctx.strokeRect(m + lw * 0.75, m + lw * 0.75, W - (m + lw * 0.75) * 2, H - (m + lw * 0.75) * 2);
}

// 看板ぜんぶ。canvas の大きさは呼ぶ側が signCanvasSize で決めておく。
export function drawSign(ctx, [big, small]) {
  const W = ctx.canvas.width;
  const H = ctx.canvas.height;
  drawBoard(ctx, W, H);
  // 縁の内側に収める。左右は広めに空ける(彫り縁に字が触ると窮屈に見える)
  const maxW = W * 0.80;
  if (big) {
    const px = fitPx(
      (p) => {
        ctx.font = `700 ${p}px ${SIGN_FONT}`;
        return lineWidth((ch) => ctx.measureText(ch).width, big, p, TRACK_BIG);
      },
      maxW, H * (small ? 0.46 : 0.60),
    );
    drawLine(ctx, big, { cx: W / 2, cy: H * (small ? 0.40 : 0.5), px, track: TRACK_BIG });
  }
  if (small) {
    const px = fitPx(
      (p) => {
        ctx.font = `600 ${p}px ${SIGN_FONT}`;
        return lineWidth((ch) => ctx.measureText(ch).width, small, p, TRACK_SMALL);
      },
      W * 0.72, H * 0.21,
    );
    drawLine(ctx, small, { cx: W / 2, cy: H * 0.755, px, track: TRACK_SMALL, weight: 600 });
  }
}
