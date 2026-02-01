/**
 * 🧠 Rafael System
 * Globaler Observer & Story-Ticker für THE NEST
 *
 * - Beobachtet Kämpfe, Inventar, Evolution
 * - KEINE Abhängigkeit von Events
 * - KEINE Spiellogik
 * - Battle.js bleibt FROZEN
 */

(function () {
    'use strict';

    const MAX_ENTRIES = 15;
    const CHECK_INTERVAL = 500;

    /* =========================
       📄 DOM
    ========================= */

    function getContainer() {
        return document.getElementById('sideContent');
    }

    function playerName() {
        return window.data?.name || 'Ein Wanderer';
    }

    function push(html) {
        const container = getContainer();
        if (!container) return;

        const div = document.createElement('div');
        div.className = 'ticker-entry';
        div.style.marginBottom = '6px';
        div.style.fontSize = '14px';
        div.style.lineHeight = '1.4';
        div.innerHTML = html;

        container.prepend(div);

        while (container.children.length > MAX_ENTRIES) {
            container.removeChild(container.lastChild);
        }
    }

    /* =========================
       🧠 SNAPSHOTS
    ========================= */

    let lastBattleState = 'idle'; // idle | active
    let lastEnemyName = null;

    let lastInventory = null;
    let lastEvo = null;

    /* =========================
       ⚔️ KAMPF
    ========================= */

    function observeBattle() {
        if (!window.BattleEngine) return;

        const active = BattleEngine.active;
        const enemy = BattleEngine.enemy;

        // Kampfstart
        if (lastBattleState === 'idle' && active && enemy?.name) {
            lastBattleState = 'active';
            lastEnemyName = enemy.name;

            push(
                `<b>${playerName()}</b> betritt den Kampf gegen <b>${enemy.name}</b>.`
            );
        }

        // Kampfende
        if (lastBattleState === 'active' && !active) {
            if (enemy?.hp <= 0) {
                push(
                    `<b>${playerName()}</b> hat <b>${lastEnemyName}</b> besiegt.`
                );
            } else if (window.data?.hp <= 0) {
                push(
                    `<b>${playerName()}</b> wurde von <b>${lastEnemyName}</b> bezwungen.`
                );
            } else {
                push(
                    `<b>${playerName()}</b> zieht sich aus dem Kampf zurück.`
                );
            }

            lastBattleState = 'idle';
            lastEnemyName = null;
        }
    }

    /* =========================
       🎒 INVENTAR
    ========================= */

    function clone(obj) {
        return JSON.parse(JSON.stringify(obj));
    }

    function observeInventory() {
        if (!window.data?.inventar) return;

        if (!lastInventory) {
            lastInventory = clone(data.inventar);
            return;
        }

        for (const key in data.inventar) {
            if (!lastInventory[key]) {
                push(
                    `<b>${playerName()}</b> nimmt etwas Neues an sich.`
                );
            }
        }

        for (const key in lastInventory) {
            if (!data.inventar[key]) {
                push(
                    `<b>${playerName()}</b> trennt sich von einem Besitz.`
                );
            }
        }

        lastInventory = clone(data.inventar);
    }

    /* =========================
       🧬 EVOLUTION
    ========================= */

    function observeEvolution() {
        const evo = window.data?.stats?.totalEvoLevel;
        if (evo == null) return;

        if (lastEvo === null) {
            lastEvo = evo;
            return;
        }

        if (evo > lastEvo) {
            push(
                `<b>${playerName()}</b> durchläuft eine tiefgreifende Wandlung.`
            );
        }

        lastEvo = evo;
    }

    /* =========================
       🔄 LOOP
    ========================= */

    setInterval(() => {
        observeBattle();
        observeInventory();
        observeEvolution();
    }, CHECK_INTERVAL);

    /* =========================
       🌍 GLOBAL API
    ========================= */

    window.LiveTicker = {
        push
    };

})();
