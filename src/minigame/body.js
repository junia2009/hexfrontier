// 棒人間の見た目(メッシュの組み立て)。
//
// 寸法は下の PROPS にまとめてある。ここを差し替えれば体型が変わるので、
// 比べながら決められる(walker.js は組み上がった関節だけを触る)。
//
// 関節の構成は pose.js が前提にしている形から変えないこと:
//   group → hips → (torso, chest, legs[].root → knee)
//   chest → (head, eyes, mouth, arms[].root → knee)

import * as THREE from 'three';
import { speciesById, DEFAULT_SPECIES } from './species.js';
import {
  WALK_SCALE, HIP_Y, THIGH, SHIN, SHOE_R, SHOE_LIFT, SOLE_AHEAD,
} from './scale.js';

const SKIN = 0xffd9a8;
const CLOTH = 0x2f6fd0;
const SHOE = 0x2b3550;
const EYE = 0x22242a;
const SHINE = 0xffffff;   // 目のハイライト
const BLUSH = 0xff8f9e;   // ほっぺ

// ---- 色を作る ----
//
// その人の色から「少しだけ違う色」を作って、体を一色でのっぺり塗らないようにする。
// 誰の色かは変えたくないので、色相はいじらず明るさだけ動かす。
//
// **明るくするか暗くするかは元の色で決める**。決め打ちで「暗く」にすると、
// もともと暗い色(紺のペンギン)では差が出ず、決め打ちで「明るく」にすると
// 白いひつじで差が出ない。明るい色は暗く、暗い色は明るくすれば必ず差が付く。
// **明るさは sRGB で測る**。three の色は内部でリニアに直されるので、
// 何も指定せず getHSL すると「見た目の明るさ」より暗い数字が返る
// (青 #2f6fd0 は見た目 0.50 なのにリニアでは 0.33)。しきい値を
// 見た目で決めたいので、どちらも sRGB を指定して読む。
const _c = new THREE.Color();
const _t = { h: 0, s: 0, l: 0 };
function lightness(hex) {
  return _c.setHex(hex, THREE.SRGBColorSpace).getHSL(_t, THREE.SRGBColorSpace).l;
}
// k だけ白(または黒)へ寄せた色。dir を渡さなければ元の明るさから自動で決める。
const DARK = 0.45;   // これより暗い色は「明るく」、明るい色は「暗く」ずらす
function tone(hex, k, dir = 0) {
  const up = dir !== 0 ? dir > 0 : lightness(hex) < DARK;
  const c = new THREE.Color().setHex(hex, THREE.SRGBColorSpace);
  return c.lerp(new THREE.Color(up ? 0xffffff : 0x000000), k).getHex(THREE.SRGBColorSpace);
}

// ずんぐりデフォルメ。頭が大きく首がなく、手はミトン、靴は大きめ。
// 「足元から頭のてっぺんまで」がタイル1枚(1.0)の半分くらいになるよう組む。
// 高さの積み上げ: hipY + chestY + headY + headR = 足元から頭のてっぺん。
// 胴が脚より下まで垂れると脚が隠れて寸詰まりに見えるので、
// 胴の下端(bodyY − bodyLen/2 − bodyR)が膝(−thigh)より上に来るようにする。
export const CUTE = {
  // 脚の長さを変えるときは hipY も同じだけ動かすこと。
  // 足首は hipY − thigh − shin なので、脚だけ縮めると靴が宙に浮く。
  hipY: HIP_Y,         // 腰の高さ(脚の付け根)。歩幅の計算に要るので scale.js に置いてある
  bodyR: 0.076,        // 胴の太さ
  bodyLen: 0.030,      // 胴の直線部(短くして豆のような形に)
  bodyY: 0.062,        // 胴の中心(腰から)
  chestY: 0.115,       // 首の位置(腰から)
  headR: 0.112,        // 頭。全身の 4 割ほどを頭にすると幼く見える
  // 頭を下げすぎると肩ごと胴を飲み込んで、頭に脚が生えたように見える。
  // 頭の下端が胴の上端より少し下、くらいで止める(首は作らない)。
  headY: 0.112,        // 頭の中心(首から)
  // 顔の寸法は**頭の半径に対する比**で持つ。すがたによって頭の大きさが
  // 違う(ひつじは小さい)ので、絶対値で置くと小さい頭から目がはみ出す。
  eye: { r: 0.235, x: 0.415, y: 0.03, z: 0.80 },
  // ハイライト。大きいのを上の外側、小さいのを下の内側に置くと目が丸く見える
  shine: { big: 0.34, small: 0.17, x: 0.33, y: 0.34 },
  // 頭に食い込ませる位置。球の表面は x=0.64・y=-0.16 のとき z=0.75 なので、
  // そこより内に置くと丸ごと埋まって見えなくなる
  blush: { r: 0.21, x: 0.64, y: -0.16, z: 0.74 },
  mouth: { r: 0.155, tube: 0.048, y: -0.32, z: 0.90 },
  // 肩は胴の外へ出す(bodyR + armR より内側だと腕が胴に埋まる)
  shoulder: { x: 0.094, y: 0.015 },
  // 腕は脚(thigh + shin)と同じくらいの長さに揃える。
  // 脚だけ詰めると腕が長く見えて、手が靴のそばまで垂れる。
  armR: 0.031, upperArm: 0.043, foreArm: 0.035, handR: 0.040,
  hipX: 0.050,         // 脚の間隔。近すぎると2本が1本に見える
  // 脚と靴の寸法は scale.js が持つ ── pose.js が足の裏の位置を出すのに要る
  legR: 0.036, thigh: THIGH, shin: SHIN,
  shoe: { r: SHOE_R, len: 0.042, lift: SHOE_LIFT, ahead: SOLE_AHEAD },
  // 釣り竿。手のさきから腕の延長方向(-Y)へ伸ばす。
  // 腕を前上がりに構えると、そのまま竿も前上がりになる。
  rod: { len: 0.42, r: 0.0055, grip: 0.05 },
  // 弓。竿と同じ手に持たせる(どちらも同時には出さない)。
  // 竿と違って**腕と直交**させる ── 腕の延長に持たせると、真横から見た
  // ときに弓が線にしか見えない。
  bow: { r: 0.085, thick: 0.006 },
};

