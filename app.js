/* ============================================================
   RPG NEXUS — app.js
   Sem jQuery. Compatível com o HTML enviado.
============================================================ */

(function () {
  "use strict";

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

  window.$ = window.$ || $;

  function ensureStore(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      if (raw === null) {
        localStorage.setItem(key, JSON.stringify(fallback));
        return fallback;
      }
      return JSON.parse(raw);
    } catch {
      return fallback;
    }
  }

  window.toast = window.toast || function (message) {
    const el = $("#toast");
    if (!el) return;
    el.textContent = message;
    el.classList.add("show");
    clearTimeout(window.__nexusToastTimer);
    window.__nexusToastTimer = setTimeout(() => el.classList.remove("show"), 2600);
  };

  function save(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
    if (window.setStore) window.setStore(key, value);
  }

  function get(key, fallback = []) {
    if (window.getStore) return window.getStore(key, fallback);
    return ensureStore(key, fallback);
  }
  window.getStore = window.getStore || get;
  window.setStore = window.setStore || save;
  window.renderAll = window.renderAll || function(){ renderCharacters(); renderActivity(); if(window.renderMapUI) window.renderMapUI(); if(window.renderInitiativeUI) window.renderInitiativeUI(); };

  function renderActivity() {
    const box = $("#activityLog");
    if (!box) return;
    const logs = get("rpg_logs", []);
    box.innerHTML = logs.length
      ? logs.map(x => `
          <div class="activity-item">
            <span>◆</span>
            <div><b>${escapeHTML(x.text || "")}</b><small>${escapeHTML(x.time || "")}</small></div>
          </div>`).join("")
      : `<div class="empty">Nenhuma atividade ainda.</div>`;
  }

  function escapeHTML(s = "") {
    return String(s).replace(/[&<>"']/g, m => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
    }[m]));
  }

  window.renderActivity = renderActivity;

  function activateTab(id) {
    $$(".page").forEach(p => p.classList.toggle("active", p.id === id));
    $$("[data-tab]").forEach(b => b.classList.toggle("active", b.dataset.tab === id));

    if (id === "map" && window.renderMapUI) {
      setTimeout(window.renderMapUI, 20);
    }
    if (id === "characters") renderCharacters();
    if (id === "initiative" && window.renderInitiativeUI) window.renderInitiativeUI();
  }

  function setupTabs() {
    $$("[data-tab]").forEach(btn => {
      btn.addEventListener("click", () => activateTab(btn.dataset.tab));
    });
  }

  function fillUniverseSelect() {
    const select = $("#charUniverse");
    if (!select || !window.UNIVERSES) return;
    select.innerHTML = Object.entries(UNIVERSES)
      .map(([id, u]) => `<option value="${id}">${escapeHTML(u.icon || "◆")} ${escapeHTML(u.name)}</option>`)
      .join("");
  }

  function updateCharacterPreview() {
    const name = $("#charName")?.value || "Novo personagem";
    const universe = $("#charUniverse")?.value || Object.keys(window.UNIVERSES || {})[0];
    const u = window.UNIVERSES?.[universe];
    const origin = $("#charOrigin")?.value || "Origem não definida";
    const level = $("#charLevel")?.value || 1;
    const hp = $("#charHp")?.value || 100;
    const energy = $("#charEnergy")?.value || 100;
    const desc = $("#charDesc")?.value || "Descreva a história deste personagem.";
    const image = $("#charImagePreview")?.src || "";

    $("#previewUniverse") && ($("#previewUniverse").textContent = u?.name || "Universo");
    const box = $("#characterPreview");
    if (!box) return;

    box.innerHTML = `
      <div class="character-preview-inner">
        <div class="char-symbol" style="color:${u?.color || "#fff"}">${u?.icon || "✦"}</div>
        <h2>${escapeHTML(name)}</h2>
        <span>${escapeHTML(origin)} · LV ${escapeHTML(level)}</span>
        <p>${escapeHTML(desc)}</p>
        <div class="mini-stats">
          <div><span>HP</span><b>${escapeHTML(hp)}</b></div>
          <div><span>ENERGIA</span><b>${escapeHTML(energy)}</b></div>
        </div>
      </div>`;
  }

  function setupCharacterForm() {
    fillUniverseSelect();

    const form = $("#charForm");
    if (!form) return;

    ["charName", "charUniverse", "charOrigin", "charLevel", "charHp", "charEnergy", "charDesc"]
      .forEach(id => $("#" + id)?.addEventListener("input", updateCharacterPreview));

    $("#charImage")?.addEventListener("change", async e => {
      const file = e.target.files?.[0];
      if (!file) return;
      try {
        const src = await window.resizeImage(file, 480, .82);
        $("#charImagePreview") && ($("#charImagePreview").src = src, $("#charImagePreview").hidden = false);
        form.dataset.image = src;
        updateCharacterPreview();
      } catch (err) {
        e.target.value = "";
        toast(err.message || "Imagem inválida.");
      }
    });

    $("#randomize")?.addEventListener("click", () => {
      const keys = Object.keys(window.UNIVERSES || {});
      const universe = keys[Math.floor(Math.random() * keys.length)];
      const u = window.UNIVERSES[universe];
      $("#charName").value = ["Kael", "Astra", "Ren", "Mira", "Zayn", "Luna"][Math.floor(Math.random() * 6)];
      $("#charUniverse").value = universe;
      $("#charOrigin").value = u.origin[Math.floor(Math.random() * u.origin.length)];
      $("#charLevel").value = 1 + Math.floor(Math.random() * 50);
      $("#charHp").value = 100 + Math.floor(Math.random() * 900);
      $("#charEnergy").value = 100 + Math.floor(Math.random() * 900);
      $("#charDesc").value = `Guerreiro de ${u.name}, preparado para explorar o Nexus.`;
      renderPowerFields();
      updateCharacterPreview();
    });

    $("#addPower")?.addEventListener("click", () => {
      addPowerBlock();
    });

    form.addEventListener("submit", e => {
      e.preventDefault();
      const universe = $("#charUniverse").value;
      const powers = getPowerData();
      if (powers.length < 2) return toast("O personagem precisa ter pelo menos 2 poderes.");
      if (powers.some(p => !p.name)) return toast("Todos os poderes precisam ter nome.");
      if (powers.some(p => p.techniques.length < 6 || p.techniques.some(t => !t))) {
        return toast("Cada poder precisa ter pelo menos 6 técnicas preenchidas.");
      }

      const artifacts = $$("#characterArtifacts input").map(x => x.value.trim()).filter(Boolean);
      const character = {
        id: window.uid ? uid() : crypto.randomUUID(),
        name: $("#charName").value.trim(),
        universe,
        origin: $("#charOrigin").value.trim(),
        level: Number($("#charLevel").value) || 1,
        hp: Number($("#charHp").value) || 100,
        energy: Number($("#charEnergy").value) || 0,
        desc: $("#charDesc").value.trim(),
        appearance: $("#charAppearance")?.value.trim() || "",
        image: form.dataset.image || "",
        powers,
        artifacts,
        techniques: powers.flatMap(p => p.techniques),
        created: Date.now()
      };

      if (!character.name) return toast("Digite o nome do personagem.");
      const chars = get("rpg_characters", []);
      chars.unshift(character);
      save("rpg_characters", chars);
      saveActivity(`Personagem criado: ${character.name}.`);
      renderCharacters();
      refreshCounters();
      toast("Personagem salvo no Nexus.");
      form.reset();
      delete form.dataset.image;
      if ($("#charImagePreview")) $("#charImagePreview").hidden = true;
      renderPowerFields();
      renderArtifactFields();
      updateCharacterPreview();
    });

    renderPowerFields();
    renderArtifactFields();
    updateCharacterPreview();
  }

  function getPowerData() {
    return $$(".power-block").map(block => ({
      name: block.querySelector(".power-name")?.value.trim() || "",
      techniques: [...block.querySelectorAll(".power-technique")].map(x => x.value.trim()).filter(Boolean)
    }));
  }

  function addPowerBlock(data = {}) {
    const box = $("#powers");
    if (!box) return;
    const index = box.querySelectorAll(".power-block").length + 1;
    const techniques = Array.isArray(data.techniques) ? data.techniques : [];
    const block = document.createElement("div");
    block.className = "power-block";
    block.innerHTML = `
      <div class="power-block-head"><b>Poder ${index}</b>${index > 2 ? `<button type="button" class="danger-link remove-power">×</button>` : ""}</div>
      <label>Nome do poder<input class="power-name" value="${escapeHTML(data.name || "")}" placeholder="Ex.: Controle do Ki"></label>
      <div class="power-techniques">
        ${Array.from({length:6},(_,i)=>`<label>Técnica ${i+1}<input class="power-technique" value="${escapeHTML(techniques[i] || "")}" placeholder="Técnica ${i+1}"></label>`).join("")}
      </div>`;
    box.appendChild(block);
    block.querySelector(".remove-power")?.addEventListener("click", () => { block.remove(); renumberPowers(); });
  }

  function renumberPowers() {
    $$(".power-block").forEach((b,i) => { const h=b.querySelector(".power-block-head b"); if(h) h.textContent=`Poder ${i+1}`; });
  }

  function renderPowerFields() {
    const box = $("#powers");
    if (!box) return;
    const u = window.UNIVERSES?.[$("#charUniverse")?.value];
    box.innerHTML = "";
    const defaults = u?.powers || ["Poder 1", "Poder 2"];
    const techniques = u?.techniques || window.DEFAULT_TECHNIQUES || [];
    for (let i=0;i<2;i++) addPowerBlock({name: defaults[i] || `Poder ${i+1}`, techniques: techniques.slice(i*6,i*6+6).length ? techniques.slice(i*6,i*6+6) : techniques.slice(0,6)});
  }

  function renderTechniqueFields() {
    // Compatibilidade com código antigo: técnicas agora ficam dentro de cada poder.
    renderPowerFields();
  }

  function renderArtifactFields() {
    const box = $("#characterArtifacts");
    if (!box) return;
    if (!box.children.length) {
      for (let i=0;i<3;i++) {
        const label=document.createElement("label");
        label.innerHTML=`Artefato ${i+1}<input class="artifact-input" placeholder="Opcional">`;
        box.appendChild(label);
      }
    }
  }

  function renderCharacters() {
    const box = $("#characterList");
    if (!box) return;

    const chars = get("rpg_characters", []);
    $("#charCount") && ($("#charCount").textContent = chars.length);

    box.innerHTML = chars.length
      ? chars.map(c => {
          const u = window.UNIVERSES?.[c.universe] || {};
          return `
            <article class="character-item">
              ${c.image ? `<img class="character-list-image" src="${escapeHTML(c.image)}" alt="">` : `<div class="char-symbol" style="color:${u.color || "#fff"}">${u.icon || "✦"}</div>`}
              <div>
                <h3>${escapeHTML(c.name)}</h3>
                <small>${escapeHTML(u.name || c.universe || "")} · LV ${c.level || 1}${c.owner ? ` · por ${escapeHTML(c.owner)}` : ""}</small>
              </div>
              <button class="secondary small" data-open-char3d="${escapeHTML(c.id)}">3D</button>
              <button class="danger-link" data-remove-char="${escapeHTML(c.id)}">Excluir</button>
            </article>`;
        }).join("")
      : `<div class="empty">Nenhum personagem criado.</div>`;

    $$("[data-remove-char]").forEach(btn => {
      btn.addEventListener("click", () => {
        const id = btn.dataset.removeChar;
        save("rpg_characters", chars.filter(c => c.id !== id));
        renderCharacters();
        refreshCounters();
      });
    });

    $$("[data-open-char3d]").forEach(btn => {
      btn.addEventListener("click", () => {
        const c = chars.find(x => x.id === btn.dataset.openChar3d);
        if (c && window.NPC_SYSTEM) window.NPC_SYSTEM.open3D(c);
      });
    });
  }

  function refreshCounters() {
    const chars = get("rpg_characters", []);
    const markers = get("rpg_markers", []);
    const combatants = get("rpg_initiative", []);
    const npcs = get("rpg_npcs", []);

    $("#dashNpcs") && ($("#dashNpcs").textContent = npcs.length);
    $("#dashChars") && ($("#dashChars").textContent = chars.length);
    $("#dashMarkers") && ($("#dashMarkers").textContent = markers.length);
    $("#dashCombatants") && ($("#dashCombatants").textContent = combatants.length);
  }

  function setupClear() {
    $("#clearAll")?.addEventListener("click", () => {
      if (!confirm("Limpar personagens, encontros e iniciativa locais?")) return;
      ["rpg_characters", "rpg_markers", "rpg_initiative", "rpg_logs"].forEach(k => localStorage.removeItem(k));
      location.reload();
    });
  }

  function setupTheme() {
    $("#themeBtn")?.addEventListener("click", () => {
      document.body.classList.toggle("light");
      localStorage.setItem("nexus_theme", document.body.classList.contains("light") ? "light" : "dark");
    });
    if (localStorage.getItem("nexus_theme") === "light") document.body.classList.add("light");
  }

  document.addEventListener("DOMContentLoaded", () => {
    setupTabs();
    setupCharacterForm();
    setupClear();
    setupTheme();
    renderCharacters();
    renderActivity();
    refreshCounters();

    if (window.hydrate) hydrate();
    if (window.renderMapUI) window.renderMapUI();
    if (window.NPC_SYSTEM?.render) window.NPC_SYSTEM.render();
  });

  window.renderPowerFields = renderPowerFields;
  window.renderTechniqueFields = renderTechniqueFields;
})();