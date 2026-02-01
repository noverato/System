/**
 * 🧠 Rafael System
 * Globaler Story-Observer für THE NEST
 *
 * - Reiner Beobachter (kein Event-Zwang)
 * - Funktioniert mit frozen Battle.js
 * - Schreibt in:
 *   1) Inventar-Info (sideContent)
 *   2) Permanenten Overlord-Ticker
 * - KEINE Zahlen
 * - KEINE Spiellogik
 */

const RafaelSystem = (() => {
    'use strict';

    const MAX_ENTRIES = 15;
    const CHECK_INTERVAL = 600; // ms

    /* ==============================
       🧩 BASIS
    ============================== */

    function playerName() {
        return window.data?.name || 'Ein Wanderer';
    }

    function createEntry(html) {
        const div = document.createElement('div');
        div.className = 'rafael-entry';
        div.style.marginBottom = '6px';
        div.style.fontSize = '13px';
        div.style.lineHeight = '1.4';
        div.innerHTML = html;
        return div;
    }

    /* ==============================
       📍 CONTAINER
    ============================== */

    function getInventoryContainer() {
        return document.getElementById('sideContent');
    }

    function getOverlordContainer() {
        let container = document.getElementById('rafaelTicker');

        if (!container) {
            const host =
                document.getElementById('playerPanel') ||
                document.querySelector('[data-panel="player"]') ||
                document.body;

            container = document.createElement('div');
            container.id = 'rafaelTicker';
            container.style.marginTop = '10px';
            container.style.padding = '8px';
            container.style.background = 'rgba(0,0,0,0.55)';
            container.style.border = '1px solid gold';
            container.style.borderRadius = '6px';
            container.style.maxHeight = '160px';
            container.style.overflow = 'hidden';
            container.style.color = '#f5e6b8';
            container.style.fontSize = '13px';

            const title = document.createElement('div');
            title.innerText = '🧠 Rafael System';
            title.style.fontWeight = 'bold';
            title.style.marginBottom = '6px';
            title.style.color = 'gold';

            container.appendChild(title);
            host.appendChild(container);
        }

        return container;
    }

    function pushMessage(html) {
        const targets = [
            getInventoryContainer(),
            getOverlordContainer()
        ];

        targets.forEach(container => {
            if (!container) return;

            container.prepend(createEntry(html));

            while (container.children.length > MAX_ENTRIES + 1) {
                container.removeChild(container.lastChild);
            }
        });
    }

    /* ==============================
       👁️ SNAPSHOTS
    ============================== */

    let lastBattleActive = false;
    let lastEnemy = null;

    let lastInventory = {};
    let lastEvoLevel = null;

    function clone(obj = {}) {
        return JSON.parse(JSON.stringify(obj));
    }

    /* ==============================
       ⚔️ KAMPF
    ============================== */

    function observeBattle() {
        if (!window.BattleEngine) return;

        const active = BattleEngine.active;

        // Start
        if (!lastBattleActive && active) {
            lastEnemy = BattleEngine.enemy;
            if (lastEnemy?.name) {
                pushMessage(
                    `<b>${playerName()}</b> betritt den Kampf gegen <b>${lastEnemy.name}</b>.`
                );
            }
        }

        // Ende
        if (lastBattleActive && !active && lastEnemy) {
            if (lastEnemy.hp <= 0) {
                pushMessage(
                    `<b>${playerName()}</b> triumphiert über <b>${lastEnemy.name}</b>.`
                );
            } else if (window.data?.hp <= 0) {
                pushMessage(
                    `<b>${playerName()}</b> wird von <b>${lastEnemy.name}</b> besiegt.`
                );
            } else {
                pushMessage(
                    `<b>${playerName()}</b> zieht sich aus dem Kampf zurück.`
                );
            }
            lastEnemy = null;
        }

        lastBattleActive = active;
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

        for (const key in data.inventar) {
            if (!lastInventory[key]) {
                pushMessage(
                    `<b>${playerName()}</b> findet etwas Neues.`
                );
            }
        }

        for (const key in lastInventory) {
            if (!data.inventar[key]) {
                pushMessage(
                    `<b>${playerName()}</b> gibt einen Besitz auf.`
                );
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

        if (lastEvoLevel === null) {
            lastEvoLevel = evo;
            return;
        }

        if (evo > lastEvoLevel) {
            pushMessage(
                `<b>${playerName()}</b> spürt eine neue Entwicklungsstufe.`
            );
        }

        lastEvoLevel = evo;
    }

    /* ==============================
       🔄 LOOP
    ============================== */

    setInterval(() => {
        observeBattle();
        observeInventory();
        observeEvolution();
    }, CHECK_INTERVAL);

    /* ==============================
       🔁 API
    ============================== */

    return {
        push: pushMessage
    };

})();

// 🌍 Global
window.RafaelSystem = RafaelSystem;
