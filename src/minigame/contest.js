// 釣り大会の順位づけと、結果の読み取り。
//
// 進行そのものはサーバー(src/minigame/meet/fishing-contest.js)が持っていて、順位も
// あちらが決めて配る。ここに置いてあるのは、**同じ数え方を両側で使うため** ──
// サーバーが view() を作るときにも、クライアントが「自分は優勝したか」を
// 見るときにも、この1本を通す。
//
// DOM も 3D も使わないので node --test でそのまま押さえられる。実績と称号が
// 付く判定なので、いちばん間違えたくないところ。

// 同着は同じ順位にする(競技順位: 1, 1, 3)。
//
// 並べ替えの決着(合計 → 大物 → 席番号)と、順位そのものは別もの。
// 席番号は「表に並べる順」を決めるためだけのもので、これで順位まで
// 割ってしまうと、まったく同じ釣果でも席が若いほうだけが優勝になる。
// ahead(r, o) は「o は r より上か」。決着が付かない者どうしが同率になる。
export function placeBy(rows, ahead) {
  return rows.map((r) => ({ ...r, place: 1 + rows.filter((o) => ahead(r, o)).length }));
}

// 逃げきった人は、捕まった人より必ず上。時間だけで比べると、捕まった
// 直後に回が終わったとき「捕まった人と逃げきった人が同率」になってしまう
// (最後のひとりになった回では必ずそうなる)。
// 同じ側どうしなら、長く生き残ったほうが上 ── 秒でまるめて同着は同率にする。
//
// **丸太乗りも同じ形**(残っているか → 残った時間)なので、この式を共有する。
export const huntAhead = (r, o) => (o.alive && !r.alive)
  || (!!o.alive === !!r.alive && Math.round(o.ms / 1000) > Math.round(r.ms / 1000));

// 生き残りで competing する遊び。順位も記録の単位も同じ扱いにする
const SURVIVAL = new Set(['dragonhunt', 'logroll']);

// 竜から逃げる向き(+Z を 0 とした角)。
//
// **まっすぐ逃げるだけではない。** 竜は曲がるのが下手なので(dragon-hunt.js
// の TURN_RATE)、少し斜めに逃げるほうが振り切れる ── side でどちら側へ
// 回り込むか、skill でどれだけ振るかが決まる。
//
// **CPU(meet/cpu.js)とあそびかたデモの自動運転が、同じここを通る。**
// 逃げ方を2か所に書くと、デモだけ下手に逃げて「説明しているとおりに
// やっているのに、いちばん先に捕まる動画」になる(実際そうなっていた)。
export function fleeFace(x, z, dragon, side = 1, skill = 0.8) {
  return Math.atan2(x - dragon.x, z - dragon.z) + side * skill * 0.6;
}

// 逃げ先を選ぶ。**島の形を見て選ぶ**ところが fleeFace との違い。
//
// ok(x, z) が「そこを歩けるか」。島の形は呼ぶ側が持っているので、ここは
// predicate として受け取る(この1本を node のテストから直に測れる)。
//
// **「逆向きに一番近い、歩ける向き」ではだめだった。** それだと岸に沿って
// 走り、行き止まりの岬に入って捕まる ── 実測で、竜の島の短編は
// 13〜31 秒で袋小路に追い込まれて捕まっていた(CPU も同じ癖を持つが、
// 説明の動画で真っ先に捕まる人を映すわけにいかない)。
//
// だから候補ごとに**どこまで歩けるか(reach)**を測り、
//   「行き止まりでない」×「竜から遠ざかる」
// のいちばん良いところを選ぶ。戻り値は向き(+Z を 0 とした角)、
// どこへも歩けないなら null。
const FLEE_RAYS = 24;          // 見る向きの数
const FLEE_STEP = 0.5;         // どこまで歩けるかを測る刻み
const FLEE_MAX = 3.5;          // これ以上先は見ない(島がそれほど広くない)
const FLEE_MIN = 0.8;          // これだけも歩けない向きは候補にしない
// 「行き止まりでない」ことの重み。**頭打ちにする** ── これだけ歩ける道が
// あれば十分で、そこから先は竜との距離で決めたい。頭打ちにしないと、
// 島のいちばん広いほうへ走るだけになって、竜に向かって走ることがある。
const FLEE_ENOUGH = 2.2;
const FLEE_OPEN = 2;
export function fleePick(x, z, dragon, ok, { side = 1, skill = 0.8 } = {}) {
  const want = dragon ? fleeFace(x, z, dragon, side, skill) : null;
  let best = null;
  for (let i = 0; i < FLEE_RAYS; i += 1) {
    const a = (i / FLEE_RAYS) * Math.PI * 2;
    const sn = Math.sin(a);
    const c = Math.cos(a);
    let reach = 0;
    for (let d = FLEE_STEP; d <= FLEE_MAX + 1e-9; d += FLEE_STEP) {
      if (!ok(x + sn * d, z + c * d)) break;
      reach = d;
    }
    if (reach < FLEE_MIN) continue;
    // 竜からどれだけ離れられるか。**行ける範囲の中で**測る ── 行き止まりの
    // 先を当てにすると、そこへ走り込んで壁ぎわで捕まる
    const step = Math.min(reach, 2);
    const gain = dragon
      ? Math.hypot(x + sn * step - dragon.x, z + c * step - dragon.z)
      : 0;
    // 逃げたい向き(fleeFace)に近いほど良い、も少しだけ効かせる
    const along = want == null ? 0 : Math.cos(a - want) * 0.4;
    const score = gain + Math.min(reach, FLEE_ENOUGH) * FLEE_OPEN + along;
    if (!best || score > best.score) best = { a, score };
  }
  return best ? best.a : null;
}

