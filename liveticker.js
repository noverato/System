/**
 * 📰 liveticker.js
 * Globaler Story-Observer für THE NEST
 *
 * - Beobachtet Spielzustände (Battle, Inventar, Evolution)
 * - KEINE Abhängigkeit von Events
 * - KEINE Spiellogik
 * - KEINE Zahlenanzeige
 * - Stabil auch bei "frozen" Battle.js
 */

const LiveTicker = (() => {
    'use strict';

    const MAX_ENTRIES = 15;
    const CHECK_INTERVAL = 600; // ms

    /* ==============================
       🧩 DOM & BASIS
    ============================== */

    function getContainer() {
        return document.getElementById('sideContent');
    }

    function playerName() {
        return window.data?.name || 'Ein Wanderer';
    }

    function createEntry(html) {
        const div = document.createElement('div');
        div.className = 'ticker-entry';
        div.style.marginBottom = '6px';
        div.style.fontSize = '14px';
        div.style.lineHeight = '1.4';
        div.innerHTML = html;
        return div;
    }

    function pushMessage(html) {
        const container = getContainer();
        if (!container) return;

        container.prepend(createEntry(html));

        while (container.children.length > MAX_ENTRIES) {
            container.removeChild(container.lastChild);
        }
    }

    /* ==============================
       👁️ INTERNE SNAPSHOTS
    ============================== */

    let lastBattleActive = false;
    let lastEnemy = null;

    let lastInventorySnapshot = {};
    let lastEvoLevel = null;

    /* ==============================
       🧠 SNAPSHOT-HELPER
    ============================== */

    function cloneInventory(inv = {}) {
        return JSON.parse(JSON.stringify(inv));
    }

    function inventoryDiff(oldInv, newInv) {
        const changes = [];

        for (const id in newInv) {
            if (!oldInv[id]) {
                changes.push({ id, type: 'gain' });
            }
        }

        for (const id in oldInv) {
            if (!newInv[id]) {
                changes.push({ id, type: 'loss' });
            }
        }

        return changes;
    }

    /* ==============================
       ⚔️ KAMPF-BEOBACHTUNG
    ============================== */

    function observeBattle() {
        if (!window.BattleEngine) return;

        const isActive = BattleEngine.active;

        // Kampf startet
        if (!lastBattleActive && isActive) {
            lastEnemy = BattleEngine.enemy || null;

            if (lastEnemy?.name) {
                pushMessage(
                    `<b>${playerName()}</b> stellt sich <b>${lastEnemy.name}</b>.`
                );
            }
        }

        // Kampf endet
        if (lastBattleActive && !isActive) {
            if (lastEnemy) {
                if (lastEnemy.hp <= 0) {
                    pushMessage(
                        `<b>${playerName()}</b> hat <b>${lastEnemy.name}</b> besiegt.`
                    );
                } else if (window.data?.hp <= 0) {
                    pushMessage(
                        `<b>${playerName()}</b> wurde von <b>${lastEnemy.name}</b> bezwungen.`
                    );
                } else {
                    pushMessage(
                        `<b>${playerName()}</b> entkommt dem Kampf gegen <b>${lastEnemy.name}</b>.`
                    );
                }
            }
            lastEnemy = null;
        }

        lastBattleActive = isActive;
    }

    /* ==============================
       🎒 INVENTAR-BEOBACHTUNG
    ============================== */

    function observeInventory() {
        if (!window.data?.inventar) return;

        if (!lastInventorySnapshot || Object.keys(lastInventorySnapshot).length === 0) {
            lastInventorySnapshot = cloneInventory(data.inventar);
            return;
        }

        const diff = inventoryDiff(lastInventorySnapshot, data.inventar);

        diff.forEach(change => {
            if (change.type === 'gain') {
                pushMessage(
                    `<b>${playerName()}</b> entdeckt etwas Neues im Rucksack.`
                );
            }
            if (change.type === 'loss') {
                pushMessage(
                    `<b>${playerName()}</b> trennt sich von einem Besitz.`
                );
            }
        });

        lastInventorySnapshot = cloneInventory(data.inventar);
    }

    /* ==============================
       🧬 EVOLUTION-BEOBACHTUNG
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
                `<b>${playerName()}</b> spürt eine tiefgreifende Veränderung.`
            );
        }

        lastEvoLevel = evo;
    }

    /* ==============================
       🔄 HAUPT-LOOP
    ============================== */

    setInterval(() => {
        observeBattle();
        observeInventory();
        observeEvolution();
    }, CHECK_INTERVAL);

    /* ==============================
       🔁 API (optional)
    ============================== */

    return {
        push: pushMessage
    };

})();

// 🌍 Global verfügbar
window.LiveTicker = LiveTicker;
