// 棒人間の姿勢(関節の角度)の計算。
//
// THREE を使わず、数値だけを返す。walker.js がこれをメッシュに流し込む。
//
// **どの姿勢も同じ項目を全部返すのが約束。** 1つでも欠けると、前の姿勢で
// 入れた値がそのまま残り続ける ── 実際、海に落ちたあと足の開き(rootZ)を
// 歩く姿勢が書き戻しておらず、上がってきても足が交差したままになっていた。
// test/minigame.test.js が「全ての姿勢の項目が揃っていること」を見ている。

// s は各姿勢の中で左右の符号にも使っている名前なので、別名で取り込む
import { s as sc, HIP_Y, THIGH, SHIN, SOLE_DROP, SOLE_AHEAD } from './scale.js';
// 「寄せる」曲線は motion.js と同じものを使う(両端で速度 0)。
// motion.js は pose.js を読まないので、輪にはならない。
import { ease01 } from './motion.js';

const JOINT = (x = 0, y = 0, z = 0) => ({ x, y, z });
// 体全体の上下(タイル単位)。下げる向きが負。
// **足を地面に着けるために要る** ── 脚を θ 振ると足先は L(1-cosθ) だけ
// 上がるので、腰を同じだけ下げないと体が浮く(下の walkPose を見よ)。
const LIFT = (v = 0) => v;
const LIMB = (rootX = 0, rootZ = 0, knee = 0) => ({ rootX, rootZ, knee });
// 口。0 = にっこり / 1 = 「お」の口(驚き)
const MOUTH = (open = 0) => ({ open });

// ---- 歩幅 ----
//
// **1歩で進む距離を、足が前後に振れる幅に合わせる。**
// ここがずれると、足が地面を擦って進む ──「歩いていない、滑っている」に見える。
//
// 位相の進みを距離ではなく決め打ちの係数(5.2)にしていたため、棒人間を
// ×0.5 に縮めたときに脚だけが半分になり、1歩で進む距離が足の振れ幅の
// **8.8 倍**になっていた(実測)。脚の長さから引くようにして、縮尺を
// 変えても比が動かないようにする。
export const LEG_SWING = 0.78;   // 腰の振り(ラジアン)。大きいほど大股

// 脚の長さ(腰の高さ)。振ったときの足先の上下も、前後の移動もこれで決まる。
export const LEG_LEN = sc(HIP_Y);

// ---- 足の裏がどこに来るか ----
//
// 腰 →(rootX 回す)→ 太もも →(さらに knee 回す)→ すね → 足首 → 靴の裏。
// body.js の組み立てとまったく同じ順で辿る(寸法は scale.js が持っている)。
//
// **見た目の位置を数で出せることが要る。** 「脚を θ 振ると足は L(1-cosθ)
// 上がる」で済ませようとしたが、靴が足首より前と下に付いているぶんが
// 抜けていて、実機で測ると接地しているはずの足が 0.012 も上下していた。
// 当てずっぽうをやめて、本物のつなぎ目をそのまま計算する。
const rotX = (y, z, a) => ({
  y: y * Math.cos(a) - z * Math.sin(a),
  z: y * Math.sin(a) + z * Math.cos(a),
});

// 腰を原点としたときの足の裏。y は下が負、z は前が正。
export function solePos(rootX, knee) {
  const hip = rotX(-sc(THIGH), 0, rootX);
  const foot = rotX(-sc(SHIN) - sc(SOLE_DROP), sc(SOLE_AHEAD), rootX + knee);
  return { y: hip.y + foot.y, z: hip.z + foot.z };
}

// 足の裏の、地面からの高さ(腰が LEG_LEN の高さにあるとして)
export const soleHeight = (rootX, knee) => LEG_LEN + solePos(rootX, knee).y;

// 足が1歩で前後に動く距離。腰を ±LEG_SWING 振ったときの足先の移動量。
export const FOOT_TRAVEL = 2 * LEG_LEN * Math.sin(LEG_SWING);