// 手足1本。上下2節で、付け根から吊り下げる。
// end は手先/足先に付ける物(無くてもよい)。
//
// 分割数を上げてあるのは見た目のため ── 4×8 のカプセルは真横から見ると
// 輪郭が明らかに角張って、腕が「節のある棒」に見えていた。
// 継ぎ目に関節の玉を1つ入れるのも同じ理由で、上下の太さが違うぶん、
// 玉が無いと肘と膝がくびれて見える。
// lowMat を渡すと膝から下だけ色が変わる(きつねの靴下)。
// 既定値ではなく ?? で受けること ── 既定値は undefined にしか効かないので、
// 「靴下なし」を null で渡されると材質が null のメッシュができて、
// 描画時に material.visible を読んだところで落ちる。
function makeLimb(mat, upper, lower, thick, end, lowMat) {
  const low = lowMat ?? mat;
  const root = new THREE.Group();
  const upperMesh = new THREE.Mesh(new THREE.CapsuleGeometry(thick, upper, 6, 14), mat);
  upperMesh.position.y = -upper / 2;
  upperMesh.castShadow = true;
  root.add(upperMesh);

  const knee = new THREE.Group();
  knee.position.y = -upper;
  const joint = new THREE.Mesh(new THREE.SphereGeometry(thick * 1.02, 12, 10), low);
  joint.castShadow = true;
  knee.add(joint);
  const lowerMesh = new THREE.Mesh(
    new THREE.CapsuleGeometry(thick * 0.94, lower, 6, 14), low,
  );
  lowerMesh.position.y = -lower / 2;
  lowerMesh.castShadow = true;
  knee.add(lowerMesh);
  if (end) {
    end.position.y -= lower;
    knee.add(end);
  }
  root.add(knee);

  return { root, knee };
}

// 目。黒目1つ+ハイライト2つ。
//
// **ハイライトがいちばん効く**。同じ黒い球でも、白い点が2つ乗るだけで
// 「塗りつぶした穴」が「濡れた目」に変わる。大きいのを上の外側、小さいのを
// 下の内側に置くと、球に光が回り込んでいるように見える。
// ハイライトは陰に入っても消えないよう、光を受けない材質にする。
// rimMat を渡すと、黒目のうしろに一回り大きい明るい縁を敷く。
// 暗い顔(ひつじの黒い顔・紺のペンギン)では黒目が顔に溶けて、
// 顔のどこに目があるのか分からなくなる ── 縁があれば暗い顔でも目が立つ。
function makeEye(sx, e, sh, shineMat, eyeMat, rimMat) {
  const g = new THREE.Group();
  if (rimMat) {
    const rim = new THREE.Mesh(new THREE.SphereGeometry(e.r * 1.24, 16, 14), rimMat);
    rim.scale.set(0.92, 1, 0.5);
    rim.position.z = -e.r * 0.06;
    g.add(rim);
  }
  const ball = new THREE.Mesh(new THREE.SphereGeometry(e.r, 16, 14), eyeMat);
  ball.scale.set(0.9, 1, 0.66);
  g.add(ball);
  // 黒目の表面(z = r*0.66)より前に置いて、めり込ませず光の玉として見せる
  const spark = (r, x, y) => {
    const m = new THREE.Mesh(new THREE.SphereGeometry(e.r * r, 8, 8), shineMat);
    m.position.set(sx * e.r * x, e.r * y, e.r * 0.42);
    m.scale.set(1, 1, 0.6);
    return m;
  };
  g.add(spark(sh.big, sh.x, sh.y), spark(sh.small, -sh.x * 0.9, -sh.y));
  return g;
}

// ほっぺ。頭に少しだけ食い込ませて、レンズのように覗かせる。
// 透けさせない ── 暗い顔(ひつじ・ペンギン)だと透かしたピンクが濁って消える。
function makeBlush(sx, b, r, mat) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(r * b.r, 12, 10), mat);
  m.scale.set(1, 0.66, 0.34);
  m.position.set(sx * r * b.x, r * b.y, r * b.z);
  return m;
}

// 口。ふだんはにっこり、驚いたら「お」の口。
// 2つ作って切り替える(小さく映るので、形が変わったほうが分かりやすい)。
function makeMouth(mat, m) {
  const smile = new THREE.Mesh(
    new THREE.TorusGeometry(m.r, m.tube, 6, 16, Math.PI), mat,
  );
  smile.rotation.z = Math.PI;   // 半円の口角を上げる
  const open = new THREE.Mesh(new THREE.SphereGeometry(m.r * 0.62, 10, 8), mat);
  open.scale.set(0.85, 1, 0.5);
  for (const o of [smile, open]) o.position.set(0, m.y, m.z);
  open.visible = false;
  return { smile, open };
}

// 釣り竿。手のさきから腕の延長(-Y)へ伸ばすので、腕の角度がそのまま竿の角度になる。
// 先端に空の目印を置いてある ── 糸はそこから垂らす(fishing-fx.js)。
function makeRod(r) {
  const g = new THREE.Group();
  const wood = new THREE.MeshStandardMaterial({ color: 0x6b4a2a, roughness: 0.8 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x2b3550, roughness: 0.6 });

  // 竿。先へ行くほど細くする(円錐台)
  const rod = new THREE.Mesh(new THREE.CylinderGeometry(r.r * 0.35, r.r, r.len, 6), wood);
  rod.position.y = -r.len / 2;
  rod.castShadow = true;
  g.add(rod);

  // 握り。手のところだけ太くすると「持っている」ように見える
  const grip = new THREE.Mesh(new THREE.CylinderGeometry(r.r * 2, r.r * 2, r.grip, 6), dark);
  grip.position.y = -r.grip / 2;
  g.add(grip);

  // リール
  const reel = new THREE.Mesh(new THREE.CylinderGeometry(r.r * 3, r.r * 3, r.r * 3, 8), dark);
  reel.rotation.z = Math.PI / 2;
  reel.position.set(r.r * 3, -r.grip - r.r * 3, 0);
  g.add(reel);

  const tip = new THREE.Object3D();
  tip.position.y = -r.len;
  g.add(tip);

  return { group: g, tip };
}

