const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const WebSocket = require("ws");

const PORT = Number(process.env.PORT || 3000);
const ROOT = __dirname;
const MAX_PLAYERS = 20;
const MAX_SPECTATORS = 50;
const ACT_SECONDS = 20;

const THEMES = [
  {title:"はぁ", variants:["疑問形","ため息","感心","怒り","とぼけ","驚き","失恋","やる気"]},
  {title:"えー", variants:["嬉しい驚き","不満","信じられない","困惑","納得できない","照れ","安心","半信半疑"]},
  {title:"んー", variants:["考え中","迷う","納得","不満","眠い","おいしい","疑う","困る"]},
  {title:"うん", variants:["普通の返事","強い同意","しぶしぶ","疑い","励ます","秘密を知っている","眠そう","嬉しい"]},
  {title:"はい", variants:["元気よく","小さく返事","しぶしぶ","敬語っぽく","怒り気味","驚いて","自信満々","やる気ゼロ"]},
  {title:"うそ", variants:["本当に驚く","冗談","疑う","怒る","呆れる","喜び","泣きそう","信じたくない"]},
  {title:"なんで", variants:["純粋な疑問","怒り","悲しみ","驚き","呆れ","甘え","焦り","納得できない"]},
  {title:"そんな", variants:["信じられない","嬉しい驚き","呆れ","怒り","怖い","納得","困惑","照れ"]},
  {title:"もう", variants:["諦める","怒る","甘える","急かす","照れ","悲しい","冗談","納得"]},
  {title:"いやー", variants:["本気で嫌","照れ隠し","嬉しい悲鳴","驚き","困る","遠慮","冗談","拒否しきれない"]},
  {title:"うわーっ", variants:["怖い","嬉しい","大発見","失敗","びっくり","感動","絶望","テンションMAX"]},
  {title:"大丈夫", variants:["本当に心配して","無理して平気なふり","怒って","優しく","焦って","疑って","励ます","強がり"]},
  {title:"がんばれ", variants:["全力応援","小声で応援","敵を応援","焦って応援","優しく","照れながら","諦め気味","笑いながら"]},
  {title:"ありがとう", variants:["心から感謝","軽く感謝","申し訳なさ","皮肉","感動","照れ","疲れて","大喜び"]},
  {title:"おやすみ", variants:["優しく","眠そう","そっけなく","怒り気味","照れ","安心","子どもっぽく","遠くから"]},
  {title:"おーい", variants:["遠くの人へ","急いで呼ぶ","怒って呼ぶ","嬉しそう","小声","探している","呆れて","驚いて"]},
  {title:"ちょっと", variants:["呼び止める","怒りの注意","お願い","驚き","秘密話","急かす","困る","照れ"]},
  {title:"あぁ", variants:["納得","落胆","感動","疲労","閃き","不安","安心","がっかり"]},
  {title:"ヤバい", variants:["嬉しい","焦る","怖い","面白い","すごい","困った","興奮","疑う"]},
  {title:"好き", variants:["友達として","尊敬","食べ物への愛","推しへの熱","冗談","恥ずかしい","本気の告白風","やっぱり好き"]},
  {title:"名前を呼ぶ", variants:["急いで呼ぶ","遠くから呼ぶ","小声で呼ぶ","怒って呼ぶ","嬉しく呼ぶ","驚いて呼ぶ","お願いするように","内緒話風"]},
  {title:"自己紹介", variants:["元気に","緊張して","自信満々","小声","大げさに","眠そう","初対面で丁寧に","照れながら"]},
  {title:"笑い声", variants:["我慢して笑う","大爆笑","愛想笑い","悪だくみの笑い","照れ笑い","苦笑い","驚きの笑い","つられ笑い"]},
  {title:"ため息", variants:["疲れた","安心","呆れ","嬉しい","困った","恋愛ドラマ風","試験後","宿題を終えて"]},
  {title:"びっくり", variants:["嬉しい","怖い","予想外","照れ","怒り","感動","眠気から覚める","ドッキリ"]},
  {title:"強がり", variants:["怖いのに平気","負けたのに強気","寂しいのに平気","失敗したのに余裕","緊張してないふり","悔しいのに笑う","知らないふり","大丈夫なふり"]},
  {title:"謝る", variants:["本気で謝罪","軽く謝る","照れながら","怒られた後","仲直りしたい","言い訳しながら","申し訳なさそうに","早く終わらせたい"]},
  {title:"応援", variants:["試合前","落ち込んだ友達へ","あと一歩","静かに背中を押す","大声で","失敗しても応援","照れながら","冗談っぽく"]},
  {title:"ねるねるねるね", variants:["分かってない風","嬉しい風","必殺技風","誰かに食べられた風","ぶりっこ風","高速で通り過ぎた風","嫌い風"]}
];

function pickTheme() {
  const t = THEMES[Math.floor(Math.random() * THEMES.length)];
  const shuffled = t.variants.slice().sort(() => Math.random() - 0.5);
  return {
    title: t.title,
    options: shuffled.slice(0, 8).map((text, i) => ({
      id: String.fromCharCode(65 + i),
      text
    }))
  };
}