// 1歩で進む距離を、足の振れ幅の何倍まで許すか。
// 1.0 なら足はぴたりと地面に留まるが、この体格でこの速さ(脚の長さの
// 16 倍/秒)だと秒 11 歩になって脚が見えなくなる。
//
// **3 倍にしていたら、進んだ距離の 93% を足が滑っていた**(実測)。
// 1.8 倍まで詰めて 44% に落とした。
//
// **ここは速さと脚の長さの釣り合いの話。** これ以上詰めると歩数が増え、
// 歩数が増えると体の沈む回数も増えて、今度は画面が振動して見える
// (秒 6.4 回で「ガクガクして疲れる」と言われた)。歩数のほうは
// 歩く速さで抑えてある(motion.js の WALK_SPEED を 1.9 → 1.25)。
export const STEP_SLIP = 1.8;
export const STEP_DIST = FOOT_TRAVEL * STEP_SLIP;

// 進んだ距離 → 歩行サイクルの位相。1歩(左右のどちらか)が π。
export const PHASE_PER_UNIT = Math.PI / STEP_DIST;

// 膝の曲げ。**曲げるのは「前へ振り出している最中」の脚だけ。**
//
// もとは足の**位置**(後ろにあるか)で決めていたが、それだと 1/4 周ずれる。
// 振り出しかどうかは位置ではなく**動く向き**で決まるので、rootX を
// 微分して符号を見る。
//
// **向きの取り違えに注意。** この骨格は rootX が正のとき足が**後ろ**へ行く
// (根が -Y に垂れていて、X 軸まわりの正回転で足先が -Z = 後ろへ回る)。
// rootX = sin(t) なので、足が後ろへ動く(= 接地して体を送り出す)のは
// cos(t)·s > 0 のあいだ。膝を曲げるのはその**逆**の半周。
// 実測で確かめること ── 符号を1つ取り違えると、接地した足が前へ滑る
// いちばん見苦しい歩きになる(実際そうなっていた)。
//
// **速さで浅くしない。** 浅くすると、ゆっくり歩くときに振り出した足が
// 地面すれすれを通り、どちらの足が接地しているのか決まらなくなる ──
// 実測で、遅いと滑りが 32% から 100% に戻っていた。
// 1歩の形は速さで変えず、速さは歩数が受け持つ。
const kneeOf = (t, s) => Math.max(0, -Math.cos(t) * s) * 0.9;

// 沈みをどれだけ効かせるか。1.0 で足がぴったり地面に着く。
//
// **少しだけ浅くしてある。** ぴったりだと沈みが背丈の 7.1% になり、
// 人の歩き(5% 前後)より深い ── 歩数と合わさって画面が疲れる。
// 0.7 で 5.0% に収まり、引き換えに接地している足が最大 0.005 だけ浮く
// (直す前は 0.024 浮いていたので、そこへ戻るわけではない)。
export const BOB_KEEP = 0.7;

// 歩き。手足を交互に振る。
// **体は1歩ごとに沈む**(lift)── 脚を振ると足が浮くので、そのぶん下げないと
// 宙に浮いて滑って見える。カメラは motion の座標を追っているので画面は揺れない。
export function walkPose(phase, gait, facing) {
  const t = phase;
  // **振り幅は速さで縮めない。** 縮めると、ゆっくり歩くほど歩幅だけが
  // 小さくなって滑りが増える ── 実測でも遅いほど悪く(93% → 98%)なっていた。
  // 速さは歩数(位相の進み)が受け持つので、1歩の形は変えない。
  const swingAmp = LEG_SWING;
  const angle = Math.sin(t) * swingAmp;
  return {
    group: JOINT(0, facing, 0),
    mouth: MOUTH(0),
    // **低いほうの足が地面に着くように、体ごと下げる。**
    // これが無いと体が宙に浮き、足は1周に2度そっと触れるだけになる
    // (実測: 1周 16 コマのうち、接地していたのは 2 コマだけ)。
    // 結果として腰は1歩に1回沈む ── 歩きの上下動はこれで自然に出る。
    lift: LIFT(-BOB_KEEP * Math.min(
      soleHeight(angle, kneeOf(t, 1)),
      soleHeight(-angle, kneeOf(t, -1)),
    )),
    // 走るほど前傾する(それらしく見せるのはこれだけで足りる)
    hips: JOINT(gait * 0.12, 0, 0),
    chest: JOINT(0, 0, 0),
    head: JOINT(0, 0, 0),
    // 脚: 交互に振る(膝の曲げは kneeOf)
    legs: [0, 1].map((i) => {
      const s = i === 0 ? 1 : -1;
      return LIMB(Math.sin(t) * s * swingAmp, 0, kneeOf(t, s));
    }),
    // 腕: 脚と逆位相
    arms: [0, 1].map((i) => {
      const s = i === 0 ? -1 : 1;
      const swing = Math.sin(t) * s;
      return LIMB(
        swing * 0.7 * gait,
        s * 0.14,
        0.25 + Math.max(0, swing) * 0.4 * gait,
      );
    }),
  };
}