// 弓。手のさきに、腕と直交する向きで持たせる。
// 弦は引き絞ると V 字にへこむので、真ん中の1点を上下の端とつないだ
// 3点の折れ線で作る(draw() でその1点だけ動かす)。
function makeBow(b) {
  const g = new THREE.Group();
  const wood = new THREE.MeshStandardMaterial({ color: 0x7a5a32, roughness: 0.75 });
  // 弓幹。細いトーラスの一部を弧にする
  const limb = new THREE.Mesh(
    new THREE.TorusGeometry(b.r, b.thick, 4, 14, Math.PI * 1.15), wood,
  );
  limb.rotation.z = -Math.PI * 0.575;   // 弧の開いた側を前(+Z)へ
  limb.castShadow = true;
  g.add(limb);

  // 弦。3点の折れ線(上端 → 引き点 → 下端)
  const pts = [
    new THREE.Vector3(0, b.r, 0),
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(0, -b.r, 0),
  ];
  const string = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints(pts),
    new THREE.LineBasicMaterial({ color: 0xe8e0cc }),
  );
  g.add(string);

  // 番えた矢。引いている間だけ出す
  const arrow = new THREE.Mesh(
    new THREE.CylinderGeometry(b.thick * 0.5, b.thick * 0.5, b.r * 2.2, 4),
    new THREE.MeshStandardMaterial({ color: 0x8a6a3a, roughness: 0.7 }),
  );
  arrow.rotation.x = Math.PI / 2;       // 前(+Z)へ向ける
  arrow.visible = false;
  g.add(arrow);

  // 引き絞り(0〜1)。弦と矢を後ろへ引く
  const draw = (k) => {
    const back = -b.r * 0.85 * Math.max(0, Math.min(1, k));
    pts[1].z = back;
    string.geometry.setFromPoints(pts);
    arrow.visible = k > 0.01;
    arrow.position.z = back + b.r * 1.1;
  };
  draw(0);
  return { group: g, draw };
}

// ミトンの手。指は作らない ── 小さく映るので、丸いほうが可愛く見える。
function makeHand(mat, r) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(r, 14, 12), mat);
  m.scale.set(1, 0.9, 0.95);
  m.castShadow = true;
  return m;
}

// 大きめの靴。横倒しのカプセルで、つま先が前(+Z)へ出る。
function makeShoe(mat, s) {
  const g = new THREE.Group();
  const m = new THREE.Mesh(new THREE.CapsuleGeometry(s.r, s.len, 6, 14), mat);
  m.rotation.x = Math.PI / 2;   // 縦のカプセルを寝かせる
  m.scale.set(1, 1, 0.78);      // 少し平たく
  m.position.set(0, s.lift, s.ahead);
  m.castShadow = true;
  g.add(m);
  return g;
}

// ---- すがたごとの飾り(species.js の parts を読んで足す)----
//
// どれも「頭」か「腰」に付ける。頭に付けたものは首の動きに、腰に付けたものは
// 体のひねりに付いてくる ── 胴に付けると、うつむいても耳だけ正面を向く。

// 耳。三角(ねこ)・まる(くま)・大きい三角(きつね)・垂れ(ひつじ)
//
// ねことぎつねは**耳で見分ける**ことにした。同じ細い三角を長さだけ変えて
// 生やしていたので、並べると同じ生きものに見えていた ── ねこは小さくて
// 丸っこく、きつねは顔幅ほどもある大きな三角、と輪郭から変える。
// tipMat を渡すと先を染める(きつねの黒い耳先)。
function makeEars(furMat, accMat, tipMat, kind, p) {
  const g = new THREE.Group();
  const r = p.headR;
  for (const sx of [-1, 1]) {
    const ear = new THREE.Group();
    if (kind === 'round') {
      const outer = new THREE.Mesh(new THREE.SphereGeometry(r * 0.38, 10, 8), furMat);
      const inner = new THREE.Mesh(new THREE.SphereGeometry(r * 0.22, 8, 6), accMat);
      inner.position.z = r * 0.16;
      ear.add(outer, inner);
      ear.position.set(sx * r * 0.72, r * 0.72, 0);
    } else {
      // 円錐。きつねは大きく、ひつじは横へ垂らす
      const droop = kind === 'droop';
      const fox = kind === 'fox';
      // 垂れ耳(ひつじ)は**毛の外**から生やす。毛は頭から 1.22R まで
      // 膨らんでいるので、ふつうの付け位置(0.55R)だと丸ごと埋まって、
      // 耳が1つも見えないひつじになっていた。
      const len = fox ? r * 1.05 : droop ? r * 0.80 : r * 0.52;
      const wide = fox ? r * 0.38 : droop ? r * 0.28 : r * 0.24;
      const outer = new THREE.Mesh(new THREE.ConeGeometry(wide, len, 9), furMat);
      outer.position.y = len / 2;
      outer.scale.z = fox ? 0.55 : 1;   // きつねは板のように平たい大きな耳
      const inner = new THREE.Mesh(new THREE.ConeGeometry(wide * (fox ? 0.42 : 0.55), len * (fox ? 0.56 : 0.7), 9), accMat);
      inner.position.set(0, len * (fox ? 0.34 : 0.42), wide * (fox ? 0.22 : 0.35));
      ear.add(outer, inner);
      if (tipMat) {
        const tip = new THREE.Mesh(new THREE.ConeGeometry(wide * 0.58, len * 0.42, 9), tipMat);
        tip.position.y = len * 0.79;
        tip.scale.z = fox ? 0.55 : 1;
        ear.add(tip);
      }
      ear.position.set(
        sx * r * (droop ? 0.96 : fox ? 0.52 : 0.50),
        r * (droop ? 0.18 : fox ? 0.66 : 0.68),
        r * (droop ? 0.18 : 0),
      );
      // Z 回りの正の回転は +Y を −X へ倒す。つまり **sx と同符号だと内側**へ
      // 倒れる ── 垂れ耳をこれで回していたので、耳が頭の上で交差して
      // 毛に埋まり、耳の無いひつじになっていた。外へ倒すので符号を反転する。
      ear.rotation.z = -sx * (droop ? 1.95 : fox ? -0.36 : -0.20);
      if (droop) ear.rotation.x = -0.25;   // 少し後ろへ
    }
    ear.traverse((o) => { o.castShadow = true; });
    g.add(ear);
  }
  return g;
}

