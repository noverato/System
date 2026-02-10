/**
 * 🧠 Rafael System
 * Globaler Story-Observer für THE NEST
 * (lebt unabhängig von Panels & Battle.js)
 */

const RaphaelSystem = (() => {
    'use strict';

    const MAX_ENTRIES = 15;
    const CHECK_INTERVAL = 600;

    /* ==============================
       🧩 CONTAINER-MANAGEMENT
    ============================== */

    function getOrCreateContainer() {
        let box = document.getElementById('raphael-ticker');

        if (box) return box;

        const holder = document.getElementById('hud')
            || document.getElementById('overlordPanel')
            || document.getElementById('playerPanel')
            || document.body;

        if (!holder) return null;

        box = document.createElement('div');
        box.id = 'raphael-ticker';
        box.style.marginTop = '10px';
        box.style.padding = '8px';
        box.style.fontSize = '13px';
        box.style.lineHeight = '1.4';
        box.style.maxHeight = '160px';
        box.style.overflowY = 'auto';
        box.style.background = 'rgba(0,0,0,0.6)';
        box.style.border = '1px solid gold';
        box.style.borderRadius = '6px';
        box.style.color = '#f5f5f5';

        holder.appendChild(box);
        return box;
    }

    function push(html) {
        const container = getOrCreateContainer();
        if (!container) return;
        const div = document.createElement('div');
        div.style.marginBottom = '6px';
        div.innerHTML = html;
        container.prepend(div);

        while (container.children.length > MAX_ENTRIES) {
            container.removeChild(container.lastChild);
        }
    }

    function playerName() {
        return window.data?.name || 'Ein Wanderer';
    }

    /* ==============================
       👁️ SNAPSHOTS
    ============================== */

    let lastBattleActive = false;
    let lastEnemy = null;
    let lastInventory = {};
    let lastEvo = null;

    function clone(obj) {
        return JSON.parse(JSON.stringify(obj));
    }

    /* ==============================
       ⚔️ KAMPF-BEOBACHTUNG
    ============================== */

    function observeBattle() {
        if (!window.BattleEngine) return;

        const active = BattleEngine.active;

        if (!lastBattleActive && active) {
            lastEnemy = BattleEngine.enemy;
            if (lastEnemy?.name) {
                push(`<b>${playerName()}</b> stellt sich <b>${lastEnemy.name}</b>.`);
            }
        }

        if (lastBattleActive && !active && lastEnemy) {
            if (lastEnemy.hp <= 0) {
                push(`<b>${playerName()}</b> hat <b>${lastEnemy.name}</b> besiegt.`);
            } else if (window.data?.hp <= 0) {
                push(`<b>${playerName()}</b> wurde von <b>${lastEnemy.name}</b> bezwungen.`);
            } else {
                push(`<b>${playerName()}</b> entkommt dem Kampf gegen <b>${lastEnemy.name}</b>.`);
            }
            lastEnemy = null;
        }

        lastBattleActive = active;
    }

    /* ==============================
       📡 EVENT-ANBINDUNG (Live-Chronik)
    ============================== */
    if (window.EventHub) {
        EventHub.on(EventHub.EVENTS.ENCOUNTER_START, ({ monster }) => {
            const enemyName = monster?.name || 'ein Wesen';
            push(`<b>${playerName()}</b> stellt sich <b>${enemyName}</b>.`);
        });
        EventHub.on(EventHub.EVENTS.BATTLE_ACTION_START, ({ side }) => {
            const enemyName = window.BattleEngine?.enemy?.name || 'ein Wesen';
            if (side === 'enemy') {
                push(`<b>${enemyName}</b> greift <b>${playerName()}</b> an.`);
            } else {
                push(`<b>${playerName()}</b> greift <b>${enemyName}</b> an.`);
            }
        });
        EventHub.on(EventHub.EVENTS.BATTLE_IMPACT, ({ side }) => {
            const enemyName = window.BattleEngine?.enemy?.name || 'ein Wesen';
            if (side === 'enemy') {
                push(`💥 <b>${enemyName}</b> trifft!`);
            } else {
                push(`💥 <b>${playerName()}</b> trifft!`);
            }
        });
        EventHub.on(EventHub.EVENTS.BATTLE_VICTORY, ({ monster }) => {
            const enemyName = monster?.name || window.BattleEngine?.enemy?.name || 'ein Gegner';
            push(`🏆 <b>${playerName()}</b> besiegt <b>${enemyName}</b>.`);
        });
        EventHub.on(EventHub.EVENTS.BATTLE_ESCAPE, ({ monster }) => {
            const enemyName = monster?.name || window.BattleEngine?.enemy?.name || 'ein Gegner';
            push(`🏃 <b>${playerName()}</b> entkommt <b>${enemyName}</b>.`);
        });
    }

    /* ==============================
       🎒 INVENTAR
    ============================== */

    function observeInventory() {
        if (!window.data?.inventar) return;

        if (!Object.keys(lastInventory).length) {
            lastInventory = clone(data.inventar);
            return;
        }

        for (const id in data.inventar) {
            if (!lastInventory[id]) {
                push(`<b>${playerName()}</b> erhält einen neuen Gegenstand.`);
            }
        }

        lastInventory = clone(data.inventar);
    }

    /* ==============================
       🧬 EVOLUTION
    ============================== */

    function observeEvolution() {
        const evo = window.data?.stats?.totalEvoLevel;
        if (evo == null) return;

        if (lastEvo !== null && evo > lastEvo) {
            const emoji = (typeof window.getCreatureEmoji === 'function') ? window.getCreatureEmoji(window.data) : '✨';
            push(`${emoji} <b>${playerName()}</b> spürt eine neue Form entstehen.`);
        }

        lastEvo = evo;
    }

    /* ==============================
       🔄 LOOP
    ============================== */

    setInterval(() => {
        observeBattle();
        observeInventory();
        observeEvolution();
    }, CHECK_INTERVAL);

    push(`<b>Rafael System:</b> bereit 🚀`);

    return { push };
})();

window.RaphaelSystem = RaphaelSystem;
window.LiveTicker = RaphaelSystem; // 🔁 Kompatibilität