// 空中(ジャンプ)。上りは膝を抱えて縮み、下りは脚を伸ばして着地に備える。
// vy の符号だけで上り下りが分かるので、それを -1〜1 に均して混ぜる。
export function airPose(vy, facing) {
  const up = Math.max(-1, Math.min(1, vy / 2));  // +1 上昇 / -1 落下
  const tuck = Math.max(0, up);
  const drop = Math.max(0, -up);
  return {
    group: JOINT(0, facing, 0),
    lift: LIFT(0),
    mouth: MOUTH(1),   // 跳んでいる間は「お」
    hips: JOINT(tuck * 0.3 - drop * 0.1, 0, 0),
    chest: JOINT(0, 0, 0),
    head: JOINT(0, 0, 0),
    legs: [0, 1].map((i) => {
      const s = i === 0 ? 1 : -1;
      return LIMB(-tuck * 0.85 + drop * 0.25 + s * 0.12, 0, tuck * 1.25 + drop * 0.1);
    }),
    // 腕は上へ。手足は下向きに垂れているので、真上に挙げるには約 180°(π)いる
    // ── ここを浅くすると「前へならえ」になってゾンビみたいに見える。
    // 落ちている間は横へ開く(バランスを取っている風に)。
    arms: [0, 1].map((i) => {
      const s = i === 0 ? -1 : 1;
      return LIMB(
        -2.95 + drop * 0.75,
        // 左右に開かないと、後ろから見たときに2本が重なって1本に見える
        s * (0.38 + drop * 0.5),
        0.2 + tuck * 0.3,
      );
    }),
  };
}

// 海へ落ちていく途中。回りながら手足をじたばたさせる。
export function tumblePose(spin, facing) {
  const t = spin * 2.4;
  return {
    group: JOINT(Math.sin(spin * 1.7) * 0.45, facing, spin),
    lift: LIFT(0),
    mouth: MOUTH(1),   // 落ちている間は「お」
    hips: JOINT(-0.25, 0, 0),
    chest: JOINT(Math.sin(t * 1.3) * 0.2, 0, Math.sin(t) * 0.12),
    head: JOINT(0.2, 0, 0),
    legs: [0, 1].map((i) => {
      const s = i === 0 ? 1 : -1;
      return LIMB(
        Math.sin(t + s * 1.6) * 0.85 - 0.2,
        s * 0.2,
        0.5 + Math.max(0, Math.sin(t * 1.2 + s)) * 0.7,
      );
    }),
    arms: [0, 1].map((i) => {
      const s = i === 0 ? -1 : 1;
      return LIMB(
        -2.2 + Math.sin(t * 1.5 + s * 2.1) * 1.1,
        s * (0.5 + Math.sin(t * 0.9) * 0.2),
        0.4 + Math.max(0, Math.sin(t * 1.4 + s * 2)) * 0.5,
      );
    }),
  };
}

// 水の中。もがくのをやめ、手足が水に押されて上へ流れる。
// ゆっくりした周期だけで動かす ── 速い動きを混ぜると水の重さが消える。
export function sinkPose(t, facing, spin) {
  return {
    group: JOINT(
      0.28 + Math.sin(t * 0.8) * 0.12,
      facing + spin * 1.2,
      Math.sin(t * 0.7) * 0.26,
    ),
    lift: LIFT(0),
    mouth: MOUTH(1),   // 水の中でも口は開いたまま
    hips: JOINT(-0.12 + Math.sin(t * 1.1) * 0.06, 0, 0),
    chest: JOINT(0.12, 0, Math.sin(t * 0.9) * 0.1),
    head: JOINT(-0.18, 0, 0),
    legs: [0, 1].map((i) => {
      const s = i === 0 ? 1 : -1;
      return LIMB(
        -0.35 + Math.sin(t * 0.9 + s) * 0.18,
        s * 0.22,
        0.45 + Math.sin(t * 0.8 + s) * 0.15,
      );
    }),
    arms: [0, 1].map((i) => {
      const s = i === 0 ? -1 : 1;
      return LIMB(
        -2.75 + Math.sin(t * 0.85 + s * 1.2) * 0.22,
        s * (0.55 + Math.sin(t * 0.7) * 0.12),
        0.3 + Math.sin(t * 0.75 + s) * 0.15,
      );
    }),
  };
}