// しっぽ。腰の後ろから。ねこは立てて、きつねは太く、ドラゴンは太く長く垂らす。
//
// **遊ぶときのカメラは背中側**なので、しっぽはいちばん目に入る部品。
// 細いカプセルを1本生やすと、背中に管が貼り付いているようにしか見えなかった
// (背面のスクリーンショットでねこのしっぽが「ファスナー」に見えた)ので、
// 太さと曲がりを付ける ── ねこは根元から先へ反らせ、きつねは玉を重ねて房にする。
function makeTail(furMat, accMat, pawMat, kind, p) {
  const g = new THREE.Group();
  const len = kind === 'fox' ? 0.13 : kind === 'dragon' ? 0.14 : kind === 'cat' ? 0.135 : 0.105;
  const thick = kind === 'fox' ? 0.034 : kind === 'dragon' ? 0.026 : 0.021;
  if (kind === 'fox') {
    // 房。だんだん太くなる玉を4つ重ねて、先を白くする
    for (let i = 0; i < 4; i += 1) {
      const k = 0.62 + i * 0.14;
      const b = new THREE.Mesh(new THREE.SphereGeometry(thick * k, 12, 10), furMat);
      b.position.y = len * (0.12 + i * 0.26);
      b.castShadow = true;
      g.add(b);
    }
    const tip = new THREE.Mesh(new THREE.SphereGeometry(thick * 0.92, 12, 10), accMat);
    tip.position.y = len * 1.05;
    tip.castShadow = true;
    g.add(tip);
  } else if (kind === 'cat') {
    // 短いカプセルを数珠つなぎにして、1節ずつ少しだけ曲げる。
    // 2節で折ると「曲がった管」になるが、4節だと弧になって尻尾に見える。
    let cur = g;
    const seg = len / 4;
    for (let i = 0; i < 4; i += 1) {
      const j = new THREE.Group();
      if (i > 0) { j.position.y = seg; j.rotation.x = -0.32; }
      const m = new THREE.Mesh(
        new THREE.CapsuleGeometry(thick * (1 - i * 0.11), seg, 5, 10), furMat,
      );
      m.position.y = seg / 2;
      m.castShadow = true;
      j.add(m);
      cur.add(j);
      cur = j;
    }
  } else if (kind === 'bob') {
    // まるいしっぽ(くま・ひつじ)。1つ付けるだけで背中が「後ろ姿」になる。
    // 色は手足の先と同じずらし方にする ── 差し色(accent)を使うと、
    // 差し色が暗いひつじで、白い毛に黒い穴が空いたように見えた。
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.026, 14, 12), pawMat);
    m.scale.set(1, 1, 0.8);
    m.castShadow = true;
    g.add(m);
  } else {
    // ドラゴン。先細りの円錐(同じ太さのカプセルだと横から見て棒になる)
    const m = new THREE.Mesh(new THREE.ConeGeometry(thick, len, 9), furMat);
    m.position.y = len / 2;
    m.castShadow = true;
    g.add(m);
  }
  if (kind === 'dragon') {
    // しっぽにも背びれを続ける。胴で終わると尻切れに見える
    for (let i = 0; i < 3; i += 1) {
      const k = 0.9 - i * 0.2;
      const fin = new THREE.Mesh(new THREE.ConeGeometry(thick * 0.75 * k, thick * 2 * k, 5), accMat);
      fin.position.set(0, len * (0.28 + i * 0.2), -thick * (0.62 - i * 0.14));
      fin.rotation.x = -0.7;
      g.add(fin);
    }
    // 先の矢じり
    const tip = new THREE.Mesh(new THREE.ConeGeometry(thick * 1.4, thick * 2.6, 4), accMat);
    tip.position.y = len * 0.98;
    tip.scale.set(1, 1, 0.4);
    g.add(tip);
  }
  // 付け根は胴の外へ出す。中に置くと丸ごと埋まって、後ろから見えない。
  //
  // 高さは**お尻**(胴の下のほう)。背中の真ん中から生やすと、背骨のところに
  // 管が縦に貼り付いたようにしか見えなかった。
  // 倒す角も足りないと同じことになる ── しっぽが体の輪郭の外へ出るまで倒す。
  //
  // **横へも倒す**(rotation.z)。真後ろから見るいちばん多い画では、後ろへ
  // 倒しただけのしっぽは短くつぶれて「お尻から出た瘤」になってしまう。
  // 横へ逃がすと体の輪郭の外に出て、空を背にして形が読める。
  const root = {
    cat: [p.bodyY * 0.30, -0.18, 0.40],
    fox: [p.bodyY * 0.34, -0.80, -0.30],
    dragon: [p.bodyY * 0.40, -1.15, 0],
    bob: [p.bodyY * 0.50, 0, 0],
  }[kind] ?? [p.bodyY * 0.45, -0.5, 0];
  g.position.set(0, root[0], -(p.bodyR + thick * 0.5));
  // rotation.x が正だと前(+Z)へ倒れて体に刺さる。後ろへ倒すので負。
  g.rotation.set(root[1], 0, root[2]);
  return g;
}

