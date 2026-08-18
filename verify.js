// VDTS Editor コアロジック検証（プロジェクト直下で実行する）
//   node verify.js
//   または node が無い環境:
//   /System/Library/Frameworks/JavaScriptCore.framework/Versions/A/Helpers/jsc verify.js
//
// 内容: パーサ回帰 / HTML・GAS読み込み系の一致 / ラウンドトリップ（パース→書き出し→再パース→モデル一致）
//       / フィンガープリント（008とCSP再出力イラストの同一性） / ライターのゴールデン構造検査
(function () {
  "use strict";
  const isNode = typeof require === "function";
  const read = isNode ? (p => require("fs").readFileSync(p, "utf8")) : (p => readFile(p));
  const out = isNode ? (s => console.log(s)) : (s => print(s));

  let fail = 0;
  function check(label, cond) { out((cond ? "OK " : "NG!") + " " + label); if (!cond) fail++; }

  // HTML内スクリプトの純関数部（フォルダ監視より前）を独立スコープで評価
  const html = read("vdts-editor.html");
  const pure = html.split("<script>")[1].split("<" + "/script>")[0].split("/* ========= フォルダ監視")[0];
  const api = new Function(pure + "; return { parseXdts, parseLedger, matchLedger, inspect, komaToShaku," +
    " modelFromParsed, modelFingerprint, sheetFingerprint, writeXdts, sha256Hex," +
    " setLabelAt, toggleTickAt, moveChangePoint, isChangePoint, setDuration, ttFromModel," +
    " newDoc, commitDoc, diffSheets, diffIsEmpty, writeVdts, parseVdts, writeTdts, parseAnyTimesheet, EMPTY, TICK," +
    " docFingerprint, framesToBlocks, parseAuxBlocks, dougaFromGenga, setBlockEnd, setBlockStart, moveBlock, freeSpanAt, parseCameraText, cameraDisplayText, encodeSpeaker, decodeSpeaker, cameraFromTdtsValue, insertFrames, deleteFrames, layersToText, textToLayers, dialogueToText, textToDialogue, cameraToText, textToCamera, splitDtsEpisode, joinDtsEpisode, setSlack, setSlackHead, totalFrames, displayKoma, fmtEpisode, fmtCut, cutKey, shiftInk };")();


  // --- SHA-256 既知ベクタ ---
  check('sha256("abc")', api.sha256Hex("abc") === "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  check('sha256("")', api.sha256Hex("") === "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");

  // --- サンプル横断: パーサ一致・ラウンドトリップ・フィンガープリント一致 ---
  const samples = ["sample_01_001.xdts"];
  const fingerprints = {};
  const ledger = api.parseLedger("001,2+00\n002,1+12\n");

  for (const f of samples) {
    const text = read("samples/" + f);
    out("\n=== " + f + " ===");

    const parsed = api.parseXdts(text);

    const model = api.modelFromParsed(parsed[0]);
    check("cells長=duration", model.layers.every(L => L.cells.length === model.duration));

    // ラウンドトリップ: モデル → 書き出し → 再パース → モデル一致
    const written = api.writeXdts(model);
    const model2 = api.modelFromParsed(api.parseXdts(written)[0]);
    check("ラウンドトリップでモデル一致", JSON.stringify(model) === JSON.stringify(model2));

    // フィンガープリントも書き出しを跨いで不変
    fingerprints[f] = api.modelFingerprint(model);
    out("  fingerprint: " + fingerprints[f]);
    check("fingerprint 書き出し跨ぎで不変", api.modelFingerprint(model2) === fingerprints[f]);

    // 検品の回帰
    const res = api.inspect(parsed, api.matchLedger(f, ledger));
    for (const c of res.checks) out("  [" + c.level + "] " + c.text);
    check("判定=検(OK)", !res.ng && !res.pending);
  }


  // --- ライターの構造検査（CSP 式 version 5 の最小構造を守っているか） ---
  out("");
  const golden = JSON.parse(read("samples/sample_01_001.xdts").replace(/^exchangeDigitalTimeSheet Save Data\r?\n/, ""));
  const model008 = api.modelFromParsed(api.parseXdts(read("samples/sample_01_001.xdts"))[0]);
  const written = api.writeXdts(model008, { cut: "008" });
  check("1行目が識別ヘッダー", written.split("\n")[0] === "exchangeDigitalTimeSheet Save Data");
  const doc = JSON.parse(written.split("\n").slice(1).join("\n"));
  check("トップレベルは header/timeTables/version のみ",
    JSON.stringify(Object.keys(doc).sort()) === JSON.stringify(Object.keys(golden).sort()) &&
    Object.keys(doc).length === 3);
  check("version=5", doc.version === 5);
  check("header.cut を反映", doc.header.cut === "008");
  const tt = doc.timeTables[0];
  check("timeTableのキーがゴールデンと一致",
    JSON.stringify(Object.keys(tt).sort()) === JSON.stringify(Object.keys(golden.timeTables[0]).sort()));
  check("fieldId 0/3/5 を持つ",
    JSON.stringify(tt.fields.map(fl => fl.fieldId)) === JSON.stringify(golden.timeTables[0].fields.map(fl => fl.fieldId)));
  check("frameは0始まり", tt.fields[0].tracks.every(tr => tr.frames.length && tr.frames[0].frame === 0));
  check("範囲外の終端フレームを書かない",
    tt.fields[0].tracks.every(tr => tr.frames.every(fr => fr.frame < tt.duration)));
  check('空セルは SYMBOL_NULL_CELL（"x" 不使用）', !/"x"/.test(written));
  check("v10の未文書フィールドを捏造しない",
    !/fontColorId|Dummykomas|comas|tableHeader/.test(written));

  // --- 編集操作（純関数） ---
  out("\n=== 編集操作 ===");
  const E = api.EMPTY, T = api.TICK;
  let c = ["1","1","1","2","2",E,E,"3","3","3"];
  api.setLabelAt(c, 1, "5");           // ホールドの途中に書く → そこから次の変化点まで
  check("途中に書く: 1 5 5 2 2 × × 3 3 3", c.join() === ["1","5","5","2","2",E,E,"3","3","3"].join());
  api.setLabelAt(c, 1, "");            // 消す → 前の露出に吸収
  check("消す: 前に吸収", c.join() === ["1","1","1","2","2",E,E,"3","3","3"].join());
  check("ホールド中を消しても無変化", api.setLabelAt(c, 2, "") === false && c[2] === "1");
  api.setLabelAt(c, 3, "x");
  check("x は空セル", c[3] === E && c[4] === E);
  c = ["1","1","1","1","2","2"];
  api.toggleTickAt(c, 2);
  check("中割を置く", c[2] === T && api.isChangePoint(c, 3) === false);
  api.toggleTickAt(c, 2);
  check("中割を外すと元の保持値", c[2] === "1");
  check("変化点には中割を置けない", api.toggleTickAt(c, 4) === false);
  check("空セルには中割を置けない", api.toggleTickAt([E,E,E], 1) === false);
  check("次の原画が無いランには中割を置けない", api.toggleTickAt(["1","1","1"], 1) === false && api.toggleTickAt(["1","1",E,E], 1) === false);
  c = ["1","1",T,"1","2"];
  api.setLabelAt(c, 2, "5");
  check("中割の位置に番号を書けば変化点になる", c.join() === "1,1,5,5,2");
  c = ["1","1","1","2","2","2","3","3"];
  api.moveChangePoint(c, 3, 1);
  check("上へ動かす: 1 2 2 2 2 2 3 3", c.join() === "1,2,2,2,2,2,3,3");
  api.moveChangePoint(c, 1, 5);
  check("下へ動かす（自分のランは最短1）: 1 1 1 1 1 2 3 3", c.join() === "1,1,1,1,1,2,3,3");
  check("前の変化点は越えない", (api.moveChangePoint(c, 5, 0), c.join() === "1,2,2,2,2,2,3,3"));
  check("先頭は動かない", api.moveChangePoint(c, 0, 3) === 0);
  c = ["1","1","1","2","2",T,"3","3"];
  api.moveChangePoint(c, 6, 5);
  check("中割の上へ動かすと中割は消えて変化点になる", c.join() === "1,1,1,2,2,3,3,3");
  c = ["1","1","2",T,"2","3"];
  api.moveChangePoint(c, 2, 3);
  check("中割の位置へ下げると中割は消える", c.join() === "1,1,1,2,2,3");
  const m = { duration: 4, layers: [{ name: "A", cells: ["1","1","2","2"] }] };
  api.setDuration(m, 6);
  check("尺を伸ばすとホールド継続", m.layers[0].cells.join() === "1,1,2,2,2,2");
  api.setDuration(m, 3);
  check("尺を縮める", m.layers[0].cells.join() === "1,1,2" && m.duration === 3);
  // ラウンドトリップ: 中割入りモデル → xdts → 再パース
  const mt = { duration: 6, layers: [{ name: "A", cells: ["1","1",T,"1","2","2"] }] };
  const rt = api.modelFromParsed(api.parseXdts(api.writeXdts(mt))[0]);
  check("中割入りでもラウンドトリップ一致", JSON.stringify(rt) === JSON.stringify(mt));

  // --- VDTS 文書 ---
  out("\n=== VDTS ===");
  const vd = api.newDoc(model008, { cut: "008" });
  check("初回コミット", api.commitDoc(vd, { who: "a", role: "原画", note: "up" }) === true && vd.history.length === 1);
  check("同内容は重ねない", api.commitDoc(vd, { who: "a" }) === false);
  api.setLabelAt(vd.sheet.layers[0].cells, 2, "9");
  check("変更後は重なる", api.commitDoc(vd, { who: "b", role: "作監" }) === true && vd.history.length === 2);
  const d = api.diffSheets(vd.history[0].sheet, vd.history[1].sheet);
  check("差分にレイヤーとコマが出る", !api.diffIsEmpty(d) && Object.values(d.layers)[0].komas.length >= 1);
  const vtext = api.writeVdts(vd);
  check("vdts 1行目が識別ヘッダー", vtext.split("\n")[0] === "versionedDigitalTimeSheet Save Data");
  const doc2 = api.parseVdts(vtext);
  check("vdts ラウンドトリップ", JSON.stringify(doc2) === JSON.stringify(vd));
  check("履歴の版は文書指紋を保つ", doc2.history[0].fingerprint === api.docFingerprint({ sheet: doc2.history[0].sheet, cut: doc2.cut }));
  // tdts 書き出し → 読み戻し
  const tt2 = api.writeTdts(vd, { withHistory: true });
  check("tdts 1行目", tt2.split("\n")[0] === "toeiDigitalTimeSheet Save Data");
  const tj = JSON.parse(tt2.split("\n").slice(1).join("\n"));
  check("tdts は timeSheets[] に版が並ぶ", tj.timeSheets.length === 3 && tj.version === 7 && tj.timeSheets[0].timeTables[0].name === "sheet1");
  const back = api.parseAnyTimesheet(tt2);
  check("tdts を読み戻すと現在のシートと一致（空の列は省かれる）", JSON.stringify(api.modelFromParsed(back.parsed[0]).layers) === JSON.stringify(vd.sheet.layers.filter(L => L.cells.some(v => v !== E))) && back.kind === "tdts");
  // 台詞・カメラ・動画欄
  out("\n=== 付帯欄 ===");
  vd.sheet.dialogue.push({ from: 1, to: 28, text: "おはよう", lane: 0, speaker: "太郎", kind: "" });
  vd.sheet.dialogue.push({ from: 30, to: 40, text: "……", lane: 1, speaker: "花子", kind: "M" });
  vd.sheet.dialogue.push({ from: 10, to: 12, text: "ドアが開く", lane: 1, speaker: "", kind: "SE" });
  vd.sheet.camera.push({ from: 1, to: vd.sheet.duration, kind: "PAN", fromLabel: "A", toLabel: "B", text: "", lane: 0 });
  const tt3 = api.writeTdts(vd, {});
  const aux = api.parseAuxBlocks(tt3);
  const norm = arr => arr.map(b => [b.from, b.to, b.lane, b.speaker, b.kind, b.text].join("|")).sort().join(";");
  check("台詞欄 tdts 往復（種類 M / SE も）", norm(aux.dialogue) === norm(vd.sheet.dialogue));
  check("話者(M) の埋め込み", api.encodeSpeaker({ speaker: "花子", kind: "M" }) === "花子(M)" && api.encodeSpeaker({ speaker: "", kind: "SE" }) === "SE" && api.encodeSpeaker({ speaker: "太郎", kind: "" }) === "太郎");
  check("話者(OFF)/（N）の読み取り", JSON.stringify(api.decodeSpeaker("太郎(OFF)")) === JSON.stringify({ speaker: "太郎", kind: "OFF" }) && JSON.stringify(api.decodeSpeaker("語り（N）")) === JSON.stringify({ speaker: "語り", kind: "N" }) && api.decodeSpeaker("SE").kind === "SE");
  check("カメラ欄 tdts 往復", aux.camera.length === 1 && api.cameraDisplayText(aux.camera[0]) === "A PAN B" && aux.camera[0].kind === "PAN" && aux.camera[0].fromLabel === "A" && aux.camera[0].toLabel === "B");
  const pc = api.parseCameraText;
  check("カメラ文字列: A PAN B", JSON.stringify(pc("A PAN B")) === JSON.stringify({ kind: "PAN", fromLabel: "A", toLabel: "B", text: "" }));
  check("カメラ文字列: PAN A→B", JSON.stringify(pc("PAN A→B")) === JSON.stringify({ kind: "PAN", fromLabel: "A", toLabel: "B", text: "" }));
  check("カメラ文字列: T.U", pc("T.U").kind === "T.U" && pc("TU").kind === "T.U" && pc("トラックアップ").kind === "T.U");
  check("カメラ文字列: 同じフレームは FIX", pc("A A").kind === "FIX");
  check("カメラ文字列: 自由文は残る", pc("12").text === "12" && pc("Q.PAN 揺れ").text === "Q.PAN 揺れ");
  check("カメラ表示: FIX 単独", api.cameraDisplayText({ kind: "FIX" }) === "FIX" && api.cameraDisplayText({ kind: "O.L", text: "A1⋈A2", fromLabel: "", toLabel: "" }) === "O.L A1⋈A2");
  const x3 = api.writeXdts(vd.sheet, {});
  check("xdts でも台詞欄が往復", norm(api.parseAuxBlocks(x3).dialogue) === norm(vd.sheet.dialogue));
  check("台詞の無い xdts は空", api.parseAuxBlocks(api.writeXdts({ duration: 4, layers: [{ name: "A", cells: [E,E,E,E] }] })).dialogue.length === 0);
  const dg = api.dougaFromGenga([{ name: "A", cells: ["1","1",T,"1","2",E,E,"3"] }]);
  check("動画欄: 原画と中割に通し番号、ホールド継続、空は×", dg[0].cells.join() === "1,1,2,2,3,×,×,4");
  const bl = [{ from: 1, to: 5, text: "a", lane: 0 }, { from: 10, to: 12, text: "b", lane: 0 }];
  api.setBlockEnd(bl, bl[0], 40, 100); check("ブロック伸長は隣の手前まで", bl[0].to === 9);
  api.setBlockStart(bl, bl[1], 3, 100); check("ブロック開始は前の隣の後ろまで", bl[1].from === 10);
  api.moveBlock(bl, bl[1], 99, 100); check("ブロック移動は長さを保って端で止まる", bl[1].from === 98 && bl[1].to === 100);
  check("空きに置く既定は1秒", JSON.stringify(api.freeSpanAt(bl, 0, 20, 100)) === JSON.stringify({ from: 20, to: 43 }));
  check("ブロックの上には置けない", api.freeSpanAt(bl, 0, 2, 100) === null);
  check("ttFromModel で inspect が動く", api.inspect([api.ttFromModel(vd.sheet)], null).checks.length >= 1);
  // 東映のカメラコード
  out("\n=== 東映カメラコード・尺編集・テキスト記法 ===");
  const gtd = api.parseAuxBlocks(read("samples/sample_01_001.tdts"));
  check("tdts のカメラ欄が読める", gtd.camera.length === 1 && gtd.camera[0].kind === "PAN");
  check("カット同一性: 番号のゼロ埋め差は同じ、カット・話数が変われば別（保存先が変わる鍵）",
    api.cutKey({ cut: { title: "abc", episode: "7", scene: "", cut: "8" } }) === api.cutKey({ cut: { title: "abc ", episode: "07", scene: "", cut: "008" } })
    && api.cutKey({ cut: { title: "abc", episode: "17", scene: "", cut: "178" } }) !== api.cutKey({ cut: { title: "abc", episode: "17", scene: "", cut: "179" } })
    && api.cutKey({ cut: { title: "abc", episode: "17", scene: "", cut: "178" } }) !== api.cutKey({ cut: { title: "abc", episode: "18", scene: "", cut: "178" } }));
  check("表記: 話数 00・カット 000（数字だけゼロ埋め）", api.fmtEpisode("7") === "07" && api.fmtEpisode("17") === "17" && api.fmtCut("8") === "008" && api.fmtCut("178") === "178" && api.fmtCut("A12") === "A12" && api.joinDtsEpisode({ title: "abc", episode: "7" }) === "abc#07");
  check("DTS 話数欄 abc#17 → 作品名 abc・話数 17", JSON.stringify(api.splitDtsEpisode("abc#17")) === JSON.stringify({ title: "abc", episode: "17" }) && api.joinDtsEpisode({ title: "abc", episode: "17" }) === "abc#17" && api.splitDtsEpisode("17").episode === "17");
  check("未知のコードは数字のまま", api.cameraFromTdtsValue("7").text === "7" && api.cameraFromTdtsValue("7").kind === "");
  const vd2 = api.newDoc(api.modelFromParsed(api.parseXdts(read("samples/sample_01_001.xdts"))[0]), {});
  vd2.sheet.camera.push({ from: 1, to: 10, lane: 0, kind: "PAN", fromLabel: "", toLabel: "", text: "" });
  const tj2 = JSON.parse(api.writeTdts(vd2, {}).split("\n").slice(1).join("\n"));
  check("PAN は tdts へ \"12\" で戻る", tj2.timeSheets[0].timeTables[0].fields[2].tracks[0].frames[0].data[0].values[0] === "12");
  // 挿入・削除
  const sh = { duration: 8, layers: [{ name: "A", cells: ["1","1","1","2","2",E,E,"3"] }], douga: [], dialogue: [{ from: 2, to: 6, speaker: "x", kind: "", text: "t", lane: 0 }], camera: [{ from: 7, to: 8, kind: "FIX", fromLabel: "", toLabel: "", text: "", lane: 0 }] };
  api.insertFrames(sh, 4, 2);
  check("挿入: ホールドが伸びる 1 1 1 1 1 2 2 × × 3", sh.layers[0].cells.join() === "1,1,1,1,1,2,2,×,×,3" && sh.duration === 10);
  check("挿入: 跨ぐ台詞は伸び、後ろのカメラはずれる", sh.dialogue[0].to === 8 && sh.camera[0].from === 9 && sh.camera[0].to === 10);
  api.deleteFrames(sh, 2, 3);
  check("削除: 1 1 2 2 × × 3", sh.layers[0].cells.join() === "1,1,2,2,×,×,3" && sh.duration === 7);
  check("削除: 跨ぐ台詞は縮む", sh.dialogue[0].from === 2 && sh.dialogue[0].to === 5);
  api.deleteFrames(sh, 6, 2);
  check("削除: 消えるブロックは消える", sh.camera.length === 0 && sh.duration === 5);
  // 余尺
  const sk = { duration: 6, slack: 0, layers: [{ name: "A", cells: ["1","1","1","2","2","2"] }], douga: [], dialogue: [], camera: [] };
  api.setSlack(sk, 4);
  check("余尺を付けるとホールドが余尺へ続く", sk.layers[0].cells.join() === "1,1,1,2,2,2,2,2,2,2" && api.totalFrames(sk) === 10);
  api.setDuration(sk, 8);
  check("本尺を変えても余尺は保たれる", sk.duration === 8 && sk.slack === 4 && sk.layers[0].cells.length === 12);
  api.deleteFrames(sk, 10, 2);
  check("余尺の中を切ると余尺が縮む", sk.duration === 8 && sk.slack === 2);
  api.deleteFrames(sk, 8, 2);
  check("本尺と余尺を跨いで切ると両方縮む", sk.duration === 7 && sk.slack === 1);
  api.insertFrames(sk, 9, 3);
  check("余尺の中に足すと余尺が伸びる", sk.duration === 7 && sk.slack === 4);
  const xk = api.parseXdts(api.writeXdts(sk))[0];
  check("書き出しの duration は総尺", xk.duration === 11);
  const hk = { duration: 5, slack: 0, slackHead: 0, layers: [{ name: "A", cells: ["1","1","2","2","2"] }], douga: [], dialogue: [{ from: 2, to: 4, speaker: "", kind: "", text: "t", lane: 0 }], camera: [] };
  api.setSlackHead(hk, 3);
  check("頭の余尺: 先頭に空が入り台詞がずれる", hk.layers[0].cells.join() === "×,×,×,1,1,2,2,2" && hk.dialogue[0].from === 5 && hk.duration === 5 && api.totalFrames(hk) === 8);
  check("表示番号: 頭の余尺は負、本尺は 1 から", [1,2,3,4,8].map(k => api.displayKoma(hk, k)).join() === "-3,-2,-1,1,5");
  api.deleteFrames(hk, 2, 3);
  check("頭余尺と本尺を跨いで切る", hk.slackHead === 1 && hk.duration === 4);
  api.setSlackHead(hk, 0);
  check("頭の余尺を戻す", hk.slackHead === 0 && hk.layers[0].cells.length === 4 && hk.dialogue[0].from >= 1);
  // 手書きの線はコマ単位で持ち、挿入・削除・頭余尺でずれる
  const ik = { duration: 10, slack: 0, slackHead: 0, layers: [{ name: "A", cells: new Array(10).fill(E) }], douga: [], dialogue: [], camera: [], ink: [{ id: "k1", zone: "sheet", color: "shu", width: "thin", points: [{ c: "g:0", fx: 0.5, y: 4.5, p: 0.5 }, { c: "g:0", fx: 0.6, y: 6.2, p: 0.5 }] }, { id: "k2", zone: "memo", color: "black", width: "thin", points: [{ fx: 0.2, y: 0.3, p: 0.5 }] }] };
  api.insertFrames(ik, 3, 2);
  check("挿入で線がずれる（メモ欄の線は動かない）", ik.ink[0].points[0].y === 6.5 && ik.ink[1].points[0].y === 0.3);
  api.deleteFrames(ik, 6, 3);
  check("削除で線が寄る", ik.ink[0].points[0].y === 5 && Math.abs(ik.ink[0].points[1].y - 5.2) < 1e-9);
  api.setSlackHead(ik, 2);
  check("頭の余尺で線がずれる", ik.ink[0].points[0].y === 7);
  const idoc = api.newDoc({ duration: 4, layers: [{ name: "A", cells: [E,E,E,E] }] }, {});
  api.commitDoc(idoc, { who: "a" }); idoc.sheet.ink.push({ id: "k9", zone: "sheet", color: "shu", width: "thin", points: [{ c: "g:0", fx: 0.5, y: 1, p: 0.5 }] });
  check("線の変化は版の差分に出る", api.diffSheets(idoc.history[0].sheet, idoc.sheet).ink === true && api.docFingerprint(idoc) !== idoc.history[0].fingerprint);
  // テキスト記法
  const L = [{ name: "A", cells: ["1","1",T,"1","2","2",E,E,"3","3"] }];
  const txt = api.layersToText(L);
  check("セル → 記法: A: 1 n dot n 2 n x n 3", txt === "A: 1 n dot n 2 n x n 3");
  check("記法 → セル 往復", JSON.stringify(api.textToLayers(txt, 10)) === JSON.stringify(L));
  check("記法: 短い行は最後の値でホールド", api.textToLayers("B: 1 2", 4)[0].cells.join() === "1,2,2,2");
  const dl = [{ from: 1, to: 28, speaker: "太郎", kind: "M", text: "よね？", lane: 0 }];
  check("台詞 → 記法", api.dialogueToText(dl) === "0+01 | 1+04 | 太郎(M) | よね？");
  const dl2 = api.textToDialogue(api.dialogueToText(dl), 100);
  const dlj = api.textToDialogue("０＋０１｜１＋０４｜太郎(M)｜おはよう", 100);
  check("全角の縦棒・数字・＋でも読める", dlj.length === 1 && dlj[0].from === 1 && dlj[0].to === 28 && dlj[0].speaker === "太郎" && dlj[0].kind === "M" && dlj[0].text === "おはよう");
  check("台詞 記法 往復", dl2.length === 1 && dl2[0].speaker === "太郎" && dl2[0].kind === "M" && dl2[0].text === "よね？" && dl2[0].from === 1 && dl2[0].to === 28);
  const cm = [{ from: 1, to: 24, kind: "PAN", fromLabel: "A", toLabel: "B", text: "", lane: 0 }];
  check("カメラ → 記法: 0+01 | 1+00 | A | PAN | B", api.cameraToText(cm) === "0+01 | 1+00 | A | PAN | B");
  const cm2 = api.textToCamera(api.cameraToText(cm), 100);
  check("カメラ 記法 往復", cm2.length === 1 && cm2[0].kind === "PAN" && cm2[0].fromLabel === "A" && cm2[0].toLabel === "B");

  out(fail ? "\nNG " + fail + "件" : "\n全項目 OK");
  if (isNode && fail) process.exit(1);
})();