// 釣り。竿は右手(arms[1])に付いていて、腕の角度がそのまま竿の角度になる。
//   腕の rotation.x は 0 で真下、-π/2 で前、-π で真上。
//   竿を前上がり 35° くらいに構えたいので -(π/2 + 0.6) あたりが基準。
//
// k: { phase, tension, reeling, burst, cast } ── fishing.js の view() から作る。
// 振り出したあと、構えへ戻すのにかける時間(投げにかかる時間を 1 とした割合)。
// 投げ(0.55 秒)に対して 0.45 = 0.25 秒。**ここを 0 にすると元の不具合に戻る**
// ── 振り出しきった姿勢から構えへ 1 コマで落ちる。
export const CAST_RECOVER = 0.45;
// 「投げていない」を表す進み具合。振り出しも戻りも終わったところより先。
const NO_CAST = 1 + CAST_RECOVER + 1;

export function fishPose(t, facing, k = {}) {
  const phase = k.phase ?? 'wait';
  const tension = Math.max(0, Math.min(1, k.tension ?? 0));
  // 投げの進み具合。1.0 で浮きが落ちるが、**そこで切らない**
  // (CAST_RECOVER のぶんだけ伸ばして、振り出したあとの戻りに使う)。
  //
  // **渡されないときは「投げ終わったあと」**。0 にしてはいけない ──
  // 0 は「これから振りかぶる」なので、竿を後ろへ 0.75 引いた姿勢になる。
  // 散策部屋で他の人の釣りを描くとき(remote-view.js)は cast を渡さないので、
  // ここを 0 にしていたら相手だけ竿を担いだまま止まって見えていた。
  const cast = Math.max(0, k.cast ?? NO_CAST);
  const fighting = phase === 'fight';
  const sway = Math.sin(t * 1.3) * 0.02;   // 待っている間のわずかな揺れ

  // 釣り終わり。糸はもう水にない ── 竿を水につけたままの構えで
  // 「もう一度」を出すと、まだ釣っている最中に見える。
  const landed = phase === 'landed';
  const lost = phase === 'lost';
  const done = landed || lost;
  const bob = landed ? Math.sin(t * 6) * 0.05 : 0;   // 釣れた喜びの弾み

  // 投げる動作: いったん後ろへ振りかぶり、勢いよく前へ振り出し、**戻す**。
  //
  // **「投げ終わり」で切らない。** もとは段(cast → wait)が変わった瞬間に
  // 振り出しきった姿勢(swing = -0.5)から 0 へ落としていた。竿先が1コマで
  // 0.15 単位 ── 身長の 1/3 ── 飛び、そこで動きがぶつりと途切れて見えた
  // (「沖に投げた直後と構えてる場面の間の切り替えが途切れて見える」)。
  // 振り出したあとは同じ曲線のまま構えへ戻す。
  const back = Math.max(0, 1 - cast / 0.35);
  const fwd = cast <= 1
    ? Math.max(0, (cast - 0.35) / 0.65)          // 振り出し
    : 1 - ease01((cast - 1) / CAST_RECOVER);      // 戻し(止まりぎわも緩める)
  const swing = back * 0.75 - fwd * 0.5;

  // アタリの瞬間は竿先がぐっと入る
  const bite = phase === 'bite' ? Math.sin(t * 22) * 0.09 : 0;
  // 暴れている間は竿ごと揺さぶられる
  const shake = k.burst ? Math.sin(t * 34) * 0.07 : 0;
  // 巻いている間は少し踏ん張る
  const hold = fighting ? tension * 0.55 + (k.reeling ? 0.1 : 0) : 0;

  // 竿の角度。釣れたら立てて掲げ、逃げられたら下ろす
  const rodBase = landed ? -2.85 + bob
    : lost ? -1.15
      : -(Math.PI / 2 + 0.6);
  const rodX = rodBase - swing - hold * 0.5 + bite + shake + sway;

  return {
    group: JOINT(0, facing, 0),
    lift: LIFT(0),
    // 大物と格闘している間と、釣れた瞬間は口が開く
    mouth: MOUTH((fighting && tension > 0.55) || landed ? 1 : 0),
    // 引かれるぶんだけ体を反らす。逃げられたら前へうなだれる
    hips: JOINT(
      -hold * 0.5 - swing * 0.2 - bob * 0.6 + (lost ? 0.2 : 0),
      0, 0,
    ),
    chest: JOINT(-hold * 0.25 + shake * 0.3 + (lost ? 0.18 : 0), 0, sway * 2),
    head: JOINT(0.14 + hold * 0.2 + (lost ? 0.4 : 0) - (landed ? 0.3 : 0), 0, 0),
    // 足は少し前後に開いて踏ん張る。引かれるほど深く。
    // 終わったら揃えて立つ(踏ん張ったままだと、まだ格闘中に見える)
    legs: [0, 1].map((i) => {
      const s = i === 0 ? 1 : -1;
      if (done) return LIMB(s * 0.1, s * 0.11, 0);
      return LIMB(s * (0.22 + hold * 0.35), s * 0.13, Math.max(0, s) * (0.2 + hold * 0.5));
    }),
    arms: [0, 1].map((i) => {
      // 右手(1)が竿。左手(0)は下を支え、巻くときはハンドルを回す
      if (i === 1) return LIMB(rodX, 0.22, 0.12 + hold * 0.35);
      // 釣れたら左手を上げて喜び、逃げられたら垂らす
      if (landed) return LIMB(-2.6 + bob * 2, -0.5, 0.35);
      if (lost) return LIMB(-0.2, -0.16, 0.15);
      const crank = k.reeling ? Math.sin(t * 11) * 0.45 : 0;
      return LIMB(-1.45 - hold * 0.3 + crank * 0.35, -0.3, 0.75 + crank);
    }),
  };
}