// くちばし(ペンギン)。
// お腹と同じクリーム色にしていたら、紺の顔の上でほとんど見えなかった。
// **顔に無い色**(橙)で、大きめに作る。
const BEAK = 0xf6a13a;
function makeBeak(mat, p) {
  const m = new THREE.Mesh(new THREE.ConeGeometry(p.headR * 0.30, p.headR * 0.52, 10), mat);
  m.rotation.x = Math.PI / 2;
  m.position.set(0, -p.headR * 0.16, p.headR * 0.90);
  m.castShadow = true;
  return m;
}

// 鼻先。頭の前へ少しだけ出す(ねこ・くま・きつね・ドラゴン)
// 鼻先。**明るい色で作る** ── 体と同じ色にすると、暗い目が暗い顔に埋もれて
// 表情がまったく読めなかった。顔に明るい面を1つ作るだけで顔らしくなる。
function makeSnout(furMat, accMat, noseMat, p) {
  const g = new THREE.Group();
  const m = new THREE.Mesh(new THREE.SphereGeometry(p.headR * 0.32, 12, 10), accMat);
  m.scale.set(1, 0.8, 0.9);
  m.position.set(0, -p.headR * 0.30, p.headR * 0.80);
  const nose = new THREE.Mesh(new THREE.SphereGeometry(p.headR * 0.10, 10, 8), noseMat);
  nose.position.set(0, -p.headR * 0.24, p.headR * 1.02);
  g.add(m, nose);
  g.traverse((o) => { o.castShadow = true; });
  return g;
}

// 長い鼻面(きつね)。
// 丸い鼻先を付けると、ねこ・くまとまったく同じ顔になる。きつねは
// **前へ突き出た細い鼻面**が一目で分かる形なので、円錐で作る。
function makeMuzzle(furMat, accMat, noseMat, p) {
  const g = new THREE.Group();
  const r = p.headR;
  const len = r * 1.00;
  // 先が細い円錐。rotation.x = +90° で +Y が +Z を向くので、
  // 細いほう(radiusTop)がそのまま鼻先になる。
  const cone = new THREE.Mesh(
    new THREE.CylinderGeometry(r * 0.13, r * 0.42, len, 14), furMat,
  );
  cone.rotation.x = Math.PI / 2;
  cone.position.set(0, -r * 0.30, r * 0.92);
  // 下あご側を明るくする。全部が体の色だと、突き出ていることが
  // 影でしか分からない
  const jaw = new THREE.Mesh(
    new THREE.CylinderGeometry(r * 0.11, r * 0.30, len * 0.92, 14), accMat,
  );
  jaw.rotation.x = Math.PI / 2;
  jaw.scale.y = 0.55;
  jaw.position.set(0, -r * 0.42, r * 0.90);
  const nose = new THREE.Mesh(new THREE.SphereGeometry(r * 0.13, 12, 10), noseMat);
  nose.position.set(0, -r * 0.28, r * 1.40);
  g.add(cone, jaw, nose);
  g.traverse((o) => { o.castShadow = true; });
  return g;
}

// ほお(きつね)。頬から下あごにかけての明るい面。
//
// 最初は球を外へ出して「房」にしたが、頬に袋を貼り付けたようにしか
// 見えなかった。**ほっぺと同じで、頭に埋めてレンズのように覗かせる**のが
// 正しい ── 出っ張りではなく面の色で、きつねの細い顔が締まる。
function makeRuff(mat, p) {
  const g = new THREE.Group();
  const r = p.headR;
  // **左右に分けて置かない**。頬に1つずつ置いたら、正面から見たときに
  // 口の両脇から明るい塊が2つ生えて「牙」に見えた。
  // 顔の下半分を横一枚で抜くと、鼻面の根元が締まって前に出て見える。
  // 頭の表面は y=-0.40R のところで z=0.92R。**そこより前に出さないと
  // 丸ごと埋まって見えない**(最初に置いた 0.50R は完全に頭の中だった)。
  const band = new THREE.Mesh(new THREE.SphereGeometry(r * 0.46, 16, 14), mat);
  band.scale.set(1.30, 0.62, 0.56);
  band.position.set(0, -r * 0.40, r * 0.78);
  g.add(band);
  return g;
}

// ひげ(ねこ)。細い棒を左右3本ずつ。
// 形を足さずに「ねこらしさ」を出せる数少ない部品で、
// これがあるかないかでぎつねとの区別がいちばんはっきりする。
function makeWhiskers(mat, p) {
  const g = new THREE.Group();
  const r = p.headR;
  const len = r * 0.85;
  for (const sx of [-1, 1]) {
    for (const tilt of [0.30, 0.02, -0.26]) {
      const w = new THREE.Group();
      const m = new THREE.Mesh(
        new THREE.CylinderGeometry(r * 0.010, r * 0.016, len, 4), mat,
      );
      m.position.y = len / 2;
      w.add(m);
      w.position.set(sx * r * 0.20, -r * 0.26, r * 0.86);
      // +Y を真横(±X)へ倒してから、上下に振る
      w.rotation.z = -sx * (Math.PI / 2 - tilt);
      w.rotation.y = -sx * 0.5;   // 少し前へ張り出す
      g.add(w);
    }
  }
  return g;
}

