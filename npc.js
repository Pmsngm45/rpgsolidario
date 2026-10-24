/* ============================================================
   RPG NEXUS — NPC / PERSONAGEM 3D PROCEDURAL
   Não usa jQuery.
   ============================================================ */

(function () {
  "use strict";

  const NPC_KEY = "rpg_npcs";

  const CDN =
    "https://cdn.jsdelivr.net/npm/three@0.149.0/build/three.min.js";

  const ORBIT =
    "https://cdn.jsdelivr.net/npm/three@0.149.0/examples/js/controls/OrbitControls.js";

  // ============================================================
  // HELPERS
  // ============================================================

  function $(selector, root = document) {
    return root.querySelector(selector);
  }

  function npcToast(message) {
    if (typeof window.toast === "function") {
      window.toast(message);
      return;
    }

    const el = document.getElementById("toast");

    if (el) {
      el.textContent = message;
      el.classList.add("show");

      setTimeout(() => {
        el.classList.remove("show");
      }, 2500);

      return;
    }

    console.log("[NPC]", message);
  }

  function esc(s) {
    return String(s ?? "").replace(/[&<>"']/g, m => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;"
    }[m]));
  }

  function uid() {
    if (typeof window.uid === "function") {
      return window.uid();
    }

    if (
      typeof crypto !== "undefined" &&
      typeof crypto.randomUUID === "function"
    ) {
      return crypto.randomUUID();
    }

    return Date.now() + "-" + Math.random().toString(36).slice(2);
  }

  // ============================================================
  // STORAGE
  // ============================================================

 // ============================================================
// BANCO LOCAL DOS NPCs — IndexedDB
// Evita QuotaExceededError do localStorage
// ============================================================

const NPC_DB_NAME = "RPG_NEXUS_DB";
const NPC_DB_VERSION = 1;
const NPC_STORE = "npcs";

function getNPCs() {
  try {
    const value = typeof window.getStore === "function"
      ? window.getStore(NPC_KEY, [])
      : JSON.parse(localStorage.getItem(NPC_KEY) || "[]");
    return Array.isArray(value) ? value : [];
  } catch (error) {
    console.warn("Falha ao ler NPCs:", error);
    return [];
  }
}

function saveNPCs(list) {
  const safeList = Array.isArray(list) ? list : [];
  if (typeof window.setStore === "function") window.setStore(NPC_KEY, safeList);
  else localStorage.setItem(NPC_KEY, JSON.stringify(safeList));
}

async function saveNPC(npc) {
  const list = getNPCs();
  const index = list.findIndex(item => item.id === npc.id);
  if (index >= 0) list[index] = npc; else list.push(npc);
  saveNPCs(list);
  return npc;
}

async function deleteNPCFromDB(id) {
  saveNPCs(getNPCs().filter(npc => npc.id !== id));
}

function normalizePower(power) {
    if (!power) {
      return {
        name: "Poder sem nome",
        techniques: []
      };
    }

    if (typeof power === "string") {
      return {
        name: power,
        techniques: []
      };
    }

    return {
      name: power.name || "Poder sem nome",
      techniques: Array.isArray(power.techniques)
        ? power.techniques
        : []
    };
  }

  function normalizeNPC(raw = {}) {
    const stats = raw.stats || {};

    let powers = Array.isArray(raw.powers)
      ? raw.powers.map(normalizePower)
      : [];

    // Compatibilidade com personagens antigos
    if (!powers.length && raw.power) {
      powers = [normalizePower(raw.power)];
    }

    return {
      id: raw.id || uid(),

      name: raw.name || "NPC sem nome",

      universe:
        raw.universe ||
        "dragonball",

      description:
        raw.description ||
        raw.desc ||
        "Personagem do Nexus.",

      appearance:
        raw.appearance ||
        raw.aparencia ||
        "",

      role:
        raw.role ||
        "Neutro",

      level: Number(
        raw.level ||
        stats.level ||
        1
      ),

      hp: Number(
        raw.hp ||
        stats.hp ||
        100
      ),

      energy: Number(
        raw.energy ||
        stats.energy ||
        100
      ),

      speed: Number(
        raw.speed ||
        stats.speed ||
        50
      ),

      strength: Number(
        raw.strength ||
        stats.strength ||
        50
      ),

      defense: Number(
        raw.defense ||
        stats.defense ||
        50
      ),

      intelligence: Number(
        raw.intelligence ||
        stats.intelligence ||
        50
      ),

      powers,

      artifacts: Array.isArray(raw.artifacts)
        ? raw.artifacts
        : String(raw.artifacts || "")
            .split(",")
            .map(x => x.trim())
            .filter(Boolean),

      techniques: Array.isArray(raw.techniques)
        ? raw.techniques
        : powers.flatMap(
            p => p.techniques || []
          ),

      // NPC continua obrigatoriamente com imagem
      image:
        raw.image ||
        "",

      color:
        raw.color ||
        null,

      created:
        raw.created ||
        Date.now()
    };
  }

  // ============================================================
  // CRIAR / REMOVER
  // ============================================================

 async function createNPC(data) {
  try {
    const npc = normalizeNPC(data);

    // Salva diretamente no IndexedDB
    await saveNPC(npc);

    if (window.saveActivity) {
      window.saveActivity(`NPC criado: ${npc.name}.`);
    }

    // Atualiza a lista
    await renderNPCList();

    return npc;

  } catch (error) {
    console.error("Erro ao criar NPC:", error);
    npcToast("Erro ao salvar o NPC: " + (error.message || "erro desconhecido"));
    return null;
  }
}

  async function removeNPC(id) {
    await deleteNPCFromDB(id);
    if (three.npc && three.npc.id === id) close3D();
    await renderNPCList();
    if (typeof window.renderAll === "function") window.renderAll();
    npcToast("NPC removido.");
  }

  // ============================================================
  // THREE.JS
  // ============================================================

  
function loadScript(src) {
  const isThree = src.includes("/build/three");
  const isOrbit = src.includes("OrbitControls");

  // Reutiliza o Three.js se já estiver carregado.
  if (isThree && window.THREE) {
    return Promise.resolve();
  }

  // O OrbitControls precisa estar disponível no THREE.
  if (isOrbit && window.THREE?.OrbitControls) {
    return Promise.resolve();
  }

  // Tenta reutilizar o carregador compartilhado do projeto.
  if (isThree && typeof window.loadThreeShared === "function") {
    return Promise.resolve()
      .then(() => window.loadThreeShared())
      .then(() => {
        if (!window.THREE) {
          throw new Error(
            "O carregador compartilhado terminou, mas THREE não foi definido."
          );
        }
      });
  }

  return new Promise((resolve, reject) => {
    const scripts = Array.from(document.scripts);

    const existing = scripts.find(script => {
      try {
        return new URL(script.src, document.baseURI).href ===
          new URL(src, document.baseURI).href;
      } catch {
        return false;
      }
    });

    function validateLoaded() {
      if (isThree && !window.THREE) {
        reject(new Error(
          "O arquivo Three.js carregou, mas window.THREE não existe."
        ));
        return;
      }

      if (isOrbit && !window.THREE?.OrbitControls) {
        reject(new Error(
          "OrbitControls carregou, mas THREE.OrbitControls não existe."
        ));
        return;
      }

      resolve();
    }

    if (existing) {
      // O arquivo já está presente, mas pode ter falhado anteriormente.
      if (existing.dataset.loadFailed === "true") {
        reject(new Error("O script já falhou ao carregar: " + src));
        return;
      }

      if (existing.dataset.loadComplete === "true") {
        validateLoaded();
        return;
      }

      existing.addEventListener("load", validateLoaded, { once: true });

      existing.addEventListener("error", () => {
        existing.dataset.loadFailed = "true";
        reject(new Error("Falha ao carregar o arquivo: " + src));
      }, { once: true });

      return;
    }

    const script = document.createElement("script");
    script.src = src;
    script.async = true;

    script.addEventListener("load", () => {
      script.dataset.loadComplete = "true";
      validateLoaded();
    }, { once: true });

    script.addEventListener("error", () => {
      script.dataset.loadFailed = "true";
      reject(new Error(
        "Não foi possível carregar " + src +
        ". Verifique a rede, o CDN ou os bloqueios do navegador."
      ));
    }, { once: true });

    document.head.appendChild(script);
  });
}

  function getUniverse(npc) {
    return (
      window.UNIVERSES?.[npc.universe] || {
        name: npc.universe || "Nexus",
        color: "#8b5cf6",
        icon: "✦"
      }
    );
  }

  function colorFor(npc) {
    const universe = getUniverse(npc);

    if (npc.color) {
      return npc.color;
    }

    return universe.color || "#8b5cf6";
  }

  // ============================================================
  // MODAL
  // ============================================================

  function createModal() {
    let modal =
      document.getElementById(
        "npc3DModal"
      );

    if (modal) {
      return modal;
    }

    modal =
      document.createElement("div");

    modal.id = "npc3DModal";

    modal.innerHTML = `
      <div class="npc3d-backdrop"></div>

      <div class="npc3d-window">

        <div class="npc3d-head">

          <div>
            <span class="npc3d-kicker">
              NEXUS 3D CHARACTER ENGINE
            </span>

            <h2 id="npc3DName">
              NPC
            </h2>

            <small id="npc3DUniverse">
              Universo
            </small>
          </div>

          <button id="npc3DClose">
            ×
          </button>

        </div>

        <div class="npc3d-main">

          <div id="npc3DCanvas"></div>

          <aside class="npc3d-info">

            <div class="npc3d-status">

              <div>
                <span>LV</span>
                <b id="npcLV">1</b>
              </div>

              <div>
                <span>HP</span>
                <b id="npcHP">100</b>
              </div>

              <div>
                <span>ENERGIA</span>
                <b id="npcEN">100</b>
              </div>

            </div>

            <div id="npcAppearanceImageBox"></div>

            <h3>Descrição</h3>
            <p id="npcDescription"></p>

            <h3>Aparência</h3>
            <p id="npcAppearance"></p>

            <h3>Atributos</h3>
            <div id="npcStats" class="npc-bars"></div>

            <h3>Poderes</h3>
            <div id="npcPowers" class="npc-powers"></div>

            <h3>Artefatos</h3>
            <div id="npcArtifacts" class="npc-tags"></div>

            <div class="npc3d-actions">

              <button id="npcPowerButton">
                ⚡ Usar poder
              </button>

              <button id="npcAttackButton">
                ✦ Ataque
              </button>

              <button id="npcResetButton">
                ↻ Resetar cena
              </button>

            </div>

          </aside>

        </div>

      </div>
    `;

    const style =
      document.createElement("style");

    style.textContent = `
      #npc3DModal {
        position: fixed;
        inset: 0;
        z-index: 99999;
        display: none;
        font-family: Inter, system-ui, sans-serif;
      }

      #npc3DModal.open {
        display: block;
      }

      .npc3d-backdrop {
        position: absolute;
        inset: 0;
        background: rgba(2,4,12,.86);
        backdrop-filter: blur(8px);
      }

      .npc3d-window {
        position: absolute;
        left: 4vw;
        right: 4vw;
        top: 4vh;
        bottom: 4vh;
        background: #0b1020;
        border: 1px solid rgba(255,255,255,.14);
        border-radius: 22px;
        overflow: hidden;
        box-shadow: 0 30px 100px #000;
      }

      .npc3d-head {
        height: 78px;
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 12px 20px;
        border-bottom: 1px solid rgba(255,255,255,.1);
        background: linear-gradient(
          90deg,
          rgba(40,48,80,.9),
          rgba(9,14,29,.9)
        );
      }

      .npc3d-kicker {
        font-size: 10px;
        letter-spacing: 2px;
        color: #8da0c8;
      }

      .npc3d-head h2 {
        margin: 2px 0;
        font-size: 23px;
        color: #fff;
      }

      .npc3d-head small {
        color: #aeb9cf;
      }

      #npc3DClose {
        width: 42px;
        height: 42px;
        border: 0;
        border-radius: 50%;
        background: #20283d;
        color: white;
        font-size: 28px;
        cursor: pointer;
      }

      .npc3d-main {
        height: calc(100% - 78px);
        display: grid;
        grid-template-columns:
          minmax(0, 1fr) 370px;
      }

      #npc3DCanvas {
        position: relative;
        min-height: 400px;
        background:
          radial-gradient(
            circle at 50% 35%,
            #273457,
            #080b15 65%
          );
        overflow: hidden;
      }

      #npc3DCanvas canvas {
        width: 100% !important;
        height: 100% !important;
        display: block;
      }

      .npc3d-info {
        overflow: auto;
        padding: 20px;
        background: #0d1324;
        color: #dce4f5;
      }

      .npc3d-info h3 {
        font-size: 12px;
        text-transform: uppercase;
        letter-spacing: 1px;
        color: #7f91b6;
        margin: 18px 0 7px;
      }

      .npc3d-info p {
        font-size: 13px;
        line-height: 1.5;
        color: #b8c3d8;
        margin: 0;
      }

      .npc3d-status {
        display: grid;
        grid-template-columns: repeat(3,1fr);
        gap: 7px;
      }

      .npc3d-status div {
        background: #151d32;
        border: 1px solid #27324d;
        border-radius: 12px;
        padding: 9px;
        text-align: center;
      }

      .npc3d-status span {
        display: block;
        font-size: 9px;
        color: #8290ad;
      }

      .npc3d-status b {
        font-size: 18px;
        color: #fff;
      }

      .npc-bars {
        display: grid;
        gap: 6px;
      }

      .npc-bar {
        display: grid;
        grid-template-columns: 75px 1fr 35px;
        gap: 7px;
        align-items: center;
        font-size: 10px;
      }

      .npc-bar i {
        height: 6px;
        background: #202a42;
        border-radius: 8px;
        overflow: hidden;
      }

      .npc-bar i b {
        display: block;
        height: 100%;
        background: currentColor;
        border-radius: 8px;
      }

      .npc-powers {
        display: grid;
        gap: 10px;
      }

      .npc-power-card {
        padding: 10px;
        border-radius: 10px;
        background: #151d31;
        border: 1px solid #303c59;
      }

      .npc-power-card strong {
        display: block;
        color: #fff;
        margin-bottom: 7px;
      }

      .npc-techniques {
        display: grid;
        gap: 4px;
      }

      .npc-technique {
        font-size: 10px;
        color: #b9c5db;
      }

      .npc-tags {
        display: flex;
        gap: 6px;
        flex-wrap: wrap;
      }

      .npc-tag {
        font-size: 10px;
        border: 1px solid #303c59;
        background: #151d31;
        padding: 5px 8px;
        border-radius: 8px;
        color: #d5dded;
      }

      .npc-appearance-image {
        width: 100%;
        max-height: 230px;
        object-fit: cover;
        border-radius: 12px;
        margin-top: 15px;
        border: 1px solid #303c59;
      }

      .npc3d-actions {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 8px;
        margin-top: 20px;
      }

      .npc3d-actions button {
        border: 0;
        border-radius: 10px;
        padding: 10px;
        background: #202c49;
        color: #fff;
        cursor: pointer;
      }

      .npc3d-actions button:first-child {
        grid-column: 1/-1;
        background: #4f46e5;
      }

      @media(max-width:900px) {

        .npc3d-main {
          grid-template-columns: 1fr;
        }

        .npc3d-info {
          position: absolute;
          right: 0;
          top: 78px;
          bottom: 0;
          width: min(370px,90vw);
          box-shadow: -15px 0 40px #000;
        }

        .npc3d-window {
          top: 1vh;
          bottom: 1vh;
          left: 1vw;
          right: 1vw;
        }

      }
    `;

    document.head.appendChild(style);
    document.body.appendChild(modal);

    $("#npc3DClose", modal).onclick = close3D;

    $(".npc3d-backdrop", modal).onclick = close3D;

    return modal;
  }

  // ============================================================
  // INFORMAÇÕES
  // ============================================================

  function setInfo(npc) {
    const modal = createModal();

    const u = getUniverse(npc);

    $("#npc3DName", modal).textContent =
      npc.name;

    $("#npc3DUniverse", modal).textContent =
      `${u.icon || "✦"} ${u.name || "Nexus"} · ${npc.role}`;

    $("#npcLV", modal).textContent =
      npc.level;

    $("#npcHP", modal).textContent =
      npc.hp;

    $("#npcEN", modal).textContent =
      npc.energy;

    $("#npcDescription", modal).textContent =
      npc.description;

    $("#npcAppearance", modal).textContent =
      npc.appearance ||
      "Aparência não informada.";

    const imageBox =
      $("#npcAppearanceImageBox", modal);

    imageBox.innerHTML = "";

    if (npc.image) {
      const img =
        document.createElement("img");

      img.className =
        "npc-appearance-image";

      img.src = npc.image;

      img.alt =
        `Aparência de ${npc.name}`;

      imageBox.appendChild(img);
    }

    const attrs = [
      ["Força", npc.strength],
      ["Defesa", npc.defense],
      ["Velocidade", npc.speed],
      ["Intelecto", npc.intelligence]
    ];

    $("#npcStats", modal).innerHTML =
      attrs.map(([name, value]) => `
        <div class="npc-bar">
          <span>${name}</span>

          <i>
            <b style="
              width:${Math.min(
                100,
                Math.max(0, value)
              )}%
            "></b>
          </i>

          <b>${value}</b>
        </div>
      `).join("");

    // ==========================================================
    // PODERES + 6 TÉCNICAS
    // ==========================================================

    $("#npcPowers", modal).innerHTML =
      npc.powers.length
        ? npc.powers.map((power, index) => `
            <div class="npc-power-card">

              <strong>
                ⚡ Poder ${index + 1}:
                ${esc(power.name)}
              </strong>

              <div class="npc-techniques">

                ${(power.techniques || [])
                  .map((technique, i) => `
                    <div class="npc-technique">
                      ${i + 1}. ${esc(technique)}
                    </div>
                  `)
                  .join("")}

              </div>

            </div>
          `).join("")
        : `
          <span class="npc-tag">
            Nenhum poder definido
          </span>
        `;

    $("#npcArtifacts", modal).innerHTML =
      npc.artifacts.length
        ? npc.artifacts.map(
            artifact => `
              <span class="npc-tag">
                ${esc(artifact)}
              </span>
            `
          ).join("")
        : `
          <span class="npc-tag">
            Nenhum artefato
          </span>
        `;
  }

  // ============================================================
  // ESTADO 3D
  // ============================================================

  let three = {
    renderer: null,
    scene: null,
    camera: null,
    controls: null,
    group: null,
    aura: null,
    animation: null,
    npc: null,
    clock: null
  };

  // ============================================================
  // ABRIR 3D
  // ============================================================

  async function open3D(raw) {
    const npc = normalizeNPC(raw);

    three.npc = npc;

    const modal = createModal();

    modal.classList.add("open");

    setInfo(npc);

    try {
      await loadScript(CDN);

      await loadScript(ORBIT);

      buildScene(npc);

    } catch (error) {

      console.error(
        "Falha ao carregar motor 3D:",
        error
      );

      $("#npc3DCanvas").innerHTML = `
        <div style="
          padding:30px;
          color:white
        ">
          Não foi possível carregar
          o motor 3D.
          Verifique sua conexão.
        </div>
      `;
    }

    $("#npcPowerButton", modal).onclick =
      () => activatePower(npc);

    $("#npcAttackButton", modal).onclick =
      () => attackAnimation(npc);

    $("#npcResetButton", modal).onclick =
      () => buildScene(npc);
  }

  function close3D() {
    const modal =
      document.getElementById(
        "npc3DModal"
      );

    modal?.classList.remove("open");

    if (three.animation) {
      cancelAnimationFrame(
        three.animation
      );
    }

    three.animation = null;
    disposeSceneResources();
  }

  // ============================================================
  // IMAGEM
  // ============================================================

  function processImage(file) {
    if (
      typeof window.resizeImage ===
      "function"
    ) {
      return window.resizeImage(
        file,
        480,
        0.82
      );
    }

    return new Promise(
      (resolve, reject) => {

        const reader =
          new FileReader();

        reader.onload = () =>
          resolve(reader.result);

        reader.onerror = () =>
          reject(
            new Error(
              "Não foi possível ler a imagem."
            )
          );

        reader.readAsDataURL(file);
      }
    );
  }

  // ============================================================
  // CRIADOR DE NPC
  // ============================================================

  function openNPCForm() {

    const old =
      document.getElementById(
        "npcEditorOverlay"
      );

    if (old) {
      old.remove();
    }

    const form =
      document.createElement("div");

    form.id =
      "npcEditorOverlay";

    form.innerHTML = `
      <div style="
        position:fixed;
        inset:0;
        background:rgba(0,0,0,.75);
        z-index:99990;
        display:grid;
        place-items:center
      ">

        <form
          id="npcEditor"
          style="
            width:min(720px,94vw);
            max-height:90vh;
            overflow:auto;
            background:#10172a;
            color:white;
            padding:24px;
            border-radius:18px
          "
        >

          <h2>
            Criar NPC 3D
          </h2>

          <p style="color:#9ba8c0">
            O NPC precisa possuir imagem,
            2 poderes e 6 técnicas para
            cada poder.
          </p>

          <div style="
            display:grid;
            grid-template-columns:
              1fr 1fr;
            gap:10px
          ">

            <input
              name="name"
              required
              placeholder="Nome"
            >

            <select name="universe">
              ${Object.entries(
                window.UNIVERSES || {}
              ).map(([key, universe]) => `
                <option value="${esc(key)}">
                  ${esc(universe.name)}
                </option>
              `).join("")}
            </select>

            <input
              name="role"
              placeholder="
                Função: herói, vilão, aliado...
              "
            >

            <input
              name="level"
              type="number"
              value="1"
              min="1"
            >

            <input
              name="hp"
              type="number"
              value="100"
            >

            <input
              name="energy"
              type="number"
              value="100"
            >

            <input
              name="strength"
              type="number"
              value="50"
            >

            <input
              name="defense"
              type="number"
              value="50"
            >

            <input
              name="speed"
              type="number"
              value="50"
            >

            <input
              name="intelligence"
              type="number"
              value="50"
            >

          </div>

          <textarea
            name="description"
            rows="3"
            placeholder="Descrição do personagem"
          ></textarea>

          <textarea
            name="appearance"
            rows="3"
            placeholder="
              Aparência:
              cabelo, olhos, roupa,
              armadura, altura...
            "
            required
          ></textarea>

          <label style="
            display:block;
            margin-top:12px
          ">
            Imagem da aparência

            <b style="
              color:#ff6b6b
            ">
              obrigatória
            </b>

            <input
              name="imageFile"
              type="file"
              accept="image/*"
              required
            >
          </label>

          <hr>

          <h3>
            Poder 1
          </h3>

          <input
            name="power1"
            required
            placeholder="Nome do Poder 1"
          >

          ${Array.from(
            { length: 6 },
            (_, i) => `
              <input
                name="power1t${i + 1}"
                required
                placeholder="
                  Poder 1 — Técnica ${i + 1}
                "
              >
            `
          ).join("")}

          <hr>

          <h3>
            Poder 2
          </h3>

          <input
            name="power2"
            required
            placeholder="Nome do Poder 2"
          >

          ${Array.from(
            { length: 6 },
            (_, i) => `
              <input
                name="power2t${i + 1}"
                required
                placeholder="
                  Poder 2 — Técnica ${i + 1}
                "
              >
            `
          ).join("")}

          <hr>

          <h3>
            Artefatos
          </h3>

          <textarea
            name="artifacts"
            rows="2"
            placeholder="
              Espada, armadura,
              anel mágico...
              separados por vírgula
            "
          ></textarea>

          <div style="
            display:flex;
            gap:8px;
            margin-top:12px
          ">

            <button type="submit">
              Criar e abrir 3D
            </button>

            <button
              type="button"
              id="cancelNPC"
            >
              Cancelar
            </button>

          </div>

        </form>

      </div>
    `;

    document.body.appendChild(form);

    $("#cancelNPC", form).onclick =
      () => form.remove();

    $("#npcEditor", form).onsubmit =
      async function (e) {

        e.preventDefault();

        const fd =
          new FormData(e.currentTarget);

        const data =
          Object.fromEntries(
            fd.entries()
          );

        [
          "level",
          "hp",
          "energy",
          "strength",
          "defense",
          "speed",
          "intelligence"
        ].forEach(key => {
          data[key] =
            Number(data[key]) || 0;
        });

        // ======================================================
        // IMAGEM OBRIGATÓRIA
        // ======================================================

        const file =
          fd.get("imageFile");

        if (
          !(file instanceof File) ||
          !file.type.startsWith("image/")
        ) {
          npcToast(
            "A imagem de aparência do NPC é obrigatória."
          );

          return;
        }

        let image = "";

        try {

          image =
            await processImage(file);

        } catch (error) {

          npcToast(
            error.message ||
            "Não foi possível processar a imagem."
          );

          return;
        }

        data.image = image;

        // ======================================================
        // PODER 1
        // ======================================================

        const power1 = {
          name:
            String(
              data.power1 || ""
            ).trim(),

          techniques:
            Array.from(
              { length: 6 },
              (_, i) =>
                String(
                  data[
                    `power1t${i + 1}`
                  ] || ""
                ).trim()
            )
        };

        // ======================================================
        // PODER 2
        // ======================================================

        const power2 = {
          name:
            String(
              data.power2 || ""
            ).trim(),

          techniques:
            Array.from(
              { length: 6 },
              (_, i) =>
                String(
                  data[
                    `power2t${i + 1}`
                  ] || ""
                ).trim()
            )
        };

        // ======================================================
        // GARANTIA DE 2 PODERES
        // ======================================================

        if (
          !power1.name ||
          !power2.name
        ) {
          npcToast(
            "O personagem precisa ter 2 poderes."
          );

          return;
        }

        if (
          power1.techniques.some(
            technique => !technique
          ) ||
          power2.techniques.some(
            technique => !technique
          )
        ) {
          npcToast(
            "Cada poder precisa ter exatamente 6 técnicas."
          );

          return;
        }

        data.powers = [
          power1,
          power2
        ];

        data.techniques =
          data.powers.flatMap(
            power =>
              power.techniques
          );

        data.artifacts =
          String(
            data.artifacts || ""
          )
            .split(",")
            .map(x => x.trim())
            .filter(Boolean);

        delete data.imageFile;

        const npc = await createNPC(data);
        if (!npc) return;
        form.remove();
        await open3D(npc);
      };
  }

  // ============================================================
  // LISTA
  // ============================================================

  function renderNPCList() {

    const box =
      document.getElementById(
        "npcList"
      );

    if (!box) {
      return;
    }

    const list =
      getNPCs();

    box.innerHTML =
      list.length
        ? list.map(npc => {

            const universe =
              getUniverse(npc);

            return `
              <article class="npc-card">

                ${
                  npc.image
                    ? `
                      <img
                        src="${npc.image}"
                        style="
                          width:80px;
                          height:80px;
                          object-fit:cover;
                          border-radius:10px
                        "
                      >
                    `
                    : ""
                }

                <b>
                  ${esc(npc.name)}
                </b>

                <small>
                  ${esc(universe.name)}
                  · LV ${npc.level}
                </small>

                <p>
                  ${esc(npc.description)}
                </p>

                <button
                  data-npc3d="${esc(npc.id)}"
                >
                  Abrir 3D
                </button>

                <button
                  data-npcdel="${esc(npc.id)}"
                >
                  Excluir
                </button>

              </article>
            `;

          }).join("")

        : `
          <div class="empty">
            Nenhum NPC criado.
          </div>
        `;

    box
      .querySelectorAll(
        "[data-npc3d]"
      )
      .forEach(button => {

        button.onclick = () => {

          const npc =
            list.find(
              n =>
                n.id ===
                button.dataset.npc3d
            );

          if (npc) {
            open3D(npc);
          }
        };
      });

    box
      .querySelectorAll(
        "[data-npcdel]"
      )
      .forEach(button => {

        button.onclick = async () => {
          button.disabled = true;
          try { await removeNPC(button.dataset.npcdel); }
          finally { button.disabled = false; }
        };
      });
  }

  // ============================================================
  // ANIMAÇÕES
  // ============================================================

  function activatePower(npc) {

    if (
      !three.scene ||
      !window.THREE
    ) {
      return;
    }

    const THREE =
      window.THREE;

    const color =
      new THREE.Color(
        colorFor(npc)
      );

    const burst =
      new THREE.Mesh(
        new THREE.SphereGeometry(
          .5,
          24,
          16
        ),
        new THREE.MeshBasicMaterial({
          color,
          transparent: true,
          opacity: .75
        })
      );

    burst.position.set(
      0,
      1.7,
      .5
    );

    three.scene.add(burst);

    let t = 0;

    const tick = () => {

      t += .05;

      burst.scale.setScalar(
        1 + t * 7
      );

      burst.material.opacity =
        Math.max(
          0,
          .75 - t
        );

      if (t < .75) {

        requestAnimationFrame(
          tick
        );

      } else {

        three.scene.remove(
          burst
        );

        burst.geometry.dispose();

        burst.material.dispose();
      }
    };

    tick();

    npcToast(
      `${npc.name} ativou: ${
        npc.powers?.[0]?.name ||
        "poder"
      }`
    );
  }

  function attackAnimation(npc) {

    if (
      !three.group ||
      !window.THREE
    ) {
      return;
    }

    const start =
      three.group.rotation.y;

    let t = 0;

    const tick = () => {

      t += .12;

      three.group.rotation.y =
        start +
        Math.sin(t * 8) * .35;

      three.group.position.z =
        Math.sin(
          t * Math.PI
        ) * .5;

      if (t < Math.PI) {

        requestAnimationFrame(
          tick
        );

      } else {

        three.group.rotation.y =
          start;

        three.group.position.z =
          0;
      }
    };

    tick();

    npcToast(
      `${npc.name} executou um ataque!`
    );
  }

  // ============================================================
  // PERSONAGEM 3D
  // ============================================================

  function mat(
    THREE,
    color,
    metal = .2,
    rough = .55,
    emissive = 0
  ) {
    return new THREE.MeshStandardMaterial({
      color,
      metalness: metal,
      roughness: rough,
      emissive: color,
      emissiveIntensity: emissive
    });
  }

  function buildHumanoid(
    npc,
    THREE,
    color
  ) {

    const g =
      new THREE.Group();

    const skin =
      mat(
        THREE,
        0xc88d72,
        0,
        .75
      );

    const cloth =
      mat(
        THREE,
        color.getHex(),
        .25,
        .48
      );

    const dark =
      mat(
        THREE,
        0x151823,
        .55,
        .35
      );

    const metal =
      mat(
        THREE,
        0xadb7ca,
        .85,
        .25
      );

    const part = (
      geometry,
      material,
      x,
      y,
      z
    ) => {

      const mesh =
        new THREE.Mesh(
          geometry,
          material
        );

      mesh.position.set(
        x,
        y,
        z
      );

      mesh.castShadow =
        true;

      g.add(mesh);

      return mesh;
    };

    part(
      new THREE.CylinderGeometry(
        .35,
        .45,
        1.25,
        24
      ),
      cloth,
      0,
      1.75,
      0
    );

    part(
      new THREE.SphereGeometry(
        .34,
        24,
        18
      ),
      skin,
      0,
      2.62,
      0
    );

    part(
      new THREE.CylinderGeometry(
        .13,
        .17,
        1.05,
        16
      ),
      cloth,
      -.52,
      1.75,
      0
    );

    part(
      new THREE.CylinderGeometry(
        .13,
        .17,
        1.05,
        16
      ),
      cloth,
      .52,
      1.75,
      0
    );

    part(
      new THREE.CylinderGeometry(
        .17,
        .22,
        1.15,
        16
      ),
      dark,
      -.20,
      .65,
      0
    );

    part(
      new THREE.CylinderGeometry(
        .17,
        .22,
        1.15,
        16
      ),
      dark,
      .20,
      .65,
      0
    );

    part(
      new THREE.BoxGeometry(
        .32,
        .18,
        .58
      ),
      metal,
      -.20,
      .05,
      .08
    );

    part(
      new THREE.BoxGeometry(
        .32,
        .18,
        .58
      ),
      metal,
      .20,
      .05,
      .08
    );

    const eyeMat =
      mat(
        THREE,
        0xffffff,
        0,
        .2,
        2
      );

    part(
      new THREE.SphereGeometry(
        .035,
        10,
        8
      ),
      eyeMat,
      -.115,
      2.67,
      .31
    );

    part(
      new THREE.SphereGeometry(
        .035,
        10,
        8
      ),
      eyeMat,
      .115,
      2.67,
      .31
    );

    const auraGeo =
      new THREE.IcosahedronGeometry(
        1.25,
        2
      );

    three.aura =
      new THREE.Mesh(
        auraGeo,
        new THREE.MeshBasicMaterial({
          color,
          wireframe: true,
          transparent: true,
          opacity: .12
        })
      );

    three.aura.position.y =
      1.55;

    g.add(
      three.aura
    );

    return g;
  }

  // ============================================================
  // CENA
  // ============================================================

  function buildEnvironment(
    npc,
    THREE,
    color
  ) {

    const u =
      getUniverse(npc);

    const platform =
      new THREE.Mesh(
        new THREE.CylinderGeometry(
          3.2,
          3.5,
          .25,
          64
        ),
        mat(
          THREE,
          0x171d30,
          .4,
          .65
        )
      );

    platform.position.y =
      -.14;

    three.scene.add(
      platform
    );

    const portal =
      new THREE.Mesh(
        new THREE.TorusGeometry(
          1.45,
          .07,
          16,
          80
        ),
        new THREE.MeshBasicMaterial({
          color:
            new THREE.Color(
              u.color ||
              "#8b5cf6"
            ),
          transparent: true,
          opacity: .8
        })
      );

    portal.position.set(
      0,
      2.2,
      -2.4
    );

    three.scene.add(
      portal
    );
  }

  function buildArtifacts(
    npc,
    THREE,
    color
  ) {

    if (!npc.artifacts.length) {
      return;
    }

    npc.artifacts
      .slice(0, 4)
      .forEach((name, i) => {

        const orb =
          new THREE.Mesh(
            new THREE.OctahedronGeometry(
              .16
            ),
            new THREE.MeshStandardMaterial({
              color,
              emissive: color,
              emissiveIntensity: 1.5,
              metalness: .6,
              roughness: .2
            })
          );

        const angle =
          i /
          Math.max(
            1,
            npc.artifacts.length
          ) *
          Math.PI *
          2;

        orb.position.set(
          Math.cos(angle) * 1.45,
          1.1 +
            Math.sin(i) * .5,
          Math.sin(angle) * 1.45
        );

        three.scene.add(
          orb
        );
      });
  }

  function disposeSceneResources() {
    if (three.animation) cancelAnimationFrame(three.animation);
    three.animation = null;
    if (three.scene) {
      three.scene.traverse(object => {
        if (object.geometry) object.geometry.dispose();
        if (object.material) {
          const materials = Array.isArray(object.material) ? object.material : [object.material];
          materials.forEach(material => { if (material.map) material.map.dispose(); material.dispose(); });
        }
      });
    }
    if (three.renderer) { three.renderer.dispose(); three.renderer.forceContextLoss?.(); }
    three.renderer = null; three.controls = null; three.scene = null; three.group = null; three.aura = null;
  }

  function buildScene(npc) {

    if (!window.THREE) {
      return;
    }

    const THREE =
      window.THREE;

    const host =
      document.getElementById(
        "npc3DCanvas"
      );

    if (!host) {
      return;
    }

    disposeSceneResources();
    host.innerHTML = "";

    three.scene =
      new THREE.Scene();

    three.scene.background =
      new THREE.Color(
        0x070a14
      );

    const w =
      host.clientWidth || 800;

    const h =
      host.clientHeight || 600;

    three.camera =
      new THREE.PerspectiveCamera(
        42,
        w / h,
        .1,
        100
      );

    three.camera.position.set(
      4.6,
      2.7,
      7
    );

    three.renderer =
      new THREE.WebGLRenderer({
        antialias: true
      });

    three.renderer.setPixelRatio(
      Math.min(
        window.devicePixelRatio || 1,
        2
      )
    );

    three.renderer.setSize(
      w,
      h
    );

    three.renderer.shadowMap.enabled =
      true;

    host.appendChild(
      three.renderer.domElement
    );

    if (
      THREE.OrbitControls
    ) {

      three.controls =
        new THREE.OrbitControls(
          three.camera,
          three.renderer.domElement
        );

      three.controls.enableDamping =
        true;

      three.controls.target.set(
        0,
        1.4,
        0
      );

      three.controls.minDistance =
        3.2;

      three.controls.maxDistance =
        11;
    }

    const color =
      new THREE.Color(
        colorFor(npc)
      );

    three.scene.add(
      new THREE.HemisphereLight(
        0xaac8ff,
        0x11121a,
        2
      )
    );

    const key =
      new THREE.DirectionalLight(
        color,
        4
      );

    key.position.set(
      4,
      7,
      5
    );

    three.scene.add(key);

    const floor =
      new THREE.Mesh(
        new THREE.CircleGeometry(
          5,
          64
        ),
        new THREE.MeshStandardMaterial({
          color: 0x10172b,
          roughness: .9,
          metalness: .15
        })
      );

    floor.rotation.x =
      -Math.PI / 2;

    three.scene.add(
      floor
    );

    three.group =
      buildHumanoid(
        npc,
        THREE,
        color
      );

    three.scene.add(
      three.group
    );

    buildEnvironment(
      npc,
      THREE,
      color
    );

    buildArtifacts(
      npc,
      THREE,
      color
    );

    three.clock =
      new THREE.Clock();

    const animate = () => {

      three.animation =
        requestAnimationFrame(
          animate
        );

      const t =
        three.clock.getElapsedTime();

      if (three.controls) {
        three.controls.update();
      }

      if (three.group) {

        three.group.position.y =
          Math.sin(t * 1.7) * .035;

        three.group.rotation.y +=
          .002;
      }

      if (three.aura) {

        three.aura.rotation.y -=
          .006;

        three.aura.scale.setScalar(
          1 +
          Math.sin(t * 3) * .035
        );
      }

      three.renderer.render(
        three.scene,
        three.camera
      );
    };

    animate();
  }

  // ============================================================
  // API
  // ============================================================

  window.NPC_SYSTEM = {

    create: createNPC,

    remove: removeNPC,

    list: getNPCs,

    open3D,

    openEditor:
      openNPCForm,

    render:
      renderNPCList,

    normalize:
      normalizeNPC
  };

  window.openNPC3D =
    open3D;

  window.openSceneForMapObject =
    function (object) {

      if (object?.npcId) {
        const npc = getNPCs().find(n => n.id === object.npcId);
        if (npc) return open3D(npc);
      }

      if (
        typeof window.openScene ===
        "function"
      ) {
        return window.openScene(
          object
        );
      }

      if (object) {
        open3D(object);
      }
    };

  // ============================================================
  // INICIALIZAÇÃO
  // ============================================================

  function initNPCUI() {

      if (
        !document.getElementById(
          "npcList"
        ) &&
        document.getElementById(
          "characters"
        )
      ) {

        const section =
          document.createElement(
            "section"
          );

        section.className =
          "panel";

        section.style.marginTop =
          "20px";

        section.innerHTML = `
          <div class="panel-title">

            <h2>
              NPCs do Nexus
            </h2>

            <button
              class="secondary"
              id="createNPCBtn"
            >
              ＋ Criar NPC 3D
            </button>

          </div>

          <div
            id="npcList"
            class="character-list"
          ></div>
        `;

        document
          .getElementById(
            "characters"
          )
          .appendChild(
            section
          );

        document
          .getElementById(
            "createNPCBtn"
          )
          .onclick =
          openNPCForm;
      }

      renderNPCList();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initNPCUI, { once: true });
  else initNPCUI();

})();