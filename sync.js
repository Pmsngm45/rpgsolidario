/* ============================================================
   RPG NEXUS — SYNC
   Mantém o localStorage como cache rápido e sincroniza tudo com
   /api/records (Neon), para que todos os jogadores vejam as mesmas
   fichas. Carregar logo DEPOIS de data.js e ANTES de app.js.
============================================================ */
(function () {
  "use strict";

  const API = "/api/records";
  const POLL_MS = 5000;

  const MAP = {
    rpg_characters: "characters",
    rpg_npcs: "npcs",
    rpg_markers: "markers",
    rpg_initiative: "combatants",
    rpg_placements: "placements",
    rpg_groups: "groups"
  };
  const KINDS = Object.values(MAP);
  const KEY_OF = Object.fromEntries(Object.entries(MAP).map(([k, v]) => [v, k]));
  const SORTED = new Set(["characters", "npcs", "groups"]);

  const origSet = window.setStore;
  const origGet = window.getStore;

  const known = Object.fromEntries(KINDS.map(k => [k, new Map()]));
  const dirty = new Set();

  let since = null;
  let pushing = false;
  let pulling = false;
  let pushTimer = null;
  let pollTimer = null;
  let localMode = false;

  // Sem API (ex.: Live Server na porta 5500): funciona só com o localStorage.
  function localOnly() {
    if (localMode) return;
    localMode = true;
    clearInterval(pollTimer);
    clearTimeout(pushTimer);
    dirty.clear();
    status("Modo local (sem API)", "error");
    console.info(
      "sync: /api/records não existe neste servidor. As fichas ficam só neste navegador. " +
      "Use 'vercel dev' ou o site publicado na Vercel para compartilhar."
    );
  }

  /* ---------- utilitários ---------- */

  const canon = v =>
    Array.isArray(v) ? v.map(canon)
    : v && typeof v === "object"
      ? Object.fromEntries(Object.keys(v).sort().map(k => [k, canon(v[k])]))
      : v;
  const sig = o => JSON.stringify(canon(o));

  const list = key => {
    const v = origGet(key, []);
    return Array.isArray(v) ? v : [];
  };

  const writeLocal = (key, value) => {
    try { localStorage.setItem(key, JSON.stringify(value)); }
    catch (e) { console.warn("sync: localStorage cheio", e); }
  };

  function status(text, state) {
    const el = document.getElementById("dbStatus");
    if (!el) return;
    el.textContent = text;
    el.dataset.status = state;
  }

  function playerName() {
    let name = localStorage.getItem("nexus_player");
    if (!name) {
      name = (prompt("Qual é o seu nome? (aparece nas fichas que você criar)") || "")
        .trim().slice(0, 40) || "Anônimo";
      localStorage.setItem("nexus_player", name);
    }
    return name;
  }

  function toRow(kind, item) {
    const data = { ...item };
    let image = null;
    if (typeof data.image === "string" && data.image.startsWith("data:")) {
      image = data.image;
      delete data.image;
    }
    return {
      kind,
      id: String(item.id),
      name: item.name || null,
      universe: item.universe || null,
      data,
      image
    };
  }

  function fromRow(row) {
    const item = { ...(row.data || {}) };
    if (item.id == null) item.id = row.id;
    if (row.image) item.image = row.image;
    return item;
  }

  /* ---------- gravação (navegador → banco) ---------- */

  window.setStore = function (key, value) {
    const kind = MAP[key];

    if (kind && Array.isArray(value)) {
      value.forEach(item => {
        if (!item || typeof item !== "object") return;
        if (item.id == null) item.id = window.uid();
        if ((kind === "characters" || kind === "npcs") &&
            !item.owner && !known[kind].has(String(item.id))) {
          item.owner = playerName();
        }
      });
    }

    const ok = origSet.call(window, key, value);

    if (kind && !localMode) {
      dirty.add(key);
      schedulePush(600);
    }
    return ok;
  };

  function schedulePush(ms) {
    clearTimeout(pushTimer);
    pushTimer = setTimeout(push, ms);
  }

  async function post(body) {
    const res = await fetch(API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    if (res.status === 404) {
      localOnly();
      throw new Error("API indisponível");
    }
    if (!res.ok) {
      let msg = res.status;
      try { msg = (await res.json()).error || msg; } catch {}
      throw new Error(msg);
    }
  }

  async function push() {
    if (localMode || pushing || !dirty.size) return;
    pushing = true;
    const keys = [...dirty];
    dirty.clear();
    let failed = false;

    try {
      const ups = [];
      const dels = [];
      const after = [];

      for (const key of keys) {
        const kind = MAP[key];
        const current = new Map();
        list(key).forEach(item => {
          if (item && item.id != null) current.set(String(item.id), item);
        });

        current.forEach((item, id) => {
          const s = sig(item);
          if (known[kind].get(id) !== s) {
            ups.push(toRow(kind, item));
            after.push([kind, id, s]);
          }
        });
        known[kind].forEach((_, id) => {
          if (!current.has(id)) dels.push({ kind, id });
        });
      }

      for (let i = 0; i < ups.length; i += 8) {
        await post({ upserts: ups.slice(i, i + 8) });
      }
      if (dels.length) await post({ deletes: dels });

      after.forEach(([kind, id, s]) => known[kind].set(id, s));
      dels.forEach(d => known[d.kind].delete(d.id));
      status("Banco online", "connected");
    } catch (error) {
      failed = true;
      keys.forEach(k => dirty.add(k));
      status("Sem conexão com o banco", "error");
      console.warn("sync: falha ao enviar", error);
    } finally {
      pushing = false;
      if (dirty.size) schedulePush(failed ? 8000 : 600);
    }
  }

  /* ---------- leitura (banco → navegador) ---------- */

  async function pull() {
    if (localMode || pushing || pulling || dirty.size) return;
    pulling = true;

    try {
      const url = API + (since ? `?since=${encodeURIComponent(since)}` : "");
      const res = await fetch(url, { cache: "no-store" });
      if (res.status === 404) {
        localOnly();
        return;
      }
      if (!res.ok) {
        let msg = res.status;
        try { msg = (await res.json()).error || msg; } catch {}
        throw new Error(msg);
      }
      const data = await res.json();
      if (pushing || dirty.size) return;

      const incomingByKind = {};
      (data.rows || []).forEach(row => (incomingByKind[row.kind] ||= []).push(row));

      const changed = new Set();

      for (const kind of KINDS) {
        const key = KEY_OF[kind];
        const local = list(key);
        const serverIds = new Set((data.ids && data.ids[kind]) || []);
        const incoming = new Map((incomingByKind[kind] || []).map(r => [r.id, fromRow(r)]));

        const next = [];
        local.forEach(item => {
          if (!item || item.id == null) return;
          const id = String(item.id);

          if (incoming.has(id)) {
            const remote = incoming.get(id);
            next.push(sig(remote) === sig(item) ? item : remote);
            incoming.delete(id);
          } else if (serverIds.has(id)) {
            next.push(item);                       // não mudou no servidor
          } else if (known[kind].has(id)) {
            // foi apagado por outra pessoa → some aqui também
          } else {
            next.push(item);                       // ficha local ainda não enviada
            dirty.add(key);
          }
        });

        incoming.forEach(item => next.push(item)); // fichas novas de outras pessoas

        if (SORTED.has(kind)) {
          next.sort((a, b) => (Number(b.created) || 0) - (Number(a.created) || 0));
        }

        const nextKnown = new Map();
        next.forEach(item => {
          const id = String(item.id);
          if (serverIds.has(id)) nextKnown.set(id, sig(item));
        });
        known[kind] = nextKnown;

        if (sig(next) !== sig(local)) {
          writeLocal(key, next);
          changed.add(kind);
        }
      }

      since = data.last || since;
      status("Banco online", "connected");

      if (changed.size) refresh(changed);
      else updateCounters();
      if (dirty.size) schedulePush(300);
    } catch (error) {
      status("Sem conexão com o banco", "error");
      console.warn("sync: falha ao ler", error);
    } finally {
      pulling = false;
    }
  }

  /* ---------- atualização da tela ---------- */

  function updateCounters() {
    const set = (id, key) => {
      const el = document.getElementById(id);
      if (el) el.textContent = String(list(key).length);
    };
    set("dashChars", "rpg_characters");
    set("dashNpcs", "rpg_npcs");
    set("dashMarkers", "rpg_markers");
    set("dashCombatants", "rpg_initiative");
    set("dashGroups", "rpg_groups");
  }

  function refresh(changed) {
    const safe = fn => { try { fn(); } catch (e) { console.warn("sync: render", e); } };
    const has = (...k) => k.some(x => changed.has(x));

    updateCounters();

    if (has("characters", "npcs", "markers", "placements")) {
      safe(() => window.renderAll && window.renderAll());
    }
    if (has("npcs")) safe(() => window.NPC_SYSTEM?.render?.());
    if (has("characters", "npcs")) {
      safe(() => window.populateInitiativeCharacters?.());
    }
    if (has("characters", "npcs", "groups")) {
      safe(() => {
        const checked = [...document.querySelectorAll('input[name="rgMember"]:checked')]
          .map(i => i.value);
        window.RPG_GROUPS?.refreshMembers?.();
        document.querySelectorAll('input[name="rgMember"]').forEach(i => {
          if (checked.includes(i.value)) i.checked = true;
        });
      });
    }
    if (has("combatants", "groups")) safe(() => window.renderInitiative?.());

    document.dispatchEvent(new CustomEvent("nexus:synced", { detail: [...changed] }));
  }

  /* ---------- início ---------- */

  window.NEXUS_SYNC = { pull, push, status: () => ({ since, dirty: [...dirty] }) };

  status("Conectando…", "");
  pull();
  pollTimer = setInterval(pull, POLL_MS);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) pull();
  });
})();