// もこもこ(ひつじ)。球をぐるりと並べて覆う。
//
// 手で位置を並べていたら、隙間から黒い下地がのぞいて「耳あて」に見えた。
// **緯度・経度で並べて、顔の穴だけ開ける**ようにすると、どこから見ても
// 毛で埋まり、地が出るのは顔の正面だけになる。
//
// 並びは決め打ち。乱数は使わない(対戦の乱数に触れないのはもちろん、
// 見るたび形が変わると「同じ人」に見えなくなる)。
//
// 穴は円ではなく**横長**にする ── 正円で開けると、目と口を出すのに
// 十分な高さを取ったところで左右が開きすぎて、頬まで地が出てしまう。
const FACE_H = 58;    // 正面からこの左右角までが顔(度)
const FACE_UP = 40;   // 顔の穴の上端(度)
const FACE_DOWN = -42;
function shell(mat, rings, dist, size, faceHole) {
  const g = new THREE.Group();
  const geo = new THREE.SphereGeometry(size, 12, 10);   // 使い回す
  for (const [lat, n] of rings) {
    const la = (lat * Math.PI) / 180;
    for (let i = 0; i < n; i += 1) {
      const lo = (i / n) * Math.PI * 2;   // 0 が正面(+Z)
      const dir = [Math.cos(la) * Math.sin(lo), Math.sin(la), Math.cos(la) * Math.cos(lo)];
      if (faceHole) {
        const h = Math.abs((Math.atan2(dir[0], dir[2]) * 180) / Math.PI);
        if (h < FACE_H && lat < FACE_UP && lat > FACE_DOWN) continue;
      }
      const m = new THREE.Mesh(geo, mat);
      m.position.set(dir[0] * dist, dir[1] * dist, dir[2] * dist);
      m.castShadow = true;
      g.add(m);
    }
  }
  return g;
}

function makeFluff(mat, p) {
  const r = p.headR;
  return shell(
    mat,
    [[90, 1], [58, 7], [20, 10], [-18, 10], [-54, 7]],
    r * 0.80, r * 0.42, true,
  );
}

// 胴のもこもこ(ひつじ)。頭だけ毛だと、毛糸の帽子をかぶった人に見える。
// 顔の穴は要らないので、ぐるり全部を埋める。
function makeWool(mat, p) {
  const g = shell(
    mat,
    [[62, 6], [24, 9], [-16, 9], [-56, 6]],
    p.bodyR * 0.76, p.bodyR * 0.44, false,
  );
  // 少し下げる。肩の高さまで毛を盛ると腕が丸ごと埋まって、
  // 万歳も竿も見えないひつじになる。
  g.position.y = p.bodyY - p.bodyR * 0.10;
  g.scale.z = 0.92;   // 胴の潰しに合わせる
  return g;
}

// 角(ドラゴン)。後ろへ長く反らせる。
// 短い円錐を2本立てただけだと、後ろから見て「ねこの耳」と見分けが
// つかなかった ── 角は「長さと後ろへの反り」で角に見える。
function makeHorns(mat, p) {
  const g = new THREE.Group();
  for (const sx of [-1, 1]) {
    // 大きい角。根元から後ろ上へ伸ばし、途中で少し曲げる(2節に分ける)
    const horn = new THREE.Group();
    const lower = new THREE.Mesh(new THREE.ConeGeometry(p.headR * 0.24, p.headR * 0.62, 8), mat);
    lower.position.y = p.headR * 0.3;
    const upper = new THREE.Group();
    upper.position.y = p.headR * 0.55;
    upper.rotation.x = -0.55;                 // 先を後ろへ反らせる
    const tip = new THREE.Mesh(new THREE.ConeGeometry(p.headR * 0.155, p.headR * 0.52, 8), mat);
    tip.position.y = p.headR * 0.25;
    upper.add(tip);
    horn.add(lower, upper);
    horn.position.set(sx * p.headR * 0.52, p.headR * 0.64, -p.headR * 0.02);
    horn.rotation.z = sx * 0.34;
    horn.rotation.x = -0.12;
    g.add(horn);

    // 小さい角(頬の横)。2対にすると一気に「竜」らしくなる
    const small = new THREE.Mesh(new THREE.ConeGeometry(p.headR * 0.1, p.headR * 0.3, 5), mat);
    small.position.set(sx * p.headR * 0.72, p.headR * 0.1, -p.headR * 0.3);
    small.rotation.z = sx * 1.0;
    small.rotation.x = -0.4;
    g.add(small);
  }
  g.traverse((o) => { o.castShadow = true; });
  return g;
}

// 翼(ドラゴン)。背中に畳んだ翼を張る。
// 遊ぶときのカメラは背中側なので、いちばん目に入るのがここ。
function makeWings(furMat, accMat, p) {
  const g = new THREE.Group();
  // 小さいと「肩に付いた飾り」にしか見えない。胴の3倍ほどまで伸ばす。
  const span = p.bodyR * 2.7;
  for (const sx of [-1, 1]) {
    const wing = new THREE.Group();
    // 骨。付け根から斜め後ろ上へ、翼の前ぶちとして伸ばす
    const bone = new THREE.Mesh(
      new THREE.CapsuleGeometry(p.bodyR * 0.08, span * 0.85, 3, 6), furMat,
    );
    bone.position.y = span * 0.42;
    wing.add(bone);
    // 膜。円錐(=底が平らな三角)だと、平たく潰しても縁が直線のままで、
    // 後ろから見ると段ボールの切れ端が並んでいるようにしか見えなかった。
    // **潰した球**にすると縁が全部曲線になり、水かきのような膜になる。
    for (let i = 0; i < 3; i += 1) {
      const k = 1 - i * 0.15;
      const m = new THREE.Mesh(new THREE.SphereGeometry(span * 0.34 * k, 14, 12), accMat);
      m.scale.set(0.55, 1.05, 0.15);   // 縦長にして、ぺたんこの膜にする
      m.position.set(sx * span * 0.20, span * 0.34 - i * span * 0.16, 0);
      m.rotation.z = sx * (0.45 + i * 0.32);
      wing.add(m);
    }
    // 翼の先の爪。1つ足すと「畳んだ翼」の形が読める
    const claw = new THREE.Mesh(new THREE.ConeGeometry(span * 0.06, span * 0.20, 6), furMat);
    claw.position.y = span * 0.84;
    claw.rotation.z = sx * 0.18;
    wing.add(claw);
    // 背中の上のほう(肩甲骨のあたり)。低いと腰の飾りに見える
    // 膜は平たいので、面が後ろを向くように付ける。横へ捻ると、横から見た
    // ときだけ板が突き出て「旗」に見える(遊ぶカメラは背中側)。
    wing.position.set(sx * p.bodyR * 0.45, 0.014, -p.bodyR * 0.82);
    wing.rotation.set(-0.12, sx * 0.22, sx * 0.4);
    g.add(wing);
  }
  g.traverse((o) => { o.castShadow = true; });
  return g;
}