// 釣り大会の順位。合計 → いちばん大きい1匹、で決着が付かなければ同率。
export function placeOf(rank) {
  return placeBy(rank, (r, o) => o.cm > r.cm || (o.cm === r.cm && o.best > r.best));
}

// 蛮族を射る大会の順位。撃退した点 → 凌いだ波。
// 全員が同じ波を迎え撃つ(種はサーバーが配る)ので、点がそのまま腕前になる。
// 同点なら「先の波まで凌いだ」ほうが上 ── 浜を破られずに長く立っていた側。
export const raidAhead = (r, o) => o.score > r.score
  || (o.score === r.score && o.wave > r.wave);

// view は FishingContest#view() が返すもの。seat は自分の席。
// 戻り値: { entered, won, score, place }
//   entered … その回に出ていたか(途中から見ていただけなら false)
//   won     … 優勝したか(同率優勝も優勝)
//   score   … 自分の記録(釣りは合計 cm、竜は生き残った秒)
//   place   … 自分の順位(出ていなければ 0)
export function contestOutcome(view, seat) {
  const rank = view?.rank ?? [];
  // 大富豪だけは順位を数え直さない。**順位は「札を出し切った順」**で、
  // 配られた行の中身(残り枚数)からは作れない ── サーバーが上がった順に
  // 並べて place を入れてくれているので、それをそのまま使う。
  if (view?.kind === 'daifugo') {
    const me = rank.find((r) => r.seat === seat);
    if (!me) return { entered: false, won: false, score: 0, place: 0 };
    // ひとりしか残らなかった回は優勝にしない(ほかの遊びと同じ)
    if (rank.length < 2) return { entered: true, won: false, score: 0, place: me.place };
    // 記録は「大富豪になった卓の大きさ」。負けた回は 0 にする ──
    // 「何人抜いたか」にすると、5人卓の2位が4人卓の1位より上に残って
    // 「大きい卓で1番になった」の記録として使えなくなる。
    return {
      entered: true,
      won: me.place === 1,
      score: me.place === 1 ? rank.length : 0,
      place: me.place,
    };
  }
  // サーバーが place を入れて配っているが、ここでも数え直す ── 古い版の
  // サーバーが繋がっていても、優勝の判定だけは自前で決められるように。
  const rows = SURVIVAL.has(view?.kind)
    ? placeBy(rank, huntAhead)
    : view?.kind === 'raid'
      ? placeBy(rank, raidAhead)
      : placeOf(rank);
  // 席が無い(まだ入っていない)なら find は空振りする。null を別に見なくてよい
  const me = rows.find((r) => r.seat === seat);
  if (!me) return { entered: false, won: false, score: 0, place: 0 };
  // ひとりしか残らなかった回は優勝にしない ── 相手が抜けた瞬間に称号が
  // 付くと、勝った気がまるでしない。
  if (rank.length < 2) return { entered: true, won: false, score: 0, place: me.place };
  if (view?.kind === 'dragonhunt') {
    // 逃げきった人だけが勝ち。全員捕まった回に「いちばん長く粘った人」を
    // 勝ちにすると、逃げきる実績が逃げきらなくても取れてしまう。
    return {
      entered: true, won: !!me.alive, score: Math.round(me.ms / 1000), place: me.place,
    };
  }
  if (view?.kind === 'logroll') {
    // **最後まで残った人が勝ち。** 竜と違って「逃げきり(alive)」は条件に
    // しない ── 丸太は終盤に歩きより速くなるので、たいていは全員が落ちて
    // 回が終わる。それでも「いちばん長く乗っていた人」が勝ち。
    return {
      entered: true, won: me.place === 1, score: Math.round(me.ms / 1000), place: me.place,
    };
  }
  if (view?.kind === 'raid') {
    // 1点も取れなかった回は優勝にしない(釣りと同じ考え方)
    return {
      entered: true, won: me.score > 0 && me.place === 1, score: me.score, place: me.place,
    };
  }
  // 誰も釣れなかった回も優勝にしない
  const won = me.cm > 0 && me.place === 1;
  return { entered: true, won, score: me.cm, place: me.place };
}