// 段が変わったとき、直前の姿勢から混ぜる時間(秒)。
//
// **段の切り替えは、そのままだと1コマで姿勢が飛ぶ。** 実測で、竿先が
// 1コマに動く距離は(ふだんは 0.0001〜0.007 なのに):
//   待ち → アタリ 0.015 / アタリ → 取り込み 0.029 / 取り込み → 釣果 0.088
// 釣果の 0.088 は身長の 1/5。魚を持ち上げるのではなく、瞬間移動して見える。
//
// **アタリだけ短い。** 竿がぐっと入るのが「いま合わせろ」の合図なので、
// なまらせると合図として弱くなる。飛んで見えない程度に留める。
const FISH_BLEND = { bite: 0.07, default: 0.18 };
// これ以下の段差しかないなら混ぜない(ラジアン ≒ 1.1°)。
// **混ぜること自体にも動きがある** ── 重みの立ち上がりが素の動きに乗るので、
// もともと繋がっている切り替わり(投げ → 待ち)まで混ぜると、かえって速く
// なる(実測 0.049 → 0.073 ラジアン/コマ)。段差があるときだけ効かせる。
const FISH_GAP = 0.02;

// 2つの姿勢の、いちばん大きい関節の差(ラジアン)。
// 「段は変わったが姿勢はほとんど同じ」を見分けるのに使う。
export function poseGap(a, b) {
  if (!a || !b) return Infinity;
  let g = Math.abs((a.lift ?? 0) - (b.lift ?? 0));
  const j = (x, y) => {
    g = Math.max(g, Math.abs(x.x - y.x), Math.abs(x.z - y.z));
  };
  j(a.group, b.group); j(a.hips, b.hips); j(a.chest, b.chest); j(a.head, b.head);
  for (const part of ['legs', 'arms']) {
    for (let i = 0; i < 2; i++) {
      const x = a[part][i]; const y = b[part][i];
      g = Math.max(g,
        Math.abs(x.rootX - y.rootX), Math.abs(x.rootZ - y.rootZ), Math.abs(x.knee - y.knee));
    }
  }
  return g;
}

