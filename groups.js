
/* ============================================================
   RPG NEXUS — GROUPS SYSTEM
   Grupos, membros, status, atributos e iniciativa
============================================================ */

(function () {
  "use strict";

  const KEYS = {
    groups: "rpg_groups",
    characters: "rpg_characters",
    npcs: "rpg_npcs",
    initiative: "rpg_initiative"
  };

  const state = {
    editingId: null,
    initialized: false
  };

  const $ = (selector, root = document) =>
    root.querySelector(selector);

  const $$ = (selector, root = document) =>
    Array.from(root.querySelectorAll(selector));

  /* ============================================================
     UTILITÁRIOS
  ============================================================ */

  function generateId() {
    if (typeof crypto !== "undefined" &&
        typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }

    return Date.now().toString(36) + "-" +
      Math.random().toString(36).slice(2);
  }

  function escapeHTML(value) {
    if (typeof window.escapeHTML === "function") {
      return window.escapeHTML(String(value ?? ""));
    }

    return String(value ?? "").replace(/[&<>"']/g, char => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;"
    })[char]);
  }

  function numberValue(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  function nonNegative(value, fallback = 0) {
    return Math.max(0, numberValue(value, fallback));
  }

  function notify(message) {
    if (typeof window.toast === "function") {
      window.toast(message);
      return;
    }

    const toast = $("#toast");

    if (!toast) {
      console.info("[RPG Nexus]", message);
      return;
    }

    toast.textContent = message;
    toast.classList.add("show");

    clearTimeout(notify.timer);

    notify.timer = setTimeout(() => {
      toast.classList.remove("show");
    }, 2800);
  }

  function recordActivity(message) {
    if (typeof window.saveActivity === "function") {
      try {
        window.saveActivity(message);
      } catch (error) {
        console.warn("Não foi possível registrar atividade.", error);
      }
    }
  }

  function readStore(key, fallback = []) {
    try {
      if (typeof window.getStore === "function") {
        const result = window.getStore(key, fallback);

        // Este módulo usa armazenamento síncrono.
        if (Array.isArray(result)) return result;
      }
    } catch (error) {
      console.warn("Falha ao ler armazenamento principal:", key, error);
    }

    try {
      const raw = localStorage.getItem(key);
      if (!raw) return fallback;

      const result = JSON.parse(raw);
      return Array.isArray(result) ? result : fallback;
    } catch (error) {
      console.warn("Falha ao ler localStorage:", key, error);
      return fallback;
    }
  }

  function writeStore(key, value) {
    let appStoreSucceeded = false;

    try {
      if (typeof window.setStore === "function") {
        const result = window.setStore(key, value);

        if (result && typeof result.then === "function") {
          console.warn(
            "setStore é assíncrono; este módulo pressupõe armazenamento síncrono."
          );
        } else {
          appStoreSucceeded = true;
        }
      }
    } catch (error) {
      console.error("Falha ao salvar no armazenamento principal:", error);
    }

    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (error) {
      console.error("Falha ao salvar no localStorage:", error);
      notify("Não foi possível salvar os dados neste navegador.");
      return appStoreSucceeded;
    }
  }

  function safeImageURL(value) {
    const url = String(value || "").trim();
    if (!url) return "";

    try {
      const parsed = new URL(url, document.baseURI);

      if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
        return "";
      }

      return parsed.href;
    } catch {
      return "";
    }
  }

  function getImage(item) {
    return safeImageURL(
      item?.imageUrl ||
      item?.image ||
      item?.portrait ||
      item?.avatar ||
      item?.photo ||
      item?.img ||
      ""
    );
  }

  function getHP(item) {
    return nonNegative(
      item?.hp ?? item?.health ?? item?.maxHp ?? 100,
      100
    );
  }

  function getEnergy(item) {
    return nonNegative(item?.energy ?? item?.mana ?? 100, 100);
  }

  function getAttack(item) {
    return nonNegative(
      item?.attack ??
      item?.stats?.attack ??
      item?.attributes?.attack ??
      0
    );
  }

  function getDefense(item) {
    return nonNegative(
      item?.defense ??
      item?.stats?.defense ??
      item?.attributes?.defense ??
      0
    );
  }

  /* ============================================================
     PERSONAGENS E NPCS
  ============================================================ */

  function getAvailableMembers() {
    const characters = readStore(KEYS.characters, [])
      .filter(Boolean)
      .map(item => ({
        ...item,
        _source: "character"
      }));

    const npcs = readStore(KEYS.npcs, [])
      .filter(Boolean)
      .map(item => ({
        ...item,
        _source: "npc"
      }));

    const result = [];
    const seen = new Set();

    [...characters, ...npcs].forEach(item => {
      if (item.id == null) return;

      const key = `${item._source}:${item.id}`;

      if (seen.has(key)) return;

      seen.add(key);
      result.push(item);
    });

    return result;
  }

  function memberKey(member) {
    return `${member._source}:${member.id}`;
  }

  function resolveMemberKey(key) {
    const [source, ...parts] = String(key || "").split(":");
    const id = parts.join(":");

    return getAvailableMembers().find(member =>
      member._source === source &&
      String(member.id) === String(id)
    ) || null;
  }

  function getGroupMembers(group) {
    return (group.memberIds || [])
      .map(resolveMemberKey)
      .filter(Boolean);
  }

  /* ============================================================
     ESTILOS
  ============================================================ */

  function injectStyles() {
    if ($("#rpgGroupsStyles")) return;

    const style = document.createElement("style");
    style.id = "rpgGroupsStyles";

    style.textContent = `
      #rpgGroupsPanel {
        color: var(--text, #f5f3ff);
      }

      .rg-panel {
        padding: 18px;
        margin-bottom: 18px;
        border: 1px solid rgba(139,92,246,.3);
        border-radius: 16px;
        background: var(--card, #171522);
        min-width: 0;
      }

      .rg-panel h2,
      .rg-panel h3 {
        margin-top: 0;
      }

      .rg-muted {
        color: var(--muted, #aaa2bd);
        font-size: .9rem;
      }

      .rg-form-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 14px;
      }

      .rg-field {
        display: flex;
        flex-direction: column;
        gap: 6px;
        min-width: 0;
        font-size: .92rem;
      }

      .rg-field.full {
        grid-column: 1 / -1;
      }

      .rg-field input,
      .rg-field textarea,
      .rg-field select {
        width: 100%;
        min-width: 0;
        padding: 11px;
        border: 1px solid var(--border, #51476b);
        border-radius: 9px;
        color: inherit;
        background: var(--input-bg, #100e18);
        font: inherit;
      }

      .rg-field textarea {
        resize: vertical;
      }

      .rg-members-picker {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));
        gap: 8px;
        max-height: 300px;
        overflow: auto;
        padding: 10px;
        border: 1px solid var(--border, #51476b);
        border-radius: 10px;
      }

      .rg-member-check {
        display: flex;
        align-items: center;
        flex-direction: row;
        gap: 9px;
        padding: 8px;
        border-radius: 8px;
        background: rgba(139,92,246,.06);
        overflow-wrap: anywhere;
      }

      .rg-member-check input {
        width: auto;
        flex-shrink: 0;
      }

      .rg-actions {
        display: flex;
        align-items: center;
        flex-wrap: wrap;
        gap: 8px;
        margin-top: 14px;
      }

      .rg-btn {
        padding: 10px 13px;
        border: 1px solid #7c3aed;
        border-radius: 9px;
        background: #6d35a8;
        color: white;
        cursor: pointer;
        font: inherit;
      }

      .rg-btn.secondary {
        background: #30283f;
        border-color: #51476b;
      }

      .rg-btn.danger {
        background: #842d48;
        border-color: #b94766;
      }

      .rg-btn:focus-visible,
      .rg-panel input:focus-visible,
      .rg-panel select:focus-visible,
      .rg-panel textarea:focus-visible {
        outline: 2px solid #c4b5fd;
        outline-offset: 2px;
      }

      .rg-groups-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(270px, 1fr));
        gap: 14px;
      }

      .rg-group-card {
        min-width: 0;
        padding: 15px;
        border: 1px solid var(--border, #51476b);
        border-radius: 14px;
        background: var(--card, #171522);
      }

      .rg-group-head {
        display: flex;
        align-items: center;
        gap: 12px;
        margin-bottom: 13px;
      }

      .rg-group-image {
        display: grid;
        place-items: center;
        width: 68px;
        height: 68px;
        flex: 0 0 68px;
        overflow: hidden;
        border-radius: 12px;
        background: #30283f;
        font-size: 1.8rem;
      }

      img.rg-group-image {
        object-fit: cover;
      }

      .rg-group-title {
        min-width: 0;
        overflow-wrap: anywhere;
      }

      .rg-group-title h3 {
        margin: 0 0 7px;
      }

      .rg-status {
        display: inline-block;
        padding: 4px 8px;
        border-radius: 99px;
        background: rgba(139,92,246,.17);
        font-size: .78rem;
      }

      .rg-stat-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 8px;
        margin: 12px 0;
      }

      .rg-stat {
        padding: 10px;
        border-radius: 9px;
        background: rgba(139,92,246,.08);
        overflow-wrap: anywhere;
      }

      .rg-stat small {
        display: block;
        opacity: .75;
        margin-bottom: 4px;
      }

      .rg-roster {
        margin-top: 12px;
        border-top: 1px solid var(--border, #51476b);
        padding-top: 10px;
      }

      .rg-roster summary {
        cursor: pointer;
        font-weight: 600;
      }

      .rg-roster-list {
        display: grid;
        gap: 9px;
        margin-top: 10px;
      }

      .rg-roster-member {
        display: flex;
        align-items: center;
        gap: 9px;
        min-width: 0;
      }

      .rg-roster-member img,
      .rg-avatar-placeholder {
        width: 38px;
        height: 38px;
        flex: 0 0 38px;
        border-radius: 8px;
        object-fit: cover;
        background: #30283f;
      }

      .rg-avatar-placeholder {
        display: grid;
        place-items: center;
      }

      .rg-roster-info {
        min-width: 0;
        flex: 1;
        overflow-wrap: anywhere;
        font-size: .88rem;
      }

      .rg-roster-info small {
        display: block;
        opacity: .75;
      }

      .rg-empty {
        padding: 24px 12px;
        text-align: center;
        border: 1px dashed var(--border, #51476b);
        border-radius: 12px;
        opacity: .8;
      }

      @media (max-width: 600px) {
        .rg-form-grid {
          grid-template-columns: 1fr;
        }

        .rg-field.full {
          grid-column: auto;
        }

        .rg-groups-grid {
          grid-template-columns: 1fr;
        }
      }
    `;

    document.head.appendChild(style);
  }

  /* ============================================================
     INTERFACE
  ============================================================ */

  function createPanel() {
    let panel = $("#rpgGroupsPanel");

    if (panel) return panel;

    panel = document.createElement("div");
    panel.id = "rpgGroupsPanel";

    panel.innerHTML = `
      <section class="rg-panel">
        <div class="panel-title">
          <h2 id="rgFormHeading">Criar grupo</h2>
          <span id="rgFormMode">Novo registro</span>
        </div>

        <p class="rg-muted">
          Monte uma equipe com personagens e NPCs cadastrados.
          Os integrantes mantêm suas fichas originais.
        </p>

        <form id="rgGroupForm">
          <div class="rg-form-grid">
            <label class="rg-field">
              Nome do grupo *
              <input id="rgName" maxlength="80" required
                placeholder="Ex.: Equipe Sete">
            </label>

            <label class="rg-field">
              Universo
              <input id="rgUniverse" maxlength="80"
                placeholder="Ex.: Naruto">
            </label>

            <label class="rg-field">
              Status
              <select id="rgStatus">
                <option value="Ativo">Ativo</option>
                <option value="Aguardando">Aguardando</option>
                <option value="Em combate">Em combate</option>
                <option value="Derrotado">Derrotado</option>
                <option value="Retirado">Retirado</option>
                <option value="Inativo">Inativo</option>
              </select>
            </label>

            <label class="rg-field">
              Imagem do grupo (URL)
              <input id="rgImage" type="url"
                placeholder="https://exemplo.com/grupo.jpg">
            </label>

            <label class="rg-field">
              Ataque base
              <input id="rgAttack" type="number" min="0" step="1" value="10">
            </label>

            <label class="rg-field">
              Defesa base
              <input id="rgDefense" type="number" min="0" step="1" value="5">
            </label>

            <label class="rg-field full">
              Descrição
              <textarea id="rgDescription" rows="3" maxlength="2000"
                placeholder="Objetivo, história, alianças e informações da equipe"></textarea>
            </label>

            <div class="rg-field full">
              <h3 style="margin:0">Membros</h3>
              <p class="rg-muted">
                Marque os personagens e NPCs que pertencem ao grupo.
              </p>
              <div id="rgMemberPicker" class="rg-members-picker"></div>
            </div>
          </div>

          <div class="rg-actions">
            <button id="rgSave" class="rg-btn" type="submit">
              ＋ Criar grupo
            </button>

            <button id="rgCancel" class="rg-btn secondary"
              type="button" hidden>
              Cancelar edição
            </button>
          </div>
        </form>
      </section>

      <section class="rg-panel">
        <div class="panel-title">
          <h2>Grupos registrados</h2>
          <span id="rgCount">0 grupos</span>
        </div>

        <div id="rgGroupsList" class="rg-groups-grid"></div>
      </section>
    `;

    const mount = $("#rpgGroupsMount");

    if (mount) {
      mount.appendChild(panel);
    } else {
      const page = $("#groups");
      const main = $("main");

      if (page) {
        page.appendChild(panel);
      } else if (main) {
        main.appendChild(panel);
      } else {
        document.body.appendChild(panel);
      }
    }

    return panel;
  }

  function populateMemberPicker(selectedKeys = []) {
    const container = $("#rgMemberPicker");
    if (!container) return;

    const members = getAvailableMembers();
    container.innerHTML = "";

    if (!members.length) {
      const empty = document.createElement("p");
      empty.className = "rg-muted";
      empty.textContent =
        "Nenhum personagem ou NPC foi encontrado. Cadastre fichas primeiro.";
      container.appendChild(empty);
      return;
    }

    members.forEach(member => {
      const key = memberKey(member);
      const label = document.createElement("label");
      label.className = "rg-member-check";

      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.name = "rgMember";
      checkbox.value = key;
      checkbox.checked = selectedKeys.includes(key);

      const text = document.createElement("span");
      const type = member._source === "npc" ? "NPC" : "Personagem";

      text.textContent = `${member.name || "Sem nome"} · ${type}`;

      label.append(checkbox, text);
      container.appendChild(label);
    });
  }

  function selectedMemberKeys() {
    return $$('input[name="rgMember"]:checked').map(input => input.value);
  }

  /* ============================================================
     RENDERIZAÇÃO DOS GRUPOS
  ============================================================ */

  function renderGroups() {
    const container = $("#rgGroupsList");
    const count = $("#rgCount");
    const dashboardCount = $("#dashGroups");

    const groups = readStore(KEYS.groups, []);

    if (count) {
      count.textContent =
        `${groups.length} ${groups.length === 1 ? "grupo" : "grupos"}`;
    }

    if (dashboardCount) {
      dashboardCount.textContent = String(groups.length);
    }

    if (!container) return;

    container.innerHTML = "";

    if (!groups.length) {
      const empty = document.createElement("div");
      empty.className = "rg-empty";
      empty.innerHTML = `
        <h3>Nenhum grupo criado</h3>
        <p>Crie seu primeiro grupo para organizar as equipes da campanha.</p>
      `;
      container.appendChild(empty);
      return;
    }

    groups.forEach(group => {
      const card = document.createElement("article");
      card.className = "rg-group-card";

      const imageURL = safeImageURL(group.image);
      const members = getGroupMembers(group);

      const imageMarkup = imageURL
        ? `<img class="rg-group-image" src="${escapeHTML(imageURL)}"
             alt="Imagem de ${escapeHTML(group.name)}" loading="lazy">`
        : `<div class="rg-group-image" aria-hidden="true">⚔️</div>`;

      const memberMarkup = members.length
        ? members.map(member => {
            const memberImage = getImage(member);
            const avatar = memberImage
              ? `<img src="${escapeHTML(memberImage)}" alt="" loading="lazy">`
              : `<div class="rg-avatar-placeholder" aria-hidden="true">✦</div>`;

            const type = member._source === "npc" ? "NPC" : "Personagem";

            return `
              <div class="rg-roster-member">
                ${avatar}
                <div class="rg-roster-info">
                  <strong>${escapeHTML(member.name || "Sem nome")}</strong>
                  <small>${type} · Ataque ${getAttack(member)} · Defesa ${getDefense(member)}</small>
                </div>
                <button class="rg-btn secondary"
                  type="button"
                  data-rg-remove-member="${escapeHTML(memberKey(member))}"
                  data-rg-group="${escapeHTML(group.id)}"
                  aria-label="Remover ${escapeHTML(member.name || "membro")} do grupo">
                  −
                </button>
              </div>
            `;
          }).join("")
        : `<p class="rg-muted">Nenhum membro válido vinculado.</p>`;

      card.innerHTML = `
        <div class="rg-group-head">
          ${imageMarkup}

          <div class="rg-group-title">
            <h3>${escapeHTML(group.name || "Grupo sem nome")}</h3>
            <span class="rg-status">${escapeHTML(group.status || "Ativo")}</span>
            ${group.universe
              ? `<div class="rg-muted">${escapeHTML(group.universe)}</div>`
              : ""}
          </div>
        </div>

        ${group.description
          ? `<p>${escapeHTML(group.description)}</p>`
          : ""}

        <div class="rg-stat-grid">
          <div class="rg-stat">
            <small>⚔️ Ataque base</small>
            <strong>${nonNegative(group.attack)}</strong>
          </div>
          <div class="rg-stat">
            <small>🛡️ Defesa base</small>
            <strong>${nonNegative(group.defense)}</strong>
          </div>
          <div class="rg-stat">
            <small>👥 Membros</small>
            <strong>${members.length}</strong>
          </div>
          <div class="rg-stat">
            <small>Identificação</small>
            <strong>${escapeHTML(String(group.id).slice(0, 8))}</strong>
          </div>
        </div>

        <details class="rg-roster">
          <summary>Ver integrantes (${members.length})</summary>
          <div class="rg-roster-list">${memberMarkup}</div>
        </details>

        <div class="rg-actions">
          <button class="rg-btn" type="button"
            data-rg-add="${escapeHTML(group.id)}">
            ⚔ Iniciativa
          </button>

          <button class="rg-btn secondary" type="button"
            data-rg-edit="${escapeHTML(group.id)}">
            Editar
          </button>

          <button class="rg-btn danger" type="button"
            data-rg-delete="${escapeHTML(group.id)}">
            Excluir
          </button>
        </div>
      `;

      const groupImage = $("img.rg-group-image", card);

      if (groupImage) {
        groupImage.addEventListener("error", () => {
          const placeholder = document.createElement("div");
          placeholder.className = "rg-group-image";
          placeholder.setAttribute("aria-hidden", "true");
          placeholder.textContent = "⚔️";
          groupImage.replaceWith(placeholder);
        }, { once: true });
      }

      $$("img", card).forEach(img => {
        img.addEventListener("error", () => {
          const placeholder = document.createElement("div");
          placeholder.className = "rg-avatar-placeholder";
          placeholder.textContent = "✦";
          img.replaceWith(placeholder);
        }, { once: true });
      });

      container.appendChild(card);
    });
  }

  /* ============================================================
     CRIAR E EDITAR
  ============================================================ */

  function resetForm() {
    const form = $("#rgGroupForm");
    if (!form) return;

    form.reset();
    state.editingId = null;

    $("#rgFormHeading").textContent = "Criar grupo";
    $("#rgFormMode").textContent = "Novo registro";
    $("#rgSave").textContent = "＋ Criar grupo";
    $("#rgCancel").hidden = true;

    $("#rgAttack").value = "10";
    $("#rgDefense").value = "5";

    populateMemberPicker();
  }

  function saveGroup(event) {
    event.preventDefault();

    const name = $("#rgName")?.value.trim();

    if (!name) {
      notify("Digite o nome do grupo.");
      $("#rgName")?.focus();
      return;
    }

    const rawImage = $("#rgImage")?.value.trim() || "";
    const image = safeImageURL(rawImage);

    if (rawImage && !image) {
      notify("A imagem precisa usar um endereço HTTP ou HTTPS válido.");
      $("#rgImage")?.focus();
      return;
    }

    const groups = readStore(KEYS.groups, []);
    const existing = state.editingId
      ? groups.find(group => String(group.id) === String(state.editingId))
      : null;

    const group = {
      ...(existing || {}),
      id: existing?.id || generateId(),
      name,
      universe: $("#rgUniverse")?.value.trim() || "",
      image,
      status: $("#rgStatus")?.value || "Ativo",
      attack: nonNegative($("#rgAttack")?.value, 10),
      defense: nonNegative($("#rgDefense")?.value, 5),
      description: $("#rgDescription")?.value.trim() || "",
      memberIds: selectedMemberKeys(),
      created: existing?.created || Date.now(),
      updated: Date.now()
    };

    const updated = existing
      ? groups.map(item =>
          String(item.id) === String(existing.id) ? group : item
        )
      : [...groups, group];

    if (!writeStore(KEYS.groups, updated)) {
      notify("Não foi possível salvar o grupo.");
      return;
    }

    resetForm();
    renderGroups();

    recordActivity(
      existing
        ? `O grupo ${name} foi atualizado.`
        : `O grupo ${name} foi criado.`
    );

    notify(existing ? "Grupo atualizado!" : "Grupo criado!");
  }

  function editGroup(id) {
    const group = readStore(KEYS.groups, [])
      .find(item => String(item.id) === String(id));

    if (!group) {
      notify("Grupo não encontrado.");
      return;
    }

    state.editingId = group.id;

    $("#rgName").value = group.name || "";
    $("#rgUniverse").value = group.universe || "";
    $("#rgImage").value = group.image || "";
    $("#rgStatus").value = group.status || "Ativo";
    $("#rgAttack").value = nonNegative(group.attack, 10);
    $("#rgDefense").value = nonNegative(group.defense, 5);
    $("#rgDescription").value = group.description || "";

    populateMemberPicker(group.memberIds || []);

    $("#rgFormHeading").textContent = "Editar grupo";
    $("#rgFormMode").textContent = "Editando registro";
    $("#rgSave").textContent = "Salvar alterações";
    $("#rgCancel").hidden = false;

    $("#rgGroupForm")?.scrollIntoView({
      behavior: "smooth",
      block: "start"
    });
  }

  function deleteGroup(id) {
    const groups = readStore(KEYS.groups, []);
    const group = groups.find(item => String(item.id) === String(id));

    if (!group) return;

    const confirmed = confirm(
      `Excluir o grupo "${group.name}"?\n\n` +
      "Os personagens, NPCs e combatentes já adicionados à iniciativa não serão excluídos."
    );

    if (!confirmed) return;

    const updated = groups.filter(
      item => String(item.id) !== String(id)
    );

    if (!writeStore(KEYS.groups, updated)) return;

    if (String(state.editingId) === String(id)) {
      resetForm();
    }

    renderGroups();
    recordActivity(`O grupo ${group.name} foi excluído.`);
    notify("Grupo excluído. As fichas originais foram preservadas.");
  }

  /* ============================================================
     REMOVER INTEGRANTE
  ============================================================ */

  function removeMemberFromGroup(groupId, key) {
    const groups = readStore(KEYS.groups, []);
    const group = groups.find(
      item => String(item.id) === String(groupId)
    );

    if (!group) return;

    const member = resolveMemberKey(key);
    const label = member?.name || "Integrante";

    if (!confirm(`Remover "${label}" deste grupo?`)) return;

    group.memberIds = (group.memberIds || [])
      .filter(item => item !== key);

    group.updated = Date.now();

    if (!writeStore(KEYS.groups, groups)) return;

    if (String(state.editingId) === String(groupId)) {
      populateMemberPicker(group.memberIds);
    }

    renderGroups();
    notify(`${label} removido do grupo.`);
  }

  /* ============================================================
     INICIATIVA
  ============================================================ */

  function addGroupToInitiative(groupId) {
    const groups = readStore(KEYS.groups, []);
    const group = groups.find(
      item => String(item.id) === String(groupId)
    );

    if (!group) {
      notify("Grupo não encontrado.");
      return;
    }

    const members = getGroupMembers(group);

    if (!members.length) {
      notify("Este grupo não possui membros válidos.");
      return;
    }

    const combatants = readStore(KEYS.initiative, []);
    const additions = [];

    members.forEach(member => {
      const key = memberKey(member);

      const exists = combatants.some(item =>
        String(item.groupId) === String(group.id) &&
        item.groupMemberKey === key
      );

      if (exists) return;

      const hp = getHP(member);

      additions.push({
        id: generateId(),

        name: member.name || "Combatente sem nome",

        characterId: member._source === "character"
          ? member.id
          : null,

        npcId: member._source === "npc"
          ? member.id
          : null,

        characterName: member.name || null,

        groupId: group.id,
        groupName: group.name,
        groupMemberKey: key,
        groupImage: safeImageURL(group.image),

        image: getImage(member) || safeImageURL(group.image),

        universe: member.universe || member.world || group.universe || "",

        status: "Ativo",

        attack: getAttack(member) || nonNegative(group.attack),
        defense: getDefense(member) || nonNegative(group.defense),

        init: numberValue(member.init ?? member.initiative, 0),

        hp,
        maxHp: hp,

        energy: getEnergy(member),

        created: Date.now()
      });
    });

    if (!additions.length) {
      notify("Todos os membros deste grupo já estão na iniciativa.");
      return;
    }

    const updatedCombatants = [...combatants, ...additions];

    if (!writeStore(KEYS.initiative, updatedCombatants)) {
      notify("Não foi possível atualizar a iniciativa.");
      return;
    }

    if (typeof window.renderInitiative === "function") {
      window.renderInitiative();
    }

    const message =
      `${additions.length} integrante(s) do grupo ${group.name} adicionados à iniciativa.`;

    recordActivity(message);
    notify(message);
  }

  /* ============================================================
     EVENTOS
  ============================================================ */

  function handleGroupListClick(event) {
    const addButton = event.target.closest("[data-rg-add]");
    const editButton = event.target.closest("[data-rg-edit]");
    const deleteButton = event.target.closest("[data-rg-delete]");
    const removeMemberButton = event.target.closest("[data-rg-remove-member]");

    if (addButton) {
      addGroupToInitiative(addButton.dataset.rgAdd);
      return;
    }

    if (editButton) {
      editGroup(editButton.dataset.rgEdit);
      return;
    }

    if (deleteButton) {
      deleteGroup(deleteButton.dataset.rgDelete);
      return;
    }

    if (removeMemberButton) {
      removeMemberFromGroup(
        removeMemberButton.dataset.rgGroup,
        removeMemberButton.dataset.rgRemoveMember
      );
    }
  }

  function setupEvents() {
    $("#rgGroupForm")?.addEventListener("submit", saveGroup);
    $("#rgCancel")?.addEventListener("click", resetForm);
    $("#rgGroupsList")?.addEventListener("click", handleGroupListClick);
  }

  /* ============================================================
     INICIALIZAÇÃO
  ============================================================ */

  function init() {
    if (state.initialized) return;

    state.initialized = true;

    injectStyles();
    createPanel();
    populateMemberPicker();
    setupEvents();
    renderGroups();
  }

  /* ============================================================
     API GLOBAL
  ============================================================ */

  window.RPG_GROUPS = {
    getAll() {
      return readStore(KEYS.groups, []);
    },

    getMembers(groupId) {
      const group = readStore(KEYS.groups, [])
        .find(item => String(item.id) === String(groupId));

      return group ? getGroupMembers(group) : [];
    },

    render: renderGroups,

    refreshMembers() {
      populateMemberPicker(
        state.editingId
          ? readStore(KEYS.groups, [])
              .find(item => String(item.id) === String(state.editingId))
              ?.memberIds || []
          : []
      );

      renderGroups();
    },

    addToInitiative: addGroupToInitiative,

    edit: editGroup,

    resetForm
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();