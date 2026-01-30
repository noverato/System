/**
 * 🏟️ arena.js – The Nest: Overlord Edition 2026
 * Rolle: Arena-UI & Kampf-Auswahl
 * Verantwortlich NUR für UI + Trigger
 */

const Arena = (function () {
    'use strict';

    let isOpen = false;

    /* ==============================
       🔓 ÖFFNEN / SCHLIESSEN
    ============================== */

    function open() {
        if (isOpen) return;
        isOpen = true;

        if (typeof toggleModal === 'function') {
            toggleModal('gameModal', true);
        }

        renderMenu();
    }

    function close() {
        isOpen = false;

        if (typeof toggleModal === 'function') {
            toggleModal('gameModal', false);
        }
    }

    /* ==============================
       🎨 UI RENDERING
    ============================== */

    function renderMenu() {
        const left = document.getElementById('modalLeft');
        if (!left) return;

        left.style.backgroundImage = "url('./arena_innen.png')";
        left.style.backgroundSize = "cover";

        left.innerHTML = `
            <div style="
                height:100%;
                display:flex;
                flex-direction:column;
                justify-content:center;
                align-items:center;
                gap:25px;
                text-align:center;
            ">
                <h1 style="color:gold; text-shadow:0 0 10px #000;">
                    🏟️ Die Arena
                </h1>

                <div style="display:flex; gap:25px;">
                    <button class="btn-action"
                        onclick="Arena.startMonsterFight()"
                        style="min-width:200px;">
                        ⚔️ Monsterkampf
                    </button>

                    <button class="btn-action"
                        disabled
                        style="min-width:200px; opacity:0.4;">
                        🧑‍🤝‍🧑 PvP Arena
                    </button>
                </div>

                <button class="btn-action"
                    onclick="Arena.startBossEvent()"
                    style="min-width:260px; margin-top:10px;">
                    👑 Boss-Event
                </button>

                <button class="btn-action"
                    onclick="Arena.close()"
                    style="margin-top:20px; background:#444;">
                    ❌ Verlassen
                </button>
            </div>
        `;

        const info = document.getElementById('modalRight');
        if (info) {
            info.innerHTML = `
                <h3 style="color:gold;">ℹ️ Arena-Info</h3>
                <p>Wähle eine Herausforderung.</p>
                <p>Boss-Events sind seltener & gefährlicher.</p>
            `;
        }
    }

    /* ==============================
       ⚔️ KAMPFSTARTER
    ============================== */

    function startMonsterFight() {
        if (!window.isIdentified) {
            alert("❌ Der Hüter schläft. Stream ist offline.");
            return;
        }

        let monster;

        try {
            const lvl = window.data?.stats?.currentLevel || 1;
            monster = MonsterLibrary?.generateArenaBoss
                ? MonsterLibrary.generateArenaBoss(lvl)
                : fallbackMonster(lvl);
        } catch {
            monster = fallbackMonster(1);
        }

        EventHub.emitEncounter(monster);
    }

    function startBossEvent() {
        alert("👑 Boss-Events sind noch versiegelt.\nBereite dich vor.");
    }

    function fallbackMonster(level) {
        return {
            name: "Arena-Schatten",
            hp: 120,
            maxHp: 120,
            atk: 12,
            def: 6,
            spd: 10,
            lvl: level,
            img: "👹",
            lxpReward: 50
        };
    }

    /* ==============================
       🔁 API
    ============================== */

    return {
        open,
        close,
        startMonsterFight,
        startBossEvent
    };

})();

window.Arena = Arena;