// 釣りの姿勢の「つなぎ」。段が変わるたびに、**直前に描いた姿勢**から混ぜる。
// 混ぜる元は生の姿勢ではなく直前の出力 ── 混ぜている途中でまた段が
// 変わったとき(アタリ → 取り込みは 1 秒とかからない)に、そこで飛ぶ。
//
// 状態を持つのはここだけにして、walker.js は呼ぶだけにしてある
// (THREE を読まないので node --test から直接試せる)。
export function fishPoseBlender() {
  let phase = null; let from = null; let last = null; let at = 0;
  return {
    // 竿を出し直したとき(= 新しく釣り始めたとき)に呼ぶ。
    // 前回の釣りの終わりの姿勢から混ざらないように。
    reset() { phase = null; from = null; last = null; at = 0; },
    pose(t, facing, k = {}) {
      const now = fishPose(t, facing, k);
      const ph = k.phase ?? 'wait';
      if (ph !== phase) {
        // **段が変わった「せい」で飛ぶ量を測る。** 同じ時刻・同じ引き具合で
        // 前の段の姿勢を出して比べる ── 直前のコマと比べてしまうと、
        // ふだんの動き(投げの振りかぶりは1コマ 0.065)まで段差に見える。
        // last が無いのは竿を出した最初のコマで、混ぜる元がそもそもない。
        const was = phase == null || !last
          ? null : fishPose(t, facing, { ...k, phase });
        from = poseGap(was, now) > FISH_GAP ? last : null;
        at = t; phase = ph;
      }
      const w = from ? (t - at) / (FISH_BLEND[ph] ?? FISH_BLEND.default) : 1;
      last = w >= 1 ? now : blendPose(from, now, ease01(w));
      return last;
    },
  };
}

// ---- 弓を構える(蛮族を射る)----

// draw は引き絞り(0〜1)。0 でも構えている(弓を前へ出している)ので、
// 「持っているだけ」には見えない ── 弓は下げていると棒にしか見えない。
export function aimPose(t, facing, draw = 0) {
  const k = Math.max(0, Math.min(1, draw));
  const sway = Math.sin(t * 1.1) * 0.02;       // 構えたままの呼吸
  // 引き絞るほど、震えが増して肩に力が入る
  const strain = Math.sin(t * 26) * 0.02 * k;
  return {
    group: JOINT(0, facing, 0),
    lift: LIFT(0),
    mouth: MOUTH(k > 0.75 ? 1 : 0),            // 満まで引くと口が開く
    hips: JOINT(0, 0, 0),
    // 左肩を的へ向ける(体を半身に開く)。引くほど深くひねる
    chest: JOINT(-0.05 - k * 0.06, -0.5 - k * 0.18, sway),
    head: JOINT(0.06, 0.5 + k * 0.18, 0),      // 顔だけ的へ戻す
    // 半身に開いた足。前足(0)を的のほうへ
    legs: [0, 1].map((i) => (i === 0
      ? LIMB(0.16, 0.13, 0.06)
      : LIMB(-0.14, -0.14, 0.18))),
    arms: [0, 1].map((i) => (i === 0
      // 左手(0)が弓。まっすぐ前へ伸ばす。肘は伸ばしきる
      ? LIMB(-Math.PI / 2 + 0.05 + strain, -0.18, 0.02)
      // 右手(1)が弦。引くほど後ろへ引きつける
      : LIMB(-Math.PI / 2 + 0.1 - k * 0.15 + strain, 0.2 + k * 0.5, 0.35 + k * 1.15))),
  };
}

// 円卓に着いて座っている姿勢。
//
// 腰の高さ(HIP_Y)がそのまま腰かけの座面の高さなので、**体は下げない**
// ── 太ももを前へ倒せば、足が前に投げ出されて腰かけに座った形になる。
// 下げてしまうと、代わりに足が地面へめり込む。
//
// 手は卓の上へ。何もしていないと「立ち止まっているだけ」に見えるので、
// ゆっくりした呼吸と、たまの傾ぎだけ入れてある。
export function sitPose(t, facing) {
  const breathe = Math.sin(t * 1.5) * 0.025;
  const lean = Math.sin(t * 0.37) * 0.05;   // ときどき体を傾ける
  return {
    group: JOINT(0, facing, 0),
    lift: LIFT(0),
    mouth: MOUTH(0),
    hips: JOINT(0, 0, 0),
    chest: JOINT(0.10 + breathe, lean, 0),
    head: JOINT(-0.10 - breathe, -lean * 0.6, 0),
    // 太ももを前へ倒し、ひざから下を落とす(腰かけの高さに合う)
    legs: [0, 1].map((i) => LIMB(-1.42, (i === 0 ? 1 : -1) * 0.12, 1.30)),
    // 腕は卓の上に軽く置く。ひじを曲げて手を前へ
    arms: [0, 1].map((i) => LIMB(-0.95 + breathe, (i === 0 ? -1 : 1) * 0.30, 0.80)),
  };
}