// 背びれ(ドラゴン)。胴の背中側に三角を並べる
function makeSpikes(mat, p) {
  const g = new THREE.Group();
  for (let i = 0; i < 4; i += 1) {
    // 上ほど大きく。同じ大きさで並べると板を貼ったように見える
    const k = 1 - i * 0.16;
    const m = new THREE.Mesh(new THREE.ConeGeometry(p.bodyR * 0.2 * k, p.bodyR * 0.55 * k, 5), mat);
    m.position.set(0, p.bodyY + (1.1 - i) * p.bodyR * 0.4, -p.bodyR * 0.76);
    m.rotation.x = -0.6;
    m.castShadow = true;
    g.add(m);
  }
  return g;
}

// お腹。胴の前に平たい球を貼る。k は大きさ(ペンギン・かえるは大きく、
// ほかの動物は控えめに「縫いぐるみの当て布」くらい)。
function makeBelly(mat, p, k = 0.82) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(p.bodyR * k, 16, 14), mat);
  // 縦長にすると「盾」の形になって当て布に見えない。ほぼ丸く、少し横広に。
  m.scale.set(k < 0.7 ? 1.2 : 1, k < 0.7 ? 1.0 : 1.15, 0.5);
  m.position.set(0, p.bodyY - p.bodyR * (k < 0.7 ? 0.22 : 0.08), p.bodyR * 0.62);
  return m;
}

