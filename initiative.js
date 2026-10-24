
/* ============================================================
   RPG NEXUS — SISTEMA DE COMBATE E INICIATIVA
   Compatível com data.js / app.js / groups.js
   Modos: individual e grupo
   Dados: d6, d10, d20, d50, d100
============================================================ */

(function () {
  "use strict";

  const STORAGE_KEY = "rpg_initiative";
  const CHARACTERS_KEY = "rpg_characters";
  const GROUPS_KEY = "rpg_groups";
  const HISTORY_KEY = "rpg_combat_history";

  const DICE = [6, 10, 20, 50, 100];

  let turnIndex = 0;
  let roundNumber = 1;
  let initialized = false;
  let combatMode = "individual";
  let combatStarted = false;

  /* =========================================================
     UTILITÁRIOS
  ========================================================= */

  function generateId() {
    if (
      typeof crypto !== "undefined" &&
      typeof crypto.randomUUID === "function"
    ) {
      return crypto.randomUUID();
    }

    return Date.now().toString(36) +
      "-" + Math.random().toString(36).slice(2);
  }

  function escapeText(value) {
    if (typeof window.escapeHTML === "function") {
      return window.escapeHTML(String(value ?? ""));
    }

    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function showToast(message) {
    if (typeof window.toast === "function") {
      window.toast(message);
      return;
    }

    const element = document.getElementById("toast");

    if (!element) {
      console.info("[RPG Nexus]", message);
      return;
    }

    element.textContent = message;
    element.classList.add("show");

    clearTimeout(showToast.timer);

    showToast.timer = setTimeout(() => {
      element.classList.remove("show");
    }, 2500);
  }

  function readStore(key, fallback = []) {
    if (typeof window.getStore === "function") {
      try {
        const value = window.getStore(key, fallback);

        if (value && typeof value.then === "function") {
          console.warn(
            `RPG Nexus: getStore("${key}") é assíncrono. ` +
            "Este módulo espera uma função síncrona."
          );
        } else if (value !== undefined && value !== null) {
          return value;
        }
      } catch (error) {
        console.warn("Falha ao ler armazenamento:", key, error);
      }
    }

    try {
      const raw = localStorage.getItem(key);
      return raw === null ? fallback : JSON.parse(raw);
    } catch {
      return fallback;
    }
  }

  function writeStore(key, value) {
    let saved = false;

    if (typeof window.setStore === "function") {
      try {
        const result = window.setStore(key, value);

        if (result && typeof result.then === "function") {
          console.warn(
            `RPG Nexus: setStore("${key}") é assíncrono.`
          );
        } else {
          saved = true;
        }
      } catch (error) {
        console.warn("Falha ao salvar no armazenamento principal:", error);
      }
    }

    try {
      localStorage.setItem(key, JSON.stringify(value));
      saved = true;
    } catch (error) {
      console.error("Falha ao salvar no localStorage:", error);
    }

    if (!saved) {
      showToast("Não foi possível salvar os dados do combate.");
    }

    return saved;
  }

  function getCombatants() {
    const value = readStore(STORAGE_KEY, []);
    return Array.isArray(value) ? value : [];
  }

  function saveCombatants(combatants) {
    writeStore(STORAGE_KEY, combatants);
  }

  function getCharacters() {
    const value = readStore(CHARACTERS_KEY, []);
    return Array.isArray(value) ? value : [];
  }

  function getGroups() {
    const value = readStore(GROUPS_KEY, []);
    return Array.isArray(value) ? value : [];
  }

  function getHistory() {
    const value = readStore(HISTORY_KEY, []);
    return Array.isArray(value) ? value : [];
  }

  function addHistory(entry) {
    const history = getHistory();

    history.unshift({
      id: generateId(),
      time: new Date().toISOString(),
      round: roundNumber,
      ...entry
    });

    writeStore(HISTORY_KEY, history.slice(0, 100));
    renderCombatHistory();
  }

  function normalizeNumber(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  function rollDie(sides) {
    if (!DICE.includes(Number(sides))) {
      throw new Error("Dado inválido.");
    }

    return Math.floor(Math.random() * Number(sides)) + 1;
  }

  function rollWithBonus(sides, bonus = 0) {
    const roll = rollDie(Number(sides));
    const modifier = normalizeNumber(bonus);
    return {
      die: Number(sides),
      roll,
      bonus: modifier,
      total: roll + modifier
    };
  }

  /* =========================================================
     COMBATENTES E GRUPOS
  ========================================================= */

  function sortCombatants(list) {
    return [...list].sort((a, b) => {
      const difference =
        normalizeNumber(b.init) - normalizeNumber(a.init);

      if (difference !== 0) return difference;

      return normalizeNumber(a.created) -
        normalizeNumber(b.created);
    });
  }

  function getCharacterById(id) {
    return getCharacters().find(
      character => String(character.id) === String(id)
    ) || null;
  }

  function getGroupById(id) {
    return getGroups().find(
      group => String(group.id) === String(id)
    ) || null;
  }

  function populateCharacterSelect() {
    const select = document.getElementById("combatChar");
    if (!select) return;

    const previous = select.value;
    select.replaceChildren();

    const empty = document.createElement("option");
    empty.value = "";
    empty.textContent = "Sem personagem vinculado";
    select.appendChild(empty);

    getCharacters().forEach(character => {
      if (!character || character.id == null) return;

      const option = document.createElement("option");
      option.value = String(character.id);
      option.textContent = character.name || "Personagem sem nome";
      select.appendChild(option);
    });

    if ([...select.options].some(option => option.value === previous)) {
      select.value = previous;
    }
  }

  function addCombatant() {
    const nameInput = document.getElementById("combatName");
    const charSelect = document.getElementById("combatChar");
    const initInput = document.getElementById("combatInit");

    if (!nameInput || !initInput) {
      showToast("Os campos de combatente não foram encontrados no HTML.");
      return;
    }

    const name = nameInput.value.trim();

    if (!name) {
      showToast("Digite o nome do combatente.");
      nameInput.focus();
      return;
    }

    const characterId = charSelect?.value || null;
    const character = characterId
      ? getCharacterById(characterId)
      : null;

    const initValue = initInput.value.trim();
    const init = initValue === ""
      ? 0
      : normalizeNumber(initValue);

    const hp = normalizeNumber(
      character?.hp ?? character?.health,
      100
    );

    const combatant = {
      id: generateId(),
      name,
      characterId,
      characterName: character?.name || null,
      groupId: null,
      groupName: null,
      groupMemberKey: null,
      image: character?.image || character?.avatar || "",
      init,
      initDie: null,
      attack: normalizeNumber(character?.attack, 0),
      defense: normalizeNumber(character?.defense, 0),
      hp,
      maxHp: normalizeNumber(
        character?.maxHp ?? character?.hp ?? character?.health,
        hp
      ),
      energy: normalizeNumber(character?.energy, 100),
      status: "Ativo",
      created: Date.now()
    };

    const combatants = getCombatants();
    combatants.push(combatant);
    saveCombatants(combatants);

    nameInput.value = "";
    turnIndex = 0;

    addHistory({
      type: "entrada",
      message: `${name} entrou no combate.`
    });

    renderInitiative();
    showToast(`${name} entrou na iniciativa.`);
  }

  function addGroupToInitiative(groupId) {
    const group = getGroupById(groupId);

    if (!group) {
      showToast("Grupo não encontrado. Verifique o cadastro de grupos.");
      return;
    }

    const members = Array.isArray(group.memberIds)
      ? group.memberIds
      : [];

    if (!members.length) {
      showToast("Este grupo não possui integrantes cadastrados.");
      return;
    }

    const combatants = getCombatants();
    let added = 0;

    members.forEach(memberKey => {
      const parts = String(memberKey).split(":");
      const type = parts.shift();
      const id = parts.join(":");

      let member = null;

      if (type === "character") {
        member = getCharacters().find(
          item => String(item.id) === id
        );
      } else if (type === "npc") {
        member = getGroups.length >= 0
          ? (Array.isArray(readStore("rpg_npcs", []))
              ? readStore("rpg_npcs", []).find(
                  item => String(item.id) === id
                )
              : null)
          : null;
      }

      if (!member) return;

      const uniqueKey = `${type}:${id}`;

      const alreadyAdded = combatants.some(item =>
        String(item.groupId) === String(group.id) &&
        item.groupMemberKey === uniqueKey
      );

      if (alreadyAdded) return;

      const hp = normalizeNumber(
        member.hp ?? member.health,
        100
      );

      combatants.push({
        id: generateId(),
        name: member.name || "Integrante sem nome",
        characterId: type === "character" ? member.id : null,
        characterName: member.name || null,
        groupId: group.id,
        groupName: group.name || "Grupo",
        groupMemberKey: uniqueKey,
        image: member.image || member.avatar || group.image || "",
        universe: member.universe || group.universe || "",
        init: 0,
        initDie: null,
        attack: normalizeNumber(member.attack, normalizeNumber(group.attack)),
        defense: normalizeNumber(member.defense, normalizeNumber(group.defense)),
        hp,
        maxHp: normalizeNumber(member.maxHp ?? member.hp ?? member.health, hp),
        energy: normalizeNumber(member.energy, 100),
        status: member.status || "Ativo",
        created: Date.now() + added
      });

      added++;
    });

    if (!added) {
      showToast("Nenhum integrante novo foi adicionado.");
      return;
    }

    saveCombatants(combatants);

    addHistory({
      type: "grupo",
      message: `${group.name || "Grupo"} entrou com ${added} integrante(s).`
    });

    renderInitiative();
    showToast(`${added} integrante(s) de ${group.name} adicionado(s).`);
  }

  function removeCombatant(id) {
    const combatants = getCombatants();
    const removed = combatants.find(
      item => String(item.id) === String(id)
    );

    if (!removed) return;

    saveCombatants(
      combatants.filter(
        item => String(item.id) !== String(id)
      )
    );

    turnIndex = 0;

    addHistory({
      type: "remoção",
      message: `${removed.name} saiu do combate.`
    });

    renderInitiative();
  }

  /* =========================================================
     ROLAGENS DE INICIATIVA, ATAQUE E DEFESA
  ========================================================= */

  function rollInitiativeFor(id, sides) {
    const combatants = getCombatants();
    const combatant = combatants.find(
      item => String(item.id) === String(id)
    );

    if (!combatant) return;

    const result = rollWithBonus(
      sides,
      normalizeNumber(combatant.initiativeBonus, 0)
    );

    combatant.init = result.total;
    combatant.initDie = result.die;
    combatant.initRoll = result.roll;

    saveCombatants(combatants);

    addHistory({
      type: "iniciativa",
      message:
        `${combatant.name} rolou d${result.die}: ` +
        `${result.roll} + ${result.bonus} = ${result.total}.`
    });

    renderInitiative();
    showToast(`Iniciativa de ${combatant.name}: ${result.total}`);
  }

  function getSelectedDie(id) {
    const select = document.querySelector(
      `[data-die-for="${CSS.escape(String(id))}"]`
    );

    return DICE.includes(Number(select?.value))
      ? Number(select.value)
      : 20;
  }

  function rollAttack(id) {
    const combatant = getCombatants().find(
      item => String(item.id) === String(id)
    );

    if (!combatant) return;

    const sides = getSelectedDie(id);
    const result = rollWithBonus(sides, combatant.attack);

    addHistory({
      type: "ataque",
      combatantId: combatant.id,
      message:
        `${combatant.name} atacou: d${result.die} ` +
        `(${result.roll}) + ataque (${result.bonus}) = ${result.total}.`,
      result
    });

    showToast(`Ataque de ${combatant.name}: ${result.total}`);
    renderCombatHistory();
  }

  function rollDefense(id) {
    const combatant = getCombatants().find(
      item => String(item.id) === String(id)
    );

    if (!combatant) return;

    const sides = getSelectedDie(id);
    const result = rollWithBonus(sides, combatant.defense);

    addHistory({
      type: "defesa",
      combatantId: combatant.id,
      message:
        `${combatant.name} defendeu: d${result.die} ` +
        `(${result.roll}) + defesa (${result.bonus}) = ${result.total}.`,
      result
    });

    showToast(`Defesa de ${combatant.name}: ${result.total}`);
    renderCombatHistory();
  }

  function resolveAttack(attackerId, defenderId, sides) {
    const combatants = getCombatants();

    const attacker = combatants.find(
      item => String(item.id) === String(attackerId)
    );

    const defender = combatants.find(
      item => String(item.id) === String(defenderId)
    );

    if (!attacker || !defender) {
      showToast("Selecione o atacante e o defensor.");
      return;
    }

    if (String(attacker.id) === String(defender.id)) {
      showToast("Um combatente não pode atacar a si mesmo.");
      return;
    }

    const die = DICE.includes(Number(sides))
      ? Number(sides)
      : 20;

    const attack = rollWithBonus(die, attacker.attack);
    const defense = rollWithBonus(die, defender.defense);
    const success = attack.total > defense.total;
    const tie = attack.total === defense.total;

    let message;

    if (success) {
      message =
        `${attacker.name} acertou ${defender.name}: ` +
        `ataque ${attack.total} contra defesa ${defense.total}.`;
    } else if (tie) {
      message =
        `${attacker.name} empatou com a defesa de ${defender.name}: ` +
        `${attack.total} contra ${defense.total}.`;
    } else {
      message =
        `${defender.name} bloqueou o ataque: ` +
        `${attack.total} contra ${defense.total}.`;
    }

    addHistory({
      type: "resolução",
      attackerId: attacker.id,
      defenderId: defender.id,
      attack,
      defense,
      success,
      tie,
      message
    });

    renderCombatHistory();
    showToast(success ? "Ataque acertou!" : "Ataque bloqueado.");
  }

  /* =========================================================
     VIDA E ESTADO
  ========================================================= */

  function changeHP(id, amount) {
    const combatants = getCombatants();
    const combatant = combatants.find(
      item => String(item.id) === String(id)
    );

    if (!combatant) return;

    const maxHp = normalizeNumber(combatant.maxHp, 100);
    const currentHp = normalizeNumber(combatant.hp, maxHp);

    combatant.hp = Math.max(
      0,
      Math.min(maxHp, currentHp + amount)
    );

    if (combatant.hp <= 0) {
      combatant.status = "Incapacitado";
    } else if (combatant.status === "Incapacitado") {
      combatant.status = "Ativo";
    }

    saveCombatants(combatants);

    addHistory({
      type: "vida",
      message: `${combatant.name}: vida ${combatant.hp}/${maxHp}.`
    });

    renderInitiative();
  }

  function setStatus(id, status) {
    const allowed = [
      "Ativo",
      "Ferido",
      "Atordoado",
      "Incapacitado",
      "Fora de combate"
    ];

    if (!allowed.includes(status)) return;

    const combatants = getCombatants();
    const combatant = combatants.find(
      item => String(item.id) === String(id)
    );

    if (!combatant) return;

    combatant.status = status;
    saveCombatants(combatants);

    addHistory({
      type: "estado",
      message: `${combatant.name}: estado alterado para ${status}.`
    });

    renderInitiative();
  }

  /* =========================================================
     MODO DE COMBATE E TURNOS
  ========================================================= */

  function setCombatMode(mode) {
    if (!["individual", "grupo"].includes(mode)) return;

    combatMode = mode;

    document.querySelectorAll("[data-combat-mode]").forEach(button => {
      button.classList.toggle(
        "active",
        button.dataset.combatMode === mode
      );
    });

    const groupPanel = document.getElementById("combatGroupPanel");

    if (groupPanel) {
      groupPanel.hidden = mode !== "grupo";
    }

    renderInitiative();
  }

  function rollAllInitiatives(sides) {
    const combatants = getCombatants();

    if (!combatants.length) {
      showToast("Adicione combatentes antes de rolar a iniciativa.");
      return;
    }

    combatants.forEach(combatant => {
      const result = rollWithBonus(
        sides,
        normalizeNumber(combatant.initiativeBonus, 0)
      );

      combatant.init = result.total;
      combatant.initDie = result.die;
      combatant.initRoll = result.roll;
    });

    saveCombatants(combatants);
    turnIndex = 0;
    combatStarted = true;

    addHistory({
      type: "iniciativa geral",
      message: `Todos rolaram iniciativa com d${sides}.`
    });

    renderInitiative();
    showToast("Iniciativas roladas!");
  }

  function nextTurn() {
    const combatants = sortCombatants(getCombatants());

    if (!combatants.length) {
      showToast("Não existem combatentes na iniciativa.");
      return;
    }

    turnIndex++;

    if (turnIndex >= combatants.length) {
      turnIndex = 0;
      roundNumber++;
    }

    renderInitiative();
  }

  function resetInitiative() {
    if (
      !window.confirm(
        "Deseja remover todos os combatentes e reiniciar o combate?"
      )
    ) {
      return;
    }

    turnIndex = 0;
    roundNumber = 1;
    combatStarted = false;

    saveCombatants([]);
    writeStore(HISTORY_KEY, []);

    renderInitiative();
    renderCombatHistory();

    showToast("Combate reiniciado.");
  }

  /* =========================================================
     RENDERIZAÇÃO
  ========================================================= */

  function renderInitiative() {
    const container = document.getElementById("initiativeList");
    const combatTotal = document.getElementById("combatTotal");
    const dashboardTotal = document.getElementById("dashCombatants");

    const combatants = sortCombatants(getCombatants());

    if (turnIndex >= combatants.length) turnIndex = 0;

    if (combatTotal) combatTotal.textContent = combatants.length;
    if (dashboardTotal) dashboardTotal.textContent = combatants.length;

    if (!container) {
      updateTurnDisplay(combatants);
      return;
    }

    container.innerHTML = "";

    if (!combatants.length) {
      container.innerHTML = `
        <div class="muted" style="padding:20px;text-align:center">
          Nenhum combatente na iniciativa.
        </div>`;
      updateTurnDisplay(combatants);
      renderCombatHistory();
      return;
    }

    combatants.forEach((combatant, index) => {
      const item = document.createElement("article");
      item.className = "initiative-item";

      if (index === turnIndex) item.classList.add("active-turn");

      const hp = normalizeNumber(combatant.hp, 100);
      const maxHp = Math.max(1, normalizeNumber(combatant.maxHp, 100));
      const hpPercent = Math.max(0, Math.min(100, hp / maxHp * 100));

      const image = combatant.image
        ? `<img src="${escapeText(combatant.image)}"
                alt=""
                class="combatant-avatar"
                onerror="this.style.display='none'">`
        : `<div class="combatant-avatar placeholder">⚔️</div>`;

      item.innerHTML = `
        <div class="initiative-info">
          <div class="combatant-heading">
            ${image}
            <div>
              <strong>${escapeText(combatant.name || "Combatente")}</strong>
              <small>
                ${escapeText(combatant.groupName || combatant.characterName || "Individual")}
              </small>
              <small>
                Iniciativa: ${normalizeNumber(combatant.init)}
                ${combatant.initDie ? `(d${combatant.initDie})` : ""}
              </small>
            </div>
          </div>

          <div class="combat-stat-line">
            <span>❤️ ${hp}/${maxHp}</span>
            <span>⚔️ ${normalizeNumber(combatant.attack)}</span>
            <span>🛡️ ${normalizeNumber(combatant.defense)}</span>
            <span>⚡ ${normalizeNumber(combatant.energy, 100)}</span>
          </div>

          <div class="combat-hp-track">
            <div class="combat-hp-fill" style="width:${hpPercent}%"></div>
          </div>

          <small>Estado: ${escapeText(combatant.status || "Ativo")}</small>

          <div class="combat-roll-controls">
            <label>
              Dado
              <select data-die-for="${escapeText(combatant.id)}">
                ${DICE.map(die =>
                  `<option value="${die}" ${die === 20 ? "selected" : ""}>d${die}</option>`
                ).join("")}
              </select>
            </label>

            <button type="button" data-roll-init="${escapeText(combatant.id)}">
              Iniciativa
            </button>
            <button type="button" data-roll-attack="${escapeText(combatant.id)}">
              Atacar
            </button>
            <button type="button" data-roll-defense="${escapeText(combatant.id)}">
              Defender
            </button>
          </div>

          <div class="combat-roll-controls">
            <button type="button" data-hp="${escapeText(combatant.id)}" data-amount="-10">
              −10 PV
            </button>
            <button type="button" data-hp="${escapeText(combatant.id)}" data-amount="10">
              +10 PV
            </button>
            <label>
              Estado
              <select data-status-for="${escapeText(combatant.id)}">
                ${[
                  "Ativo",
                  "Ferido",
                  "Atordoado",
                  "Incapacitado",
                  "Fora de combate"
                ].map(status =>
                  `<option ${status === (combatant.status || "Ativo") ? "selected" : ""}>${status}</option>`
                ).join("")}
              </select>
            </label>
          </div>
        </div>

        <div class="initiative-actions">
          <span class="initiative-badge">${normalizeNumber(combatant.init)}</span>
          <button type="button" class="danger-link"
                  data-remove="${escapeText(combatant.id)}">Remover</button>
        </div>
      `;

      container.appendChild(item);
    });

    updateTurnDisplay(combatants);
    renderCombatHistory();
    renderGroupSelect();
  }

  function updateTurnDisplay(combatants) {
    const current = document.getElementById("currentCombatant");
    const turn = document.getElementById("turnNumber");
    const round = document.getElementById("roundNumber");

    if (round) round.textContent = String(roundNumber);

    if (!combatants.length) {
      if (current) current.textContent = "Nenhum combatente";
      if (turn) turn.textContent = "1";
      return;
    }

    if (turnIndex >= combatants.length) turnIndex = 0;

    const active = combatants[turnIndex];

    if (current) current.textContent = active?.name || "Combatente";
    if (turn) turn.textContent = String(turnIndex + 1);
  }

  function renderGroupSelect() {
    const select = document.getElementById("combatGroupSelect");
    if (!select) return;

    const previous = select.value;
    select.replaceChildren();

    getGroups().forEach(group => {
      if (!group || group.id == null) return;

      const option = document.createElement("option");
      option.value = String(group.id);
      option.textContent = group.name || "Grupo sem nome";
      select.appendChild(option);
    });

    if ([...select.options].some(option => option.value === previous)) {
      select.value = previous;
    }
  }

  function renderCombatHistory() {
    const container = document.getElementById("combatHistory");
    if (!container) return;

    const history = getHistory();

    if (!history.length) {
      container.innerHTML =
        `<p class="muted">Nenhuma rolagem registrada.</p>`;
      return;
    }

    container.innerHTML = history.slice(0, 30).map(entry => `
      <div class="combat-history-item">
        <small>Rodada ${normalizeNumber(entry.round, 1)} ·
          ${escapeText(entry.type || "combate")}</small>
        <div>${escapeText(entry.message || "")}</div>
      </div>
    `).join("");
  }

  /* =========================================================
     EVENTOS
  ========================================================= */

  function setupEvents() {
    if (initialized) return;
    initialized = true;

    document.getElementById("addCombat")
      ?.addEventListener("click", addCombatant);

    document.getElementById("nextTurn")
      ?.addEventListener("click", nextTurn);

    document.getElementById("resetInit")
      ?.addEventListener("click", resetInitiative);

    document.getElementById("rollAllInitiative")
      ?.addEventListener("click", () => {
        const die = Number(
          document.getElementById("allInitiativeDie")?.value || 20
        );
        rollAllInitiatives(die);
      });

    document.getElementById("addGroupToCombat")
      ?.addEventListener("click", () => {
        const id = document.getElementById("combatGroupSelect")?.value;
        if (id) addGroupToInitiative(id);
      });

    document.querySelectorAll("[data-combat-mode]")
      .forEach(button => {
        button.addEventListener("click", () => {
          setCombatMode(button.dataset.combatMode);
        });
      });

    document.getElementById("initiativeList")
      ?.addEventListener("click", event => {
        const target = event.target.closest("button");
        if (!target) return;

        if (target.dataset.remove) {
          removeCombatant(target.dataset.remove);
        } else if (target.dataset.rollInit) {
          rollInitiativeFor(
            target.dataset.rollInit,
            getSelectedDie(target.dataset.rollInit)
          );
        } else if (target.dataset.rollAttack) {
          rollAttack(target.dataset.rollAttack);
        } else if (target.dataset.rollDefense) {
          rollDefense(target.dataset.rollDefense);
        } else if (target.dataset.hp) {
          changeHP(
            target.dataset.hp,
            normalizeNumber(target.dataset.amount)
          );
        }
      });

    document.getElementById("initiativeList")
      ?.addEventListener("change", event => {
        const select = event.target;

        if (select.matches("[data-status-for]")) {
          setStatus(select.dataset.statusFor, select.value);
        }
      });

    document.getElementById("resolveAttack")
      ?.addEventListener("click", () => {
        const attacker = document.getElementById("attackActor")?.value;
        const defender = document.getElementById("defenseTarget")?.value;
        const die = Number(document.getElementById("attackDie")?.value || 20);

        resolveAttack(attacker, defender, die);
      });

    populateCharacterSelect();
    renderInitiative();
    renderGroupSelect();
    renderCombatHistory();
  }

  function init() {
    setupEvents();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }

  /* =========================================================
     API GLOBAL
  ========================================================= */

  window.renderInitiative = renderInitiative;
  window.populateInitiativeCharacters = populateCharacterSelect;
  window.addCombatant = addCombatant;
  window.addGroupToInitiative = addGroupToInitiative;
  window.nextInitiativeTurn = nextTurn;
  window.resetInitiative = resetInitiative;
  window.removeInitiativeCombatant = removeCombatant;
  window.rollInitiativeFor = rollInitiativeFor;
  window.rollInitiativeForAll = rollAllInitiatives;
  window.rollCombatAttack = rollAttack;
  window.rollCombatDefense = rollDefense;
  window.resolveCombatAttack = resolveAttack;
  window.changeCombatantHP = changeHP;
  window.setCombatantStatus = setStatus;
  window.setRPGCombatMode = setCombatMode;
  window.renderCombatHistory = renderCombatHistory;

})();