// ---- エモート ----

// 何もしていない立ち姿。エモートの出入りはここへ戻る。
function standPose(facing) {
  return {
    group: JOINT(0, facing, 0),
    lift: LIFT(0),
    mouth: MOUTH(0),
    hips: JOINT(0, 0, 0),
    chest: JOINT(0, 0, 0),
    head: JOINT(0, 0, 0),
    legs: [0, 1].map((i) => LIMB(0, (i === 0 ? 1 : -1) * 0.1, 0)),
    arms: [0, 1].map((i) => LIMB(0, (i === 0 ? -1 : 1) * 0.16, 0.12)),
  };
}

// 2つの姿勢を混ぜる。k=0 で a、k=1 で b。
// エモートの出入りをこれで滑らかにする ── 立ち姿からいきなり万歳の角度に
// 飛ぶと、1フレームで腕がワープして「バグ」に見える。
// 項目を全部たどるので、pose に項目を足しても直さなくてよい。
export function blendPose(a, b, k) {
  const t = Math.max(0, Math.min(1, k));
  const mix = (x, y) => x + (y - x) * t;
  const joint = (x, y) => JOINT(mix(x.x, y.x), mix(x.y, y.y), mix(x.z, y.z));
  return {
    // 向きは混ぜない(同じ値が入っている。回り込みで暴れるのを避ける)
    group: JOINT(mix(a.group.x, b.group.x), b.group.y, mix(a.group.z, b.group.z)),
    // 口は開いているか閉じているかの2択。混ぜられないので近いほうを採る
    mouth: MOUTH(t < 0.5 ? a.mouth.open : b.mouth.open),
    lift: LIFT(mix(a.lift ?? 0, b.lift ?? 0)),
    hips: joint(a.hips, b.hips),
    chest: joint(a.chest, b.chest),
    head: joint(a.head, b.head),
    legs: [0, 1].map((i) => LIMB(
      mix(a.legs[i].rootX, b.legs[i].rootX),
      mix(a.legs[i].rootZ, b.legs[i].rootZ),
      mix(a.legs[i].knee, b.legs[i].knee),
    )),
    arms: [0, 1].map((i) => LIMB(
      mix(a.arms[i].rootX, b.arms[i].rootX),
      mix(a.arms[i].rootZ, b.arms[i].rootZ),
      mix(a.arms[i].knee, b.arms[i].knee),
    )),
  };
}

// 出入りの重み。始めと終わりの RAMP のあいだだけ、立ち姿と混ぜる。
const RAMP = 0.14;
function rampWeight(k) {
  if (k <= 0 || k >= 1) return 0;
  return Math.min(1, Math.min(k, 1 - k) / RAMP);
}

