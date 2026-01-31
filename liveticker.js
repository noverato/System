/**
 * 📰 ticker.js
 * Story-Ticker für THE NEST
 *
 * Rolle:
 * - Lauscht auf EventHub
 * - Schreibt Story-Meldungen ins Inventar-Infofeld
 * - KEINE Spiellogik
 * - KEINE Zahlen (XP / LXP)
 */

const Ticker = (() => {
    'use strict';

    const MAX_ENTRIES = 15;

    /* ==============================
       🧩 HILFSFUNKTIONEN
    ============================== */

    function getContainer() {
        return document.getElementById('sideContent');
    }

    function createEntry(html) {
        const div = document.createElement('div');
        div.className = 'ticker-entry';
        div.style.marginBottom = '8px';
        div.style.fontSize = '14px';
        div.style.lineHeight = '1.4';
        div.innerHTML = html;
        return div;
    }

    function pushMessage(html) {
        const container = getContainer();
        if (!container) return;

        const entry = createEntry(html);
        container.prepend(entry);

        // Limitierung
        while (container.children.length > MAX_ENTRIES) {
            container.removeChild(container.lastChild);
        }
    }

    function playerName() {
        return window.data?.name || 'Ein Wanderer';
    }

    /* ==============================
       📡 EVENT-LISTENER
    ============================== */

    if (!window.EventHub) {
        console.warn("📰 Ticker: EventHub nicht gefunden.");
        return {};
    }

    // 🗡️ Kampf – Sieg
    EventHub.on('battle:victory', ({ monster }) => {
        if (!monster?.name) return;
        pushMessage(
            `<b>${playerName()}</b> hat <b>${monster.name}</b> besiegt.`
        );
    });

    // 🏃 Kampf – Flucht / Niederlage
    EventHub.on('battle:escape', ({ monster }) => {
        if (!monster?.name) return;
        pushMessage(
            `<b>${playerName()}</b> wurde von <b>${monster.name}</b> zurückgedrängt.`
        );
    });

    // 🧬 Evolution
    EventHub.on('evolution:stage', ({ from, to }) => {
        if (!from || !to) return;
        pushMessage(
            `<b>${playerName()}</b> hat sich entwickelt: <b>${from}</b> → <b>${to}</b>`
        );
    });

    // 👑 Boss-Herausforderung
    EventHub.on('arena:start', ({ boss }) => {
        if (!boss?.name) return;
        pushMessage(
            `<b>${playerName()}</b> fordert den Boss <b>${boss.name}</b> heraus.`
        );
    });

    // ⚔️ PvP-Herausforderung
    EventHub.on('pvp:challenge', ({ from, to }) => {
        if (!from || !to) return;
        pushMessage(
            `<b>${from}</b> fordert <b>${to}</b> zum Duell heraus.`
        );
    });

    /* ==============================
       🔁 API (optional)
    ============================== */

    return {
        push: pushMessage
    };

})();

// 🌍 Global verfügbar
window.Ticker = Ticker;