// color はその人の色。species は species.js の1つ(省略すると「ひと」)。
//
// 動物(fur)は体ぜんぶがその人の色になり、ひとだけ服に色が付く。
// こうすると「赤いねこ」「青いねこ」で誰が誰か分かりつつ、種類も分かる。
export function makeWalker(color = CLOTH, species = speciesById(DEFAULT_SPECIES)) {
  const sp = species ?? speciesById(DEFAULT_SPECIES);
  const p = { ...CUTE, ...(sp.props ?? {}) };
  const parts = sp.parts ?? {};

  const g = new THREE.Group();
  // roughness を少し下げてある ── 0.75 だと光がまったく回らず、
  // どの向きから見ても同じ明るさの「塗り面」になってしまう。
  const mat = (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.62, metalness: 0.02 });
  // 動物は顔も手足も体の色。ひとは肌色のまま
  const skin = mat(sp.fur ? color : SKIN);
  const cloth = mat(color);
  // 手足の先だけ色をずらす。全身を1色で塗ると、腕も脚も胴に溶けて
  // 影絵のような塊になる ── 先端に差を付けると手足の形が読める。
  const paw = mat(sp.fur ? tone(color, 0.10) : SKIN);
  const shoe = mat(sp.fur ? tone(color, 0.15) : SHOE);
  // 靴下(きつね)。手足の先よりさらに強くずらして、膝から下を染める。
  // 耳の先も同じ色にする ── きつねは「耳先と足先が濃い」のが形の次に効く印。
  const sock = parts.socks || parts.earTip ? mat(tone(color, 0.42)) : null;
  const accent = mat(sp.accent ?? SKIN);
  const shineMat = new THREE.MeshBasicMaterial({ color: SHINE });
  const blushMat = mat(BLUSH);
  // 顔が暗いすがただけ目に明るい縁を付ける(makeEye)
  const faceColor = sp.face ?? (sp.fur ? color : SKIN);
  const rimMat = lightness(faceColor) < 0.30 ? mat(0xf4f1ee) : null;

  // 腰。ここを動かすと全身が付いてくる
  const hips = new THREE.Group();
  hips.position.y = p.hipY;
  g.add(hips);

  // 胴。下がすぼまった卵形にすると、ずんぐりして見える
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(p.bodyR, p.bodyLen, 8, 18), cloth);
  torso.position.y = p.bodyY;
  torso.scale.set(1, 1, 0.88);
  torso.castShadow = true;
  hips.add(torso);

  // 首は作らない。頭を胴に載せる
  const chest = new THREE.Group();
  chest.position.y = p.chestY;
  hips.add(chest);

  // 顔だけ別の色にできる(ひつじの黒い顔など)。既定は体と同じ
  const faceMat = sp.face != null ? mat(sp.face) : skin;
  const head = new THREE.Mesh(new THREE.SphereGeometry(p.headR, 26, 20), faceMat);
  head.position.y = p.headY;
  // 横幅はすがたで変える(headW)。ねこは丸く広く、きつねは細く ──
  // 顔の輪郭が同じだと、耳や鼻を変えても「同じ顔の別衣装」に見える。
  // **目・口・ほっぺは割り戻さない**。割り戻すと、細くした顔の横から
  // 目玉だけはみ出す。潰しに合わせて一緒に寄るのが正しい。
  head.scale.set(p.headW ?? 1, 0.96, 0.96);   // 前後の潰しだけ割り戻す(下)
  head.castShadow = true;
  chest.add(head);

  // 目と口は「頭に付ける」。胴に付けると、首を振っても顔だけ正面を向いたまま
  // ── 頭は丸いので、顔が付いてこないと首の動きが画面上まったく見えない
  // (実際、しょんぼりで首を振らせても「振っているように見えない」となった)。
  // 位置は頭の中心からの相対にする(頭は chest の headY にいる)。
  // 頭は少し潰してある(scale)。子はその潰しを受けるので、割り戻して
  // 付ける ── そうしないと顔の位置だけ前より内側へ寄る。
  const hs = { y: 0.96, z: 0.96 };
  const eyeMat = new THREE.MeshBasicMaterial({ color: EYE });
  // 顔の寸法は頭の半径に対する比で持っている(CUTE)。実寸に直す。
  const R = p.headR;
  const eye = { r: R * p.eye.r, x: R * p.eye.x, y: R * p.eye.y, z: R * p.eye.z };
  for (const sx of [-1, 1]) {
    if (parts.eyesOnTop) {
      // かえる。頭の上に大きな目を乗せる(白目ごと出っ張らせる)
      const ball = new THREE.Mesh(new THREE.SphereGeometry(R * 0.34, 14, 12), skin);
      ball.position.set(sx * R * 0.44, R * 0.72 / hs.y, R * 0.12 / hs.z);
      ball.castShadow = true;
      const pupil = new THREE.Mesh(new THREE.SphereGeometry(eye.r * 0.92, 14, 12), eyeMat);
      pupil.position.z = R * 0.28;
      pupil.scale.set(1, 1, 0.7);
      const sh = new THREE.Mesh(new THREE.SphereGeometry(eye.r * 0.3, 8, 8), shineMat);
      sh.position.set(sx * eye.r * 0.3, eye.r * 0.32, R * 0.28 + eye.r * 0.5);
      ball.add(pupil, sh);
      head.add(ball);
      continue;
    }
    const g2 = makeEye(sx, eye, p.shine, shineMat, eyeMat, rimMat);
    g2.position.set(sx * eye.x, eye.y / hs.y, eye.z / hs.z);
    g2.scale.set(1, 1 / hs.y, 1 / hs.z);
    head.add(g2);
  }

  // ほっぺ。目と口のあいだの何もない面に色を1つ置くだけで、
  // のっぺりした球が「顔」になる
  for (const sx of [-1, 1]) head.add(makeBlush(sx, p.blush, R, blushMat));

  const mouth = makeMouth(eyeMat, {
    r: R * p.mouth.r, tube: R * p.mouth.tube,
    y: R * p.mouth.y / hs.y, z: R * p.mouth.z / hs.z,
  });
  head.add(mouth.smile, mouth.open);

  const arms = [-1, 1].map((sx) => {
    const limb = makeLimb(skin, p.upperArm, p.foreArm, p.armR, makeHand(paw, p.handR));
    limb.root.position.set(sx * p.shoulder.x, p.shoulder.y, 0);
    chest.add(limb.root);
    return limb;
  });

  // 竿は右手(arms[1])に握らせる。ふだんは隠しておく
  const rod = makeRod(p.rod);
  rod.group.position.y = -(p.upperArm + p.foreArm);
  rod.group.visible = false;
  arms[1].knee.add(rod.group);

  // 弓は左手(arms[0])。竿と別の手にするのは、両方出したときに
  // 重なるのを避けるためではなく ── 弓は左手で構えて右手で引くから。
  const bow = makeBow(p.bow);
  bow.group.position.y = -(p.upperArm + p.foreArm);
  bow.group.visible = false;
  arms[0].knee.add(bow.group);

  const legs = [-1, 1].map((sx) => {
    const limb = makeLimb(cloth, p.thigh, p.shin, p.legR, makeShoe(sock ?? shoe, p.shoe), sock);
    limb.root.position.set(sx * p.hipX, 0, 0);
    hips.add(limb.root);
    return limb;
  });

  // ---- すがたの飾り ----
  // 頭に付けたものは首の動きに付いてくる(胴に付けると顔だけ正面を向く)
  if (parts.ears) head.add(makeEars(skin, accent, parts.earTip ? sock : null, parts.ears, p));
  if (parts.snout) head.add(makeSnout(skin, accent, mat(EYE), p));
  if (parts.muzzle) head.add(makeMuzzle(skin, accent, mat(EYE), p));
  if (parts.ruff) head.add(makeRuff(accent, p));
  if (parts.whiskers) head.add(makeWhiskers(mat(tone(color, 0.55)), p));
  if (parts.beak) head.add(makeBeak(mat(BEAK), p));
  if (parts.horns) head.add(makeHorns(accent, p));
  if (parts.fluff) head.add(makeFluff(skin, p));
  // 翼は胴(chest)に付ける。上体をひねると一緒に動く
  if (parts.wings) chest.add(makeWings(skin, accent, p));
  // 腰(体のひねりに付いてくる)
  if (parts.wool) hips.add(makeWool(skin, p));
  if (parts.tail) hips.add(makeTail(skin, accent, paw, parts.tail, p));
  if (parts.spikes) hips.add(makeSpikes(accent, p));
  // お腹。ペンギン・かえるは指定の色、それ以外の動物は体の色をずらしたもの。
  // 全員に付けるのは、胴が一色の面だと縫いぐるみに見えないから ──
  // ひとだけは付けない(服に丸い当て布が付いているように見えてしまう)。
  // 毛に覆われる胴(ひつじ)には要らない ── 当て布ごと毛の下に埋まる。
  if (parts.belly) hips.add(makeBelly(accent, p));
  else if (sp.fur && !parts.wool) hips.add(makeBelly(mat(tone(color, 0.10)), p, 0.58));

  // 縮尺は一番外側の入れ物に1回だけ掛ける(scale.js)。
  // 部位の寸法を1つずつ掛けると必ずどこかを取り残すし、名札や吹き出しも
  // この入れ物の子なので、まとめて同じ率で縮む。
  // applyPose は位置と回転しか触らないので、この scale は消えない。
  g.scale.setScalar(WALK_SCALE);
  return { group: g, hips, chest, head, mouth, arms, legs, rod, bow };
}

// 足元から頭のてっぺんまで。名札の高さとカメラの寄りに使う。
//
// すがたを渡すこと。角やもこもこで背が伸びるので、決め打ちの値を使うと
// のっぽの名札が頭にめり込む。
export function walkerHeight(species = speciesById(DEFAULT_SPECIES)) {
  const sp = species ?? speciesById(DEFAULT_SPECIES);
  const p = { ...CUTE, ...(sp.props ?? {}) };
  return p.hipY + p.chestY + p.headY + p.headR + (sp.top ?? 0);
}