function uid() {
  return crypto.randomBytes(8).toString("hex");
}

function code() {
  let c;
  do {
    c = crypto.randomBytes(3).toString("hex").toUpperCase();
  } while (rooms.has(c));
  return c;
}

const rooms = new Map();

function newRoom() {
  const r = {
    code: code(),
    hostId: null,
    phase: "lobby",
    players: [],
    spectators: [],
    round: 0,
    totalRounds: 0,
    turnIndex: 0,
    actorId: null,
    actorName: "",
    theme: null,
    roles: new Map(),
    votes: new Map(),
    scores: new Map(),
    endsAt: 0
  };
  rooms.set(r.code, r);
  return r;
}

function all(r) {
  return [...r.players, ...r.spectators];
}

function pub(r) {
  return {
    code: r.code,
    hostId: r.hostId,
    phase: r.phase,
    round: r.round,
    totalRounds: r.totalRounds,
    actorId: r.actorId,
    actorName: r.actorName,
    line: r.theme?.title || "",
    endsAt: r.endsAt,
    players: r.players.map(p => ({id: p.id, name: p.name})),
    spectators: r.spectators.map(p => ({id: p.id, name: p.name}))
  };
}

function send(p, x) {
  if (p?.ws?.readyState === WebSocket.OPEN) {
    p.ws.send(JSON.stringify(x));
  }
}

function broadcastRoom(r) {
  for (const p of all(r)) send(p, {type: "room_state", roomState: pub(r)});
}

function ranks(r) {
  return r.players
    .map(p => ({id: p.id, name: p.name, score: r.scores.get(p.id) || 0}))
    .sort((a, b) => b.score - a.score);
}

function gameState(r, p) {
  const role = r.roles.get(p.id);
  const o = {
    phase: r.phase,
    round: r.round,
    totalRounds: r.totalRounds,
    actorId: r.actorId,
    actorName: r.actorName,
    line: r.theme?.title || "",
    endsAt: r.endsAt,
    hostId: r.hostId,
    choices: r.theme?.options || [],
    ranking: ranks(r),
    myRole: p.id === r.actorId && role ? `${role.id}：${role.text}` : null
  };

  if (r.phase === "result") {
    const correct = r.roles.get(r.actorId);
    o.correctId = correct.id;
    o.correctText = correct.text;
    o.voteSummary = (r.theme.options || []).map(c => ({
      id: c.id,
      text: c.text,
      count: [...r.votes.values()].filter(v => v === c.id).length
    }));
  }

  return o;
}

function broadcastGame(r) {
  for (const p of all(r)) send(p, {type: "game_update", state: gameState(r, p)});
}

function startRound(r) {
  if (!r.players.length) return;

  r.round++;
  r.turnIndex = (r.round - 1) % r.players.length;

  const actor = r.players[r.turnIndex];
  r.actorId = actor.id;
  r.actorName = actor.name;
  r.theme = pickTheme();

  const chosen = r.theme.options[Math.floor(Math.random() * r.theme.options.length)];
  r.roles.clear();
  r.roles.set(actor.id, chosen);

  r.votes.clear();
  r.phase = "act";
  r.endsAt = Date.now() + ACT_SECONDS * 1000;

  broadcastRoom(r);
  broadcastGame(r);

  setTimeout(() => {
    if (
      rooms.get(r.code) === r &&
      r.phase === "act" &&
      Date.now() >= r.endsAt
    ) {
      startVote(r);
    }
  }, ACT_SECONDS * 1000 + 150);
}

function startVote(r) {
  if (r.phase !== "act") return;
  r.phase = "vote";
  r.endsAt = 0;
  broadcastRoom(r);
  broadcastGame(r);
}

function finish(r) {
  if (r.phase !== "vote") return;

  r.phase = "result";
  const correct = r.roles.get(r.actorId);
  let n = 0;

  for (const p of r.players) {
    if (p.id === r.actorId) continue;
    if (r.votes.get(p.id) === correct.id) {
      r.scores.set(p.id, (r.scores.get(p.id) || 0) + 1);
      n++;
    }
  }

  r.scores.set(
    r.actorId,
    (r.scores.get(r.actorId) || 0) + Math.min(3, Math.ceil(n / 2))
  );

  broadcastRoom(r);
  broadcastGame(r);
}

function next(r) {
  if (r.round >= r.totalRounds) {
    r.phase = "finished";
    broadcastRoom(r);
    broadcastGame(r);
    return;
  }
  startRound(r);
}

function restartGame(r, p) {
  if (r.hostId !== p.id) {
    return send(p, { type: "error", message: "ホストだけがリスタートできます" });
  }
  if (r.players.length < 2) {
    return send(p, { type: "error", message: "プレイヤーが2人以上必要です" });
  }

  r.round = 0;
  r.turnIndex = 0;
  r.actorId = null;
  r.actorName = "";
  r.theme = null;
  r.roles.clear();
  r.votes.clear();
  r.scores = new Map(r.players.map(x => [x.id, 0]));
  r.totalRounds = r.players.length;

  startRound(r);
}