// 腕の rootX は 0 で真下、-π/2 で前、-π で真上(pose.js 全体の約束)。
function rawEmotePose(key, t, facing) {
  const base = standPose(facing);
  switch (key) {
    // 手をふる。右手(arms[1])を挙げて左右に振る
    case 'wave': {
      const swing = Math.sin(t * 7.5);
      return {
        ...base,
        head: JOINT(-0.06, 0, swing * 0.07),
        chest: JOINT(0, 0, swing * 0.05),
        arms: [
          LIMB(0.05, -0.18, 0.1),
          LIMB(-2.55, 0.5 + swing * 0.45, 0.25),
        ],
      };
    }
    // バンザイ。両手を挙げて、膝でその場を弾む
    case 'cheer': {
      const bounce = Math.max(0, Math.sin(t * 6.5));
      return {
        ...base,
        mouth: MOUTH(1),
        hips: JOINT(-0.1 - bounce * 0.05, 0, 0),
        head: JOINT(-0.22, 0, 0),
        legs: [0, 1].map((i) => LIMB(bounce * 0.12, (i === 0 ? 1 : -1) * 0.12, bounce * 0.3)),
        arms: [0, 1].map((i) => LIMB(-2.95, (i === 0 ? -1 : 1) * (0.34 + bounce * 0.1), 0.15)),
      };
    }
    // おじぎ。腰から折って、いったん止めてから戻す
    case 'bow': {
      // t は秒。0.45 秒かけて下げ、0.35 秒止め、残りで戻す
      const down = Math.min(1, t / 0.45);
      const up = Math.max(0, (t - 0.8) / 0.5);
      const bend = Math.max(0, down - up);
      return {
        ...base,
        hips: JOINT(bend * 1.0, 0, 0),
        chest: JOINT(bend * 0.18, 0, 0),
        head: JOINT(bend * 0.3, 0, 0),
        arms: [0, 1].map((i) => LIMB(bend * 0.3, (i === 0 ? -1 : 1) * 0.1, 0.08)),
      };
    }
    // 指さす。右手を前へ伸ばして、2度ほど押し出す
    case 'point': {
      const push = Math.max(0, Math.sin(t * 4.6)) * 0.14;
      return {
        ...base,
        chest: JOINT(0, 0.12, 0),
        head: JOINT(-0.04, 0.16, 0),
        arms: [
          LIMB(0.08, -0.18, 0.1),
          LIMB(-1.62 - push, 0.1, Math.max(0, 0.18 - push * 2)),
        ],
      };
    }
    // しょんぼり。うつむいてから、ゆっくり首を左右に振る。
    //
    // 腰から折ると「おじぎ」と見分けがつかなくなる ── 実際、最初は
    // どちらも腰を曲げていて「同じに見える」と言われた。
    // なので折るのは背中(chest)だけにして、腰はほとんど曲げない。
    // 項垂れている感じは、深くうつむいた頭を左右に振ることで出す。
    case 'sad': {
      const down = Math.min(1, t / 0.5);        // まずうつむく
      const shake = Math.sin((t - 0.5) * 4.0) * Math.min(1, Math.max(0, t - 0.5));
      return {
        ...base,
        // 体ごと少しひねる。後ろから見て動いていると分かるのはこれが一番強い
        group: JOINT(0, facing + shake * 0.22, 0),
        lift: LIFT(0),
        hips: JOINT(0.1, 0, shake * 0.05),
        // **横回転(y)だけでは、後ろから見て何も動かない。**
        // 頭は丸い球で、しかも回転の軸の上に載っているので、首をひねっても
        // 輪郭が1ピクセルも動かない ── 実際「全然振っているように見えない」
        // と言われた。上体を左右に倒す(z)ことで、頭と、垂れた両手が
        // 実際に横へ動く。振っていると分かるのはこの動きのほう。
        chest: JOINT(down * 0.38, shake * 0.14, shake * 0.5),
        head: JOINT(down * 0.5, shake * 0.6, shake * 0.22),
        legs: [0, 1].map((i) => LIMB(0, (i === 0 ? 1 : -1) * 0.05, down * 0.16)),
        // 腕は力なく前へ垂れ、首の動きに少し遅れてついてくる
        arms: [0, 1].map((i) => LIMB(
          down * 0.3 + shake * 0.05,
          (i === 0 ? -1 : 1) * 0.07,
          down * 0.24,
        )),
      };
    }
    default:
      return base;
  }
}

// エモートの姿勢。t は始めてからの秒数、k は 0〜1 の進み具合。
// 知らない key なら立ち姿(古い版の相手が新しい番号を送ってきたとき)。
export function emotePose(key, t, facing, k = 0.5) {
  const base = standPose(facing);
  return blendPose(base, rawEmotePose(key, t, facing), rampWeight(k));
}

// テストから使う: 姿勢が持つ項目の一覧(順序を揃えて比較できるように)。
// 中身を決め打ちせず、そのまま辿る ── 項目を増やしたときに
// ここを直し忘れて検査から漏れる、を防ぐため。
export function poseKeys(pose) {
  const keys = [];
  const walk = (obj, prefix) => {
    for (const k of Object.keys(obj).sort()) {
      const v = obj[k];
      if (Array.isArray(v)) v.forEach((e, i) => walk(e, `${prefix}${k}[${i}].`));
      else if (v && typeof v === 'object') walk(v, `${prefix}${k}.`);
      else keys.push(prefix + k);
    }
  };
  walk(pose, '');
  return keys;
}
