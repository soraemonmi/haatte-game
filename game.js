(() => {
  "use strict";

  const $ = id => document.getElementById(id);

  const S = {
    ws: null,
    me: null,
    room: null,
    mode: "player",
    hostId: null,
    timer: null,
    selected: null,
    current: null
  };

  const themes = [
    "はぁ", "えー", "んー", "うん", "はい", "うそ", "なんで", "そんな", "もう", "いやー",
    "うわーっ", "大丈夫", "がんばれ", "ありがとう", "おやすみ", "おーい", "ちょっと",
    "あぁ", "ヤバい", "好き", "名前を呼ぶ", "自己紹介", "笑い声", "寝顔","拍手", "ため息", "びっくり", "強がり", "謝る", "応援", "告白", "ねるねるねるね"
  ];

  const preview = $("themePreview");
  themes.forEach(x => {
    const e = document.createElement("span");
    e.className = "chip";
    e.textContent = x;
    preview.appendChild(e);
  });

  function esc(v) {
    return String(v).replace(/[&<>"']/g, c => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    }[c]));
  }

  function screen(id) {
    document.querySelectorAll(".screen").forEach(x => x.classList.remove("active"));
    $(id).classList.add("active");
  }

  function toast(m) {
    const e = $("toast");
    e.textContent = m;
    e.classList.remove("hidden");
    clearTimeout(toast.t);
    toast.t = setTimeout(() => e.classList.add("hidden"), 3500);
  }

  function send(type, p = {}) {
    if (S.ws?.readyState === WebSocket.OPEN) {
      S.ws.send(JSON.stringify({ type, ...p }));
    }
  }

  function name() {
    const n = $("nameInput").value.trim().slice(0, 16);
    if (!n) toast("名前を入力してください");
    return n || null;
  }

  function chooseRoom(mode) {
    $("roomInputWrap").classList.remove("hidden");
    $("enterRoomBtn").dataset.mode = mode;
    $("roomInput").focus();
  }

  $("joinBtn").onclick = () => chooseRoom("player");
  $("spectateBtn").onclick = () => chooseRoom("spectator");
  $("createBtn").onclick = () => {
    const n = name();
    if (n) connect("create", { name: n, mode: "player" });
  };

  $("enterRoomBtn").onclick = () => {
    const n = name();
    if (!n) return;

    const r = $("roomInput").value.trim().toUpperCase();
    if (!r) {
      toast("ルームIDを入力してください");
      return;
    }

    connect("join", {
      name: n,
      room: r,
      mode: $("enterRoomBtn").dataset.mode || "player"
    });
  };

  $("copyRoomBtn").onclick = async () => {
    try {
      await navigator.clipboard.writeText(S.room);
      toast("ルームIDをコピーしました");
    } catch {
      toast("コピーできませんでした");
    }
  };

  $("leaveBtn").onclick = () => {
    try { S.ws?.close(); } catch {}
    location.reload();
  };

  $("startBtn").onclick = () => send("start_game");
  $("nextRoundBtn").onclick = () => send("next_round");
  $("restartGameBtn").onclick = () => send("restart_game");

  function connect(action, payload) {
    const p = location.protocol === "https:" ? "wss" : "ws";
    S.ws = new WebSocket(`${p}://${location.host}`);

    S.ws.onopen = () => send(action, payload);
    S.ws.onmessage = async e => {
      try {
        handle(JSON.parse(e.data));
      } catch (err) {
        console.error(err);
      }
    };
    S.ws.onerror = () => toast("サーバー接続に失敗しました");
    S.ws.onclose = () => {
      if (!["homeScreen"].some(id => $(id).classList.contains("active"))) {
        toast("サーバーとの接続が切れました");
      }
    };
  }

  function handle(m) {
    if (m.type === "joined") {
      S.me = m.me;
      S.room = m.room;
      S.hostId = m.hostId;
      S.mode = m.mode;
      $("roomCodeText").textContent = S.room;
      screen("lobbyScreen");
      updateLobby(m.roomState);
      return;
    }

    if (m.type === "room_state") {
      S.hostId = m.roomState.hostId;
      updateLobby(m.roomState);
      updateGamePeople(m.roomState);

      if (S.current && m.roomState.phase !== "lobby") {
        S.current = { ...S.current, ...m.roomState };
      }
      return;
    }

    if (m.type === "game_started" || m.type === "game_update") {
      S.current = m.state;
      renderGame(m.state);
      screen("gameScreen");
      return;
    }

    if (m.type === "error") {
      toast(m.message || "エラー");
    }
  }

  function updateLobby(r) {
    $("playerCount").textContent = `${r.players.length}/20`;
    $("spectatorCount").textContent = r.spectators.length;
    $("hostControls").classList.toggle(
      "hidden",
      !(S.me?.id === r.hostId && S.mode === "player")
    );

    $("playerList").innerHTML = r.players.map(p => {
      const tags = [];
      if (p.id === r.hostId) tags.push('<span class="tag host">ホスト</span>');
      if (p.id === S.me.id) tags.push('<span class="tag self">自分</span>');
      return `<div class="person"><span class="person-name">${esc(p.name)}</span><span>${tags.join(" ")}</span></div>`;
    }).join("") || '<div class="muted">まだいません</div>';

    $("spectatorList").innerHTML = r.spectators.map(p =>
      `<div class="person"><span class="person-name">${esc(p.name)}</span><span class="tag">観戦</span></div>`
    ).join("") || '<div class="muted">まだいません</div>';
  }

  function updateGamePeople(r) {
    if (!r?.players) return;

    $("inGamePeople").innerHTML = r.players.map(p => {
      let t = "";
      if (p.id === r.actorId) {
        t = '<span class="tag actor">演技中</span>';
      } else if (p.id === r.hostId) {
        t = '<span class="tag host">ホスト</span>';
      }
      return `<div class="person"><span class="person-name">${esc(p.name)}</span>${t}</div>`;
    }).join("");
  }

  function renderGame(s) {
    $("roundText").textContent = `${s.round} / ${s.totalRounds}`;
    $("phaseText").textContent =
      s.phase === "act" ? "演技中" :
      s.phase === "vote" ? "投票" :
      s.phase === "result" ? "結果" : "終了";

    $("actorText").textContent = `${esc(s.actorName)}さん`;
    $("lineText").textContent = s.line;
    $("actPhase").classList.toggle("hidden", s.phase !== "act");
    $("votePhase").classList.toggle("hidden", s.phase !== "vote");
    $("resultPhase").classList.toggle("hidden", s.phase !== "result");

    const mine = s.actorId === S.me?.id && s.myRole;
    $("myRoleBox").classList.toggle("hidden", !mine);
    if (mine) $("myRoleText").textContent = s.myRole;

    if (s.phase === "act") startTimer(s.endsAt);
    else stopTimer();

    if (s.phase === "vote") {
      const can = S.mode === "player" && S.me.id !== s.actorId;

      $("choiceGrid").innerHTML = s.choices.map(c => `
        <button class="choice ${S.selected === c.id ? "selected" : ""}" ${can ? "" : "disabled"} data-choice="${esc(c.id)}">
          <span class="choice-letter">${esc(c.id)}</span><span>${esc(c.text)}</span>
        </button>
      `).join("");

      document.querySelectorAll("[data-choice]").forEach(b => {
        b.onclick = () => {
          if (S.selected) return;
          S.selected = b.dataset.choice;
          send("vote", { choiceId: S.selected });
          b.classList.add("selected");
          $("voteStatus").textContent = "回答を送信しました";
        };
      });

      $("voteTitle").textContent = `${s.actorName}さんの「${s.line}」はどれ？`;
      $("voteStatus").textContent = can
        ? "1人1票です。"
        : "演技者・観戦者は投票できません。";
    }

    if (s.phase === "result") {
      $("correctAnswer").textContent = `${s.correctId}：${s.correctText}`;
      $("resultDetails").textContent = `演技者：${s.actorName}`;

      $("resultVotes").innerHTML = (s.voteSummary || []).map(v =>
        `<div class="vote-row"><b>${esc(v.id)}</b><span>${esc(v.text)}</span><strong>${v.count}票</strong></div>`
      ).join("");

      $("rankingList").innerHTML = (s.ranking || []).map((p, i) =>
        `<div class="rank-row"><span>${i + 1}</span><span class="person-name">${esc(p.name)}</span><span class="score">${p.score}点</span></div>`
      ).join("");

      $("nextRoundBtn").classList.toggle(
        "hidden",
        S.me.id !== S.hostId || s.round >= s.totalRounds
      );
      $("restartGameBtn").classList.toggle(
        "hidden",
        S.me.id !== S.hostId
      );
    }

    updateGamePeople(s);
    S.selected = null;
  }

  function startTimer(end) {
    stopTimer();
    const f = () => {
      $("timerText").textContent = Math.max(
        0,
        Math.ceil((end - Date.now()) / 1000)
      );
    };
    f();
    S.timer = setInterval(f, 200);
  }

  function stopTimer() {
    clearInterval(S.timer);
    S.timer = null;
  }
})();
