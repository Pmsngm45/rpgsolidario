/* ============================================================
   RPG NEXUS — MAPA MULTIVERSAL
   Versão segura
   - Não quebra se data.js atrasar
   - Usa window.UNIVERSES / window.CITIES / window.BIOMES
   - Clique na cidade abre cenário 3D
   - Marcadores continuam funcionando
============================================================ */

(function () {

    "use strict";

    let canvas = null;
    let ctx = null;
    let initialized = false;

    const mapState = {

        zoom: 1,

        offsetX: 0,
        offsetY: 0,

        drag: false,
        moved: 0,

        lastX: 0,
        lastY: 0,

        fitted: false,

        hovered: null

    };


    /* ========================================================
       DADOS SEGUROS
    ======================================================== */

    function getUniverses() {

        if (
            typeof window.UNIVERSES !== "undefined" &&
            window.UNIVERSES &&
            typeof window.UNIVERSES === "object"
        ) {

            return window.UNIVERSES;

        }

        return {};

    }


    function getCities() {

        if (
            Array.isArray(window.CITIES)
        ) {

            return window.CITIES;

        }

        return [];

    }


    function getBiomes() {

        if (
            typeof window.BIOMES !== "undefined" &&
            window.BIOMES &&
            typeof window.BIOMES === "object"
        ) {

            return window.BIOMES;

        }

        return {};

    }


    /* ========================================================
       STORAGE SEGURO
    ======================================================== */

    function storeGet(key, fallback = []) {

        try {

            if (
                typeof window.getStore === "function" &&
                window.getStore !== storeGet
            ) {

                const value =
                    window.getStore(
                        key,
                        fallback
                    );

                return Array.isArray(value)
                    ? value
                    : fallback;

            }

        } catch (error) {

            console.warn(
                "RPG Nexus: getStore falhou:",
                error
            );

        }


        try {

            const raw =
                localStorage.getItem(key);

            if (!raw) {
                return fallback;
            }

            const parsed =
                JSON.parse(raw);

            return Array.isArray(parsed)
                ? parsed
                : fallback;

        } catch {

            return fallback;

        }

    }


    function storeSet(key, value) {

        try {

            if (
                typeof window.setStore === "function"
            ) {

                window.setStore(
                    key,
                    value
                );

                return;

            }

        } catch (error) {

            console.warn(
                "RPG Nexus: setStore falhou:",
                error
            );

        }


        try {

            localStorage.setItem(
                key,
                JSON.stringify(value)
            );

        } catch (error) {

            console.error(
                "RPG Nexus: não foi possível salvar:",
                error
            );

        }

    }


    function generateId() {

        if (
            typeof window.uid === "function"
        ) {

            return window.uid();

        }

        return (
            Date.now().toString(36) +
            Math.random()
                .toString(36)
                .slice(2)
        );

    }


    function safeEscape(value) {

        if (
            typeof window.escapeHTML === "function"
        ) {

            return window.escapeHTML(
                String(value ?? "")
            );

        }

        return String(value ?? "")
            .replaceAll("&", "&amp;")
            .replaceAll("<", "&lt;")
            .replaceAll(">", "&gt;")
            .replaceAll('"', "&quot;")
            .replaceAll("'", "&#039;");

    }


    function activity(text) {

        if (
            typeof window.saveActivity === "function"
        ) {

            window.saveActivity(text);

        }

    }


    /* ========================================================
       INICIALIZAÇÃO
    ======================================================== */

    function initMap() {

        canvas =
            document.getElementById(
                "worldMap"
            );

        if (!canvas) {

            console.warn(
                "RPG Nexus: canvas #worldMap não encontrado."
            );

            return;

        }


        ctx =
            canvas.getContext("2d");

        if (!ctx) {

            console.error(
                "RPG Nexus: não foi possível criar contexto 2D."
            );

            return;

        }


        if (initialized) {

            resizeMap();

            return;

        }


        initialized = true;


        resizeMap();


        /* ====================================================
           CLIQUE
        ==================================================== */

        canvas.addEventListener(
            "click",
            mapClick
        );


        /* ====================================================
           ZOOM
        ==================================================== */

        canvas.addEventListener(
            "wheel",
            function (event) {

                event.preventDefault();


                const rect =
                    canvas.getBoundingClientRect();


                const mouseX =
                    event.clientX -
                    rect.left;


                const mouseY =
                    event.clientY -
                    rect.top;


                const oldZoom =
                    mapState.zoom;


                const newZoom =
                    Math.max(
                        0.25,
                        Math.min(
                            2.5,
                            oldZoom *
                            (
                                event.deltaY < 0
                                    ? 1.12
                                    : 0.89
                            )
                        )
                    );


                const factor =
                    newZoom / oldZoom;


                mapState.offsetX =
                    mouseX -
                    (
                        mouseX -
                        mapState.offsetX
                    ) *
                    factor;


                mapState.offsetY =
                    mouseY -
                    (
                        mouseY -
                        mapState.offsetY
                    ) *
                    factor;


                mapState.zoom =
                    newZoom;


                drawMap();

            },
            {
                passive: false
            }
        );


        /* ====================================================
           ARRASTAR
        ==================================================== */

        canvas.addEventListener(
            "mousedown",
            function (event) {

                mapState.drag = true;

                mapState.moved = 0;

                mapState.lastX =
                    event.clientX;

                mapState.lastY =
                    event.clientY;

                canvas.style.cursor =
                    "grabbing";

            }
        );


        window.addEventListener(
            "mouseup",
            function () {

                mapState.drag = false;

                if (canvas) {

                    canvas.style.cursor =
                        "crosshair";

                }

            }
        );


        window.addEventListener(
            "mousemove",
            function (event) {

                if (!canvas) {
                    return;
                }


                if (mapState.drag) {

                    const dx =
                        event.clientX -
                        mapState.lastX;


                    const dy =
                        event.clientY -
                        mapState.lastY;


                    mapState.moved +=
                        Math.abs(dx) +
                        Math.abs(dy);


                    mapState.offsetX += dx;
                    mapState.offsetY += dy;


                    mapState.lastX =
                        event.clientX;

                    mapState.lastY =
                        event.clientY;


                    drawMap();

                    return;

                }


                const point =
                    worldPoint(event);


                const city =
                    cityAt(point);


                mapState.hovered =
                    city || null;


                canvas.style.cursor =
                    city
                        ? "pointer"
                        : "crosshair";


                drawMap();

            }
        );


        /* ====================================================
           LIMPAR MARCADORES
        ==================================================== */

        const clearMarkers =
            document.getElementById(
                "clearMarkers"
            );


        if (clearMarkers) {

            clearMarkers.onclick =
                function () {

                    storeSet(
                        "rpg_markers",
                        []
                    );


                    renderMapUI();


                    if (
                        typeof window.toast ===
                        "function"
                    ) {

                        window.toast(
                            "Encontros removidos."
                        );

                    }

                };

        }


        /* ====================================================
           CENTRALIZAR
        ==================================================== */

        const centerMap =
            document.getElementById(
                "centerMap"
            );


        if (centerMap) {

            centerMap.onclick =
                function () {

                    mapState.fitted = false;

                    fitMap();

                };

        }


        window.addEventListener(
            "resize",
            resizeMap
        );


        drawMap();

    }


    /* ========================================================
       REDIMENSIONAR
    ======================================================== */

    function resizeMap() {

        if (!canvas || !ctx) {
            return;
        }


        const parent =
            canvas.parentElement;


        if (!parent) {
            return;
        }


        const rect =
            parent.getBoundingClientRect();


        const width =
            Math.max(
                600,
                rect.width || 600
            );


        const height =
            Math.max(
                430,
                rect.height || 430
            );


        const dpr =
            window.devicePixelRatio || 1;


        canvas.width =
            width * dpr;


        canvas.height =
            height * dpr;


        canvas.style.width =
            width + "px";


        canvas.style.height =
            height + "px";


        const cities =
            getCities();


        if (
            !mapState.fitted &&
            cities.length
        ) {

            mapState.fitted = true;

            fitMap();

            return;

        }


        drawMap();

    }


    /* ========================================================
       TELA → MUNDO
    ======================================================== */

    function worldPoint(event) {

        const rect =
            canvas.getBoundingClientRect();


        return {

            x:
                (
                    event.clientX -
                    rect.left -
                    mapState.offsetX
                ) /
                mapState.zoom,

            y:
                (
                    event.clientY -
                    rect.top -
                    mapState.offsetY
                ) /
                mapState.zoom

        };

    }


    /* ========================================================
       MUNDO → TELA
    ======================================================== */

    function screenPoint(x, y) {

        return {

            x:
                x *
                mapState.zoom +
                mapState.offsetX,

            y:
                y *
                mapState.zoom +
                mapState.offsetY

        };

    }


    /* ========================================================
       CLIQUE
    ======================================================== */

    function mapClick(event) {

        if (
            mapState.moved > 6
        ) {

            mapState.moved = 0;

            return;

        }


        mapState.moved = 0;


        const point =
            worldPoint(event);


        const city =
            cityAt(point);


        /* ====================================================
           CIDADE → CENÁRIO 3D
        ==================================================== */

        if (city) {

            openScene(city);

            return;

        }


        /* ====================================================
           MARCADOR
        ==================================================== */

        const chars =
            storeGet(
                "rpg_characters",
                []
            );


        if (!chars.length) {

            if (
                typeof window.toast ===
                "function"
            ) {

                window.toast(
                    "Crie um personagem antes de marcar o mapa."
                );

            }

            return;

        }


        const characterSelect =
            document.getElementById(
                "markerCharacter"
            );


        const typeSelect =
            document.getElementById(
                "markerType"
            );


        const characterId =
            characterSelect?.value ||
            chars[0].id;


        const type =
            typeSelect?.value ||
            "location";


        const markers =
            storeGet(
                "rpg_markers",
                []
            );


        markers.push({

            id: generateId(),

            x: point.x,
            y: point.y,

            char: characterId,

            type,

            created: Date.now()

        });


        storeSet(
            "rpg_markers",
            markers
        );


        const character =
            chars.find(
                c =>
                    c.id === characterId
            );


        activity(
            `Encontro registrado no mapa: ${
                character?.name ||
                "personagem"
            }.`
        );


        renderMapUI();

    }


    /* ========================================================
       LOCALIZAR CIDADE
    ======================================================== */

    function cityAt(point) {

        const cities =
            getCities();


        if (!cities.length) {
            return null;
        }


        return cities.find(
            city => {

                const rx =
                    Number(city.w) / 2;


                const ry =
                    Number(city.h) / 2;


                if (
                    !rx ||
                    !ry
                ) {

                    return false;

                }


                const dx =
                    (
                        point.x -
                        Number(city.x)
                    ) /
                    rx;


                const dy =
                    (
                        point.y -
                        Number(city.y)
                    ) /
                    ry;


                return (
                    dx * dx +
                    dy * dy
                ) <= 1;

            }
        ) || null;

    }


    /* ========================================================
       DESENHAR MAPA
    ======================================================== */

    function drawMap() {

        if (!canvas || !ctx) {
            return;
        }


        const dpr =
            window.devicePixelRatio || 1;


        const width =
            canvas.width / dpr;


        const height =
            canvas.height / dpr;


        ctx.setTransform(
            1,
            0,
            0,
            1,
            0,
            0
        );


        ctx.clearRect(
            0,
            0,
            canvas.width,
            canvas.height
        );


        ctx.setTransform(
            dpr,
            0,
            0,
            dpr,
            0,
            0
        );


        ctx.save();


        ctx.translate(
            mapState.offsetX,
            mapState.offsetY
        );


        ctx.scale(
            mapState.zoom,
            mapState.zoom
        );


        /* ====================================================
           FUNDO
        ==================================================== */

        ctx.fillStyle =
            "#0b101b";


        ctx.fillRect(
            -5000,
            -5000,
            10000,
            10000
        );


        drawGrid();


        const cities =
            getCities();


        cities.forEach(
            drawCity
        );


        drawMarkers();


        ctx.restore();


        drawMapOverlay(
            width,
            height
        );

    }


    /* ========================================================
       GRADE
    ======================================================== */

    function drawGrid() {

        const step = 80;


        ctx.lineWidth =
            1 /
            mapState.zoom;


        ctx.strokeStyle =
            "rgba(120,150,190,.08)";


        for (
            let x = -3000;
            x <= 3000;
            x += step
        ) {

            ctx.beginPath();

            ctx.moveTo(
                x,
                -3000
            );

            ctx.lineTo(
                x,
                3000
            );

            ctx.stroke();

        }


        for (
            let y = -3000;
            y <= 3000;
            y += step
        ) {

            ctx.beginPath();

            ctx.moveTo(
                -3000,
                y
            );

            ctx.lineTo(
                3000,
                y
            );

            ctx.stroke();

        }

    }


    /* ========================================================
       CIDADE
    ======================================================== */

    function drawCity(city) {

        const universes =
            getUniverses();


        const biomes =
            getBiomes();


        const universe =
            universes[
                city.universe
            ];


        const biome =
            biomes[
                city.type
            ];


        const hovered =
            mapState.hovered?.id ===
            city.id;


        const color =
            city.color ||
            universe?.color ||
            "#39495f";


        const x =
            Number(city.x) || 0;


        const y =
            Number(city.y) || 0;


        const w =
            Number(city.w) || 120;


        const h =
            Number(city.h) || 80;


        /* ====================================================
           ÁREA
        ==================================================== */

        ctx.beginPath();


        ctx.ellipse(
            x,
            y,
            w / 2,
            h / 2,
            0,
            0,
            Math.PI * 2
        );


        ctx.fillStyle =
            hovered
                ? lightenColor(
                    color,
                    18
                )
                : color;


        ctx.fill();


        /* ====================================================
           BORDA
        ==================================================== */

        ctx.lineWidth =
            (
                hovered
                    ? 4
                    : 2
            ) /
            mapState.zoom;


        ctx.strokeStyle =
            universe?.color ||
            "#8191a5";


        ctx.stroke();


        /* ====================================================
           BRILHO
        ==================================================== */

        if (hovered) {

            ctx.beginPath();


            ctx.ellipse(
                x,
                y,
                w / 2 + 8,
                h / 2 + 8,
                0,
                0,
                Math.PI * 2
            );


            ctx.strokeStyle =
                universe?.color ||
                "#ffffff";


            ctx.globalAlpha =
                .45;


            ctx.stroke();


            ctx.globalAlpha =
                1;

        }


        /* ====================================================
           ÍCONE
        ==================================================== */

        const icon =
            universe?.icon ||
            "◆";


        const fontSize =
            Math.max(
                15,
                25 /
                mapState.zoom
            );


        ctx.textAlign =
            "center";


        ctx.textBaseline =
            "middle";


        ctx.font =
            `${fontSize}px sans-serif`;


        ctx.fillStyle =
            universe?.color ||
            "#ffffff";


        ctx.fillText(
            icon,
            x,
            y - 22
        );


        /* ====================================================
           NOME
        ==================================================== */

        const nameSize =
            Math.max(
                11,
                14 /
                mapState.zoom
            );


        ctx.font =
            `bold ${nameSize}px Arial`;


        ctx.fillStyle =
            "#edf3fa";


        ctx.fillText(
            city.name ||
            "Cidade",
            x,
            y + 5
        );


        /* ====================================================
           UNIVERSO + BIOMA
        ==================================================== */

        ctx.font =
            `${Math.max(
                9,
                10 /
                mapState.zoom
            )}px Arial`;


        ctx.fillStyle =
            "#aebdcd";


        const universeName =
            universe?.name ||
            "Nexus";


        const biomeName =
            biome?.label ||
            city.type ||
            "Região";


        ctx.fillText(
            `${universeName} · ${biomeName}`,
            x,
            y + 22
        );

    }


    /* ========================================================
       MARCADORES
    ======================================================== */

    function drawMarkers() {

        const markers =
            storeGet(
                "rpg_markers",
                []
            );


        const chars =
            storeGet(
                "rpg_characters",
                []
            );


        const universes =
            getUniverses();


        markers.forEach(
            marker => {

                const character =
                    chars.find(
                        c =>
                            c.id ===
                            marker.char
                    );


                const universe =
                    character
                        ? universes[
                            character.universe
                        ]
                        : universes.dragonball;


                const color =
                    universe?.color ||
                    "#ffffff";


                const pulse =
                    1 +
                    Math.sin(
                        Date.now() /
                        250
                    ) *
                    .15;


                ctx.beginPath();


                ctx.arc(
                    marker.x,
                    marker.y,
                    10 * pulse,
                    0,
                    Math.PI * 2
                );


                ctx.fillStyle =
                    color;


                ctx.fill();


                ctx.lineWidth =
                    2 /
                    mapState.zoom;


                ctx.strokeStyle =
                    "#ffffff";


                ctx.stroke();


                ctx.font =
                    `${11 /
                    mapState.zoom}px Arial`;


                ctx.textAlign =
                    "center";


                ctx.textBaseline =
                    "alphabetic";


                ctx.fillStyle =
                    "#ffffff";


                ctx.fillText(
                    (
                        character?.name ||
                        "?"
                    ).slice(
                        0,
                        14
                    ),
                    marker.x,
                    marker.y - 16
                );

            }
        );


        if (markers.length) {

            requestAnimationFrame(
                function () {

                    if (canvas) {
                        drawMap();
                    }

                }
            );

        }

    }


    /* ========================================================
       OVERLAY
    ======================================================== */

    function drawMapOverlay(
        width,
        height
    ) {

        ctx.save();


        const dpr =
            window.devicePixelRatio ||
            1;


        ctx.setTransform(
            dpr,
            0,
            0,
            dpr,
            0,
            0
        );


        ctx.fillStyle =
            "rgba(5,9,16,.72)";


        ctx.fillRect(
            14,
            14,
            145,
            34
        );


        ctx.fillStyle =
            "#dbe7f2";


        ctx.font =
            "12px Arial";


        ctx.textAlign =
            "left";


        ctx.fillText(
            `Zoom: ${Math.round(
                mapState.zoom *
                100
            )}%`,
            25,
            35
        );


        ctx.restore();

    }


    /* ========================================================
       COR
    ======================================================== */

    function lightenColor(
        hex,
        amount
    ) {

        if (
            typeof hex !== "string"
        ) {

            return "#39495f";

        }


        let value =
            hex.replace(
                "#",
                ""
            );


        if (
            value.length !== 6
        ) {

            return hex;

        }


        let r =
            parseInt(
                value.substring(
                    0,
                    2
                ),
                16
            );


        let g =
            parseInt(
                value.substring(
                    2,
                    4
                ),
                16
            );


        let b =
            parseInt(
                value.substring(
                    4,
                    6
                ),
                16
            );


        if (
            Number.isNaN(r) ||
            Number.isNaN(g) ||
            Number.isNaN(b)
        ) {

            return hex;

        }


        r =
            Math.min(
                255,
                r + amount
            );


        g =
            Math.min(
                255,
                g + amount
            );


        b =
            Math.min(
                255,
                b + amount
            );


        return (
            "#" +
            [r, g, b]
                .map(
                    n =>
                        n
                            .toString(16)
                            .padStart(
                                2,
                                "0"
                            )
                )
                .join("")
        );

    }


    /* ========================================================
       INTERFACE
    ======================================================== */

    function renderMapUI() {

        if (!canvas) {

            initMap();

        }


        const chars =
            storeGet(
                "rpg_characters",
                []
            );


        const markers =
            storeGet(
                "rpg_markers",
                []
            );


        const universes =
            getUniverses();


        const characterSelect =
            document.getElementById(
                "markerCharacter"
            );


        if (characterSelect) {

            if (chars.length) {

                characterSelect.innerHTML =
                    chars.map(
                        character => {

                            const universe =
                                universes[
                                    character.universe
                                ];


                            return `
                                <option value="${safeEscape(character.id)}">
                                    ${safeEscape(character.name)}
                                    ·
                                    ${safeEscape(
                                        universe?.name ||
                                        "Nexus"
                                    )}
                                </option>
                            `;

                        }
                    ).join("");

            } else {

                characterSelect.innerHTML =
                    `
                    <option value="">
                        Crie um personagem
                    </option>
                    `;

            }

        }


        const count =
            document.getElementById(
                "markerCount"
            );


        if (count) {

            count.textContent =
                markers.length;

        }


        const list =
            document.getElementById(
                "markerList"
            );


        if (list) {

            list.innerHTML =
                markers.map(
                    marker => {

                        const character =
                            chars.find(
                                c =>
                                    c.id ===
                                    marker.char
                            );


                        const universe =
                            character
                                ? universes[
                                    character.universe
                                ]
                                : universes.dragonball;


                        return `
                            <div class="marker-item">

                                <span
                                    style="
                                        background:
                                        ${universe?.color || "#fff"}
                                    "
                                ></span>

                                <div>

                                    <b>
                                        ${safeEscape(
                                            character?.name ||
                                            "Desconhecido"
                                        )}
                                    </b>

                                    <small>
                                        ${safeEscape(
                                            marker.type ||
                                            "local"
                                        )}
                                        · X
                                        ${Math.round(
                                            marker.x
                                        )}
                                        /
                                        Y
                                        ${Math.round(
                                            marker.y
                                        )}
                                    </small>

                                </div>

                                <button
                                    type="button"
                                    data-remove-marker="${safeEscape(marker.id)}"
                                >
                                    ×
                                </button>

                            </div>
                        `;

                    }
                ).join("") ||

                `
                <div class="empty">
                    Nenhum encontro.
                </div>
                `;

        }


        drawMap();

    }


    /* ========================================================
       REMOVER MARCADOR
    ======================================================== */

    function removeMarker(id) {

        const markers =
            storeGet(
                "rpg_markers",
                []
            );


        storeSet(
            "rpg_markers",
            markers.filter(
                marker =>
                    marker.id !== id
            )
        );


        renderMapUI();

    }


    /* ========================================================
       EVENTO DOS MARCADORES
    ======================================================== */

    document.addEventListener(
        "click",
        function (event) {

            const button =
                event.target.closest(
                    "[data-remove-marker]"
                );


            if (!button) {
                return;
            }


            removeMarker(
                button.dataset.removeMarker
            );

        }
    );


    /* ========================================================
       CENTRALIZAR
    ======================================================== */

    function fitMap() {

        const cities =
            getCities();


        if (
            !canvas ||
            !cities.length
        ) {

            return;

        }


        const rect =
            canvas.getBoundingClientRect();


        if (
            !rect.width ||
            !rect.height
        ) {

            return;

        }


        let minX =
            Infinity;


        let minY =
            Infinity;


        let maxX =
            -Infinity;


        let maxY =
            -Infinity;


        cities.forEach(
            city => {

                const x =
                    Number(city.x) || 0;


                const y =
                    Number(city.y) || 0;


                const w =
                    Number(city.w) || 120;


                const h =
                    Number(city.h) || 80;


                minX =
                    Math.min(
                        minX,
                        x - w / 2
                    );


                maxX =
                    Math.max(
                        maxX,
                        x + w / 2
                    );


                minY =
                    Math.min(
                        minY,
                        y - h / 2
                    );


                maxY =
                    Math.max(
                        maxY,
                        y + h / 2
                    );

            }
        );


        const mapWidth =
            maxX - minX;


        const mapHeight =
            maxY - minY;


        const padding = 100;


        const zoomX =
            rect.width /
            (
                mapWidth +
                padding
            );


        const zoomY =
            rect.height /
            (
                mapHeight +
                padding
            );


        mapState.zoom =
            Math.min(
                zoomX,
                zoomY,
                1.2
            );


        mapState.offsetX =
            rect.width / 2 -
            mapState.zoom *
            (
                minX +
                maxX
            ) / 2;


        mapState.offsetY =
            rect.height / 2 -
            mapState.zoom *
            (
                minY +
                maxY
            ) / 2;


        drawMap();

    }


    /* ========================================================
       CENÁRIO 3D
    ======================================================== */

    function openScene(city) {

        console.log(
            "RPG Nexus: abrindo cenário 3D:",
            city.name
        );


        if (
            typeof window.openScene3D ===
            "function"
        ) {

            window.openScene3D(city);

            return;

        }


        if (
            typeof window.open3DScene ===
            "function"
        ) {

            window.open3DScene(city);

            return;

        }


        if (
            typeof window.toast ===
            "function"
        ) {

            window.toast(
                `${city.name} selecionada — cenário 3D ainda não carregado.`
            );

        }

    }


    /* ========================================================
       AGUARDAR DATA.JS
    ======================================================== */

    function waitForData() {

        const universes =
            getUniverses();


        const cities =
            getCities();


        if (
            Object.keys(universes).length &&
            cities.length
        ) {

            console.log(
                "RPG Nexus: dados do mapa carregados.",
                {
                    universos:
                        Object.keys(universes).length,

                    cidades:
                        cities.length
                }
            );


            initMap();

            renderMapUI();

            return;

        }


        console.warn(
            "RPG Nexus: aguardando data.js..."
        );


        setTimeout(
            waitForData,
            250
        );

    }


    /* ========================================================
       API GLOBAL
    ======================================================== */

    window.initMap =
        initMap;


    window.resizeMap =
        resizeMap;


    window.renderMapUI =
        renderMapUI;


    window.fitMap =
        fitMap;


    window.openScene =
        openScene;


    window.removeMarker =
        removeMarker;


    /* ========================================================
       LOAD
    ======================================================== */

    window.addEventListener(
        "load",
        function () {

            waitForData();

        }
    );

})();