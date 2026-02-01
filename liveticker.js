/**
 * 🧠 RAPHAEL SYSTEM
 * Globaler Story-Observer für THE NEST
 *
 * Eigenschaften:
 * - Komplett entkoppelt von Battle.js (Frozen Core)
 * - Kein EventHub nötig
 * - Beobachtet:
 *   ⚔️ Kämpfe
 *   🎒 Inventar
 *   🧬 Evolution
 * - Eigenes persistentes UI (kein Überschreiben mehr)
 * - Keine Zahlen (XP / HP / LXP)
 */

const RaphaelSystem = (() => {
    'use strict';

    /* ==============================
       ⚙️ KONFIGURATION
    ============================== */

    const MAX_ENTRIES = 15;
    const CHECK_INTERVAL = 600; // ms
    const CONTAINER_ID = 'raphael-ticker';

    /* ==============================
       🧩 BASISFUNKTIONEN
    ============================== */

    function playerName() {
        return window.data?.name || 'Ein Wanderer';
    }

    function createEntry(html) {
        const div = document.createElement('div');
        div.className = 'raphael-entry';
        div.style.fontSize = '13px';
        div.style.lineHeight = '1.4';
        div.style.marginBottom = '6px';
        div.innerHTML = html;
        return div;
    }

    /* ==============================
       🏗️ UI-MOUNT (KRITISCHER TEIL)
    ============================== */

    function ensureContainer() {
        let container = document.getElementById(CONTAINER_ID);
        if (container) return container;

        // Ziel: unter OverlordHeld / Spielerpanel
        const fallbackParent =
            document.getElementById('playerPanel') ||
            document.getElementById('overlordPanel') ||
            document.getElementById('sideContent') ||
            document.body;

        container = document.createElement('div');
        container.id = CONTAINER_ID;
        container.style.marginTop = '10px';
        container.style.padding = '8px';
        container.style.background = 'rgba(0,0,0,0.4)';
        container.style.border = '1px solid gold';
        container.style.borderRadius = '6px';
        container.style.maxHeight = '180px';
        container.style.overflowY = 'auto';

        const title = document.createElement('div');
        title.innerHTML = '<b>📜 Rafael System</b>';
        title.style.marginBottom = '6px';
        title.style.color = 'gold';
        title.style.fontSize = '13px';

        container.appendChild(title);
        fallbackParent.appendChild(container);

        return container;
    }

    function pushMessage(html) {
        const container = ensureContainer();
        const entry = createEntry(html);
        container.appendChild(entry);

        // Limitierung
        while (container.children.length > MAX_ENTRIES + 1) {
            container.removeChild(container.children[1]);
        }
    }

    /* ==============================
       📸 SNAPSHOTS
    ============================== */

    let lastBattleActive = false;
    let lastEnemy = null;

    let lastInventory = null;
    let lastEvoLevel = null;

    function clone(obj) {
        return JSON.parse(JSON.stringify(obj));
    }

    /* ==============================
       ⚔️ KAMPF-BEOBACHTUNG
    ============================== */

    function observeBattle() {
        if (!window.BattleEngine) return;

        const active = BattleEngine.active;

        // Kampfstart
        if (!lastBattleActive && active) {
            lastEnemy = BattleEngine.enemy || null;

            if (lastEnemy?.name) {
                pushMessage(
                    `<b>${playerName()}</b> betritt den Kampf gegen <b>${lastEnemy.name}</b>.`
                );
            }
        }

        // Kampfende
        if (lastBattleActive && !active) {
            if (lastEnemy) {
                if (lastEnemy.hp <= 0) {
                    pushMessage(
                        `<b>${playerName()}</b> besiegt <b>${lastEnemy.name}</b>.`
                    );
                } else if (window.data?.hp <= 0) {
                    pushMessage(
                        `<b>${playerName()}</b> unterliegt <b>${lastEnemy.name}</b>.`
                    );
                } else {
                    pushMessage(
                        `<b>${playerName()}</b> zieht sich aus dem Kampf zurück.`
                    );
                }
            }
            lastEnemy = null;
        }

        lastBattleActive = active;
    }

    /* ==============================
       🎒 INVENTAR-BEOBACHTUNG
    ============================== */

    function observeInventory() {
        if (!window.data?.inventar) return;

        if (!lastInventory) {
            lastInventory = clone(data.inventar);
            return;
        }

        const oldInv = lastInventory;
        const newInv = data.inventar;

        for (const key in newInv) {
            if (!oldInv[key]) {
                pushMessage(
                    `<b>${playerName()}</b> nimmt etwas Neues an sich.`
                );
            }
        }

        for (const key in oldInv) {
            if (!newInv[key]) {
                pushMessage(
                    `<b>${playerName()}</b> gibt einen Besitz auf.`
                );
            }
        }

        lastInventory = clone(newInv);
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
                `<b>${playerName()}</b> erfährt eine tiefgreifende Wandlung.`
            );
        }

        lastEvoLevel = evo;
    }

    /* ==============================
       🔄 HAUPTSCHLEIFE
    ============================== */

    setInterval(() => {
        observeBattle();
        observeInventory();
        observeEvolution();
    }, CHECK_INTERVAL);

    /* ==============================
       🔁 API (Debug & Tests)
    ============================== */

    return {
        push: pushMessage
    };

})();

/* 🌍 GLOBAL */
window.RaphaelSystem = RaphaelSystem;