function startGame(r, p) {
  if (r.hostId !== p.id) {
    return send(p, {type: "error", message: "ホストだけが開始できます"});
  }

  if (r.players.length < 2) {
    return send(p, {type: "error", message: "プレイヤーが2人以上必要です"});
  }

  r.round = 0;
  r.totalRounds = r.players.length;
  r.scores = new Map(r.players.map(x => [x.id, 0]));
  startRound(r);
}

function find(ws) {
  for (const r of rooms.values()) {
    const p = all(r).find(x => x.ws === ws);
    if (p) return {r, p};
  }
  return null;
}

function handle(ws, m) {
  if (m.type === "create") {
    const r = newRoom();
    const p = {
      id: uid(),
      name: String(m.name || "名無し").slice(0, 16),
      mode: "player",
      ws
    };

    r.hostId = p.id;
    r.players.push(p);
    ws._room = r.code;
    ws._id = p.id;

    return send(p, {
      type: "joined",
      me: {id: p.id, name: p.name},
      room: r.code,
      hostId: r.hostId,
      mode: "player",
      roomState: pub(r)
    });
  }

  if (m.type === "join") {
    const r = rooms.get(String(m.room || "").toUpperCase());
    if (!r) return send({ws}, {type: "error", message: "ルームがありません"});

    const mode = m.mode === "spectator" ? "spectator" : "player";

    if (mode === "player" && r.players.length >= MAX_PLAYERS) {
      return send({ws}, {type: "error", message: "プレイヤーは20人までです"});
    }

    if (mode === "spectator" && r.spectators.length >= MAX_SPECTATORS) {
      return send({ws}, {type: "error", message: "観戦者が多すぎます"});
    }

    if (mode === "player" && r.phase !== "lobby") {
      return send({ws}, {
        type: "error",
        message: "ゲーム中はプレイヤー参加できません。観戦してください"
      });
    }

    const p = {
      id: uid(),
      name: String(m.name || "名無し").slice(0, 16),
      mode,
      ws
    };

    if (mode === "player") r.players.push(p);
    else r.spectators.push(p);

    r.scores.set(p.id, 0);
    ws._room = r.code;
    ws._id = p.id;

    send(p, {
      type: "joined",
      me: {id: p.id, name: p.name},
      room: r.code,
      hostId: r.hostId,
      mode,
      roomState: pub(r)
    });

    broadcastRoom(r);

    if (r.phase !== "lobby") {
      send(p, {type: "game_update", state: gameState(r, p)});
    }
    return;
  }

  const info = find(ws);
  if (!info) return send({ws}, {type: "error", message: "ルームに入ってください"});

  const {r, p} = info;

  if (m.type === "start_game") {
    return startGame(r, p);
  }

  if (m.type === "next_round") {
    if (p.id === r.hostId && r.phase === "result") next(r);
    return;
  }
  if (m.type === "restart_game") {
    return restartGame(r, p);
  }

  if (m.type === "vote") {
    if (
      r.phase !== "vote" ||
      p.mode !== "player" ||
      p.id === r.actorId ||
      r.votes.has(p.id)
    ) return;

    if (!r.theme.options.some(c => c.id === m.choiceId)) return;

    r.votes.set(p.id, m.choiceId);
    broadcastGame(r);

    if (r.votes.size >= r.players.filter(x => x.id !== r.actorId).length) {
      finish(r);
    }
  }
}

const server = http.createServer((req, res) => {
  let u = decodeURIComponent((req.url || "/").split("?")[0]);
  if (u === "/") u = "/index.html";

  const file = path.join(
    ROOT,
    path.normalize(u).replace(/^(\.\.[/\\])+/, "")
  );

  fs.readFile(file, (e, d) => {
    if (e) {
      res.writeHead(404, {"Content-Type": "text/plain; charset=utf-8"});
      return res.end("Not Found");
    }

    const types = {
      ".html": "text/html; charset=utf-8",
      ".css": "text/css; charset=utf-8",
      ".js": "text/javascript; charset=utf-8"
    };

    res.writeHead(200, {
      "Content-Type": types[path.extname(file)] || "application/octet-stream",
      "Cache-Control": "no-store"
    });
    res.end(d);
  });
});

const wss = new WebSocket.Server({server});

wss.on("connection", ws => {
  ws.on("message", data => {
    try {
      handle(ws, JSON.parse(data.toString()));
    } catch (e) {
      console.error(e);
      send({ws}, {type: "error", message: "通信エラー"});
    }
  });

  ws.on("close", () => {
    const x = find(ws);
    if (!x) return;

    const {r, p} = x;
    r.players = r.players.filter(v => v !== p);
    r.spectators = r.spectators.filter(v => v !== p);
    r.scores.delete(p.id);

    if (r.hostId === p.id) {
      r.hostId = r.players[0]?.id || null;
    }

    if (!r.players.length && !r.spectators.length) {
      rooms.delete(r.code);
      return;
    }

    if (r.actorId === p.id && r.phase === "act") {
      startVote(r);
    }

    broadcastRoom(r);
    if (r.phase !== "lobby") broadcastGame(r);
  });
});

server.listen(PORT, () => {
  console.log(`はぁって言うゲーム: http://localhost:${PORT}`);
});
