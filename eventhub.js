/**
 * THE NEST - Event Hub (v2.0.0)
 * Zentrales Nervensystem für alle Gameplay-Module
 *
 * REGELN:
 * - Keine Spiellogik
 * - Keine UI-Logik
 * - Keine direkten Modul-Imports
 * - Reine Event-Orchestrierung
 */

const EventHub = (() => {

    /* ==============================
       📌 EVENT-DEFINITIONEN
    ============================== */
    const EVENTS = {

        /* 🌲 ENCOUNTER */
        ENCOUNTER_STEP: 'encounter:step',
        ENCOUNTER_START: 'encounter:start',
        ENCOUNTER_END: 'encounter:end',

        /* ⚔️ BATTLE / ARENA */
        BATTLE_START: 'battle:start',
        BATTLE_VICTORY: 'battle:victory',
        BATTLE_ESCAPE: 'battle:escape',

        ARENA_START: 'arena:start',
        ARENA_VICTORY: 'arena:victory',

        /* 🎁 LOOT / BEUTE */
        LOOT_GENERATED: 'loot:generated',
        BEUTE_READY: 'beute:ready',

        /* 🎒 INVENTAR */
        INVENTORY_ADD: 'inventory:add',
        INVENTORY_OPEN: 'ui:inventory:open',
        INVENTORY_CLOSE: 'ui:inventory:close',

        /* ⛏️ WIRTSCHAFT */
        RESOURCE_GAIN: 'resource:gain',
        MARKET_TRANSACTION: 'market:transaction',

        /* 🌱 EVOLUTION */
        EVOLUTION_XP: 'evolution:xp',

        /* 🌍 WELT */
        LOCATION_CHANGE: 'world:location:change',

        /* 🖥️ UI */
        NOTIFICATION: 'ui:notification',

        /* 🛠️ ADMIN (OVERRIDE) */
        ADMIN_FORCE: 'admin:force'
    };

    /* ==============================
       🔔 CORE DISPATCH
    ============================== */
    function emit(eventName, detail = {}, options = {}) {
        const event = new CustomEvent(eventName, {
            detail,
            bubbles: true,
            cancelable: !options.force
        });
        window.dispatchEvent(event);
    }

    function on(eventName, callback) {
        window.addEventListener(eventName, e => callback(e.detail));
    }

    function off(eventName, callback) {
        window.removeEventListener(eventName, callback);
    }

    /* ==============================
       🧠 ZENTRALE ROUTINGS
    ============================== */

    // 👣 Schritt → Encounter
    on(EVENTS.ENCOUNTER_STEP, () => {
        if (window.Encounter?.registerStep) {
            window.Encounter.registerStep();
        }
    });

    // 🐲 Encounter → Battle
    on(EVENTS.ENCOUNTER_START, ({ monster }) => {
        emit(EVENTS.BATTLE_START, { monster });
    });

    // ⚔️ Sieg → Loot → Beute → Inventar
    function handleVictory(payload) {
        const { monster } = payload;

        // Loot
        if (window.LootManager?.getDrop) {
            const baseItem = window.LootManager.getDrop(monster);
            emit(EVENTS.LOOT_GENERATED, { baseItem, monster });
        }
    }

    on(EVENTS.BATTLE_VICTORY, handleVictory);
    on(EVENTS.ARENA_VICTORY, handleVictory);

    // 🎁 Loot → Beute → Inventar
    on(EVENTS.LOOT_GENERATED, ({ baseItem, monster }) => {
        if (!baseItem) return;

        const item = window.Beute?.applyBeuteFlavor
            ? window.Beute.applyBeuteFlavor(baseItem, monster)
            : baseItem;

        emit(EVENTS.BEUTE_READY, { item });
    });

    on(EVENTS.BEUTE_READY, ({ item }) => {
        emit(EVENTS.INVENTORY_ADD, { item });
    });

    // ⛏️ Ressourcen → Inventar + Evolution
    on(EVENTS.RESOURCE_GAIN, ({ resource, amount, xp }) => {
        emit(EVENTS.INVENTORY_ADD, { item: resource, amount });
        if (xp) emit(EVENTS.EVOLUTION_XP, { xp });
    });

    // 💰 Markt → Inventar
    on(EVENTS.MARKET_TRANSACTION, ({ delta }) => {
        emit(EVENTS.INVENTORY_ADD, { lxp: delta });
    });

    /* ==============================
       🛠️ ADMIN OVERRIDE
    ============================== */
    on(EVENTS.ADMIN_FORCE, ({ event, payload }) => {
        emit(event, payload, { force: true });
    });

    /* ==============================
       📤 PUBLIC API
    ============================== */
    return {
        EVENTS,
        emit,
        on,
        off
    };

})();

// 🌍 Global verfügbar
window.EventHub = EventHub;
