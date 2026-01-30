/**
 * 🪟 OpenUI.js
 * Zentrale UI-Steuerung für The Nest
 * Rolle: Fenster öffnen / schließen / wechseln
 * KEINE Spiellogik, KEINE Rechteprüfung
 */

const OpenUI = (() => {
    let currentView = null;

    // --- interne Helfer ---
    function _getModal() {
        return document.getElementById('gameModal');
    }

    function _getLeft() {
        return document.getElementById('modalLeft');
    }

    function _getRight() {
        return document.getElementById('modalRight');
    }

    function _ensureModal() {
        const modal = _getModal();
        const left = _getLeft();
        if (!modal || !left) {
            console.error("❌ OpenUI: Modal-Struktur fehlt (gameModal / modalLeft).");
            return false;
        }
        return true;
    }

    // --- öffentliche API ---

    /**
     * Öffnet eine UI-Ansicht
     * @param {string} viewId - z.B. 'arena', 'market', 'auction', 'admin'
     * @param {string} html - HTML-Inhalt für modalLeft
     * @param {string|null} rightHtml - optionaler Inhalt für modalRight
     */
    function open(viewId, html = '', rightHtml = null) {
        if (!_ensureModal()) return;

        const modal = _getModal();
        const left = _getLeft();
        const right = _getRight();

        currentView = viewId;

        left.innerHTML = html;
        if (right && rightHtml !== null) {
            right.innerHTML = rightHtml;
        }

        modal.style.display = 'flex';

        console.log(`🪟 OpenUI: View "${viewId}" geöffnet`);
    }

    /**
     * Schließt das aktuell offene UI
     */
    function close() {
        const modal = _getModal();
        if (modal) modal.style.display = 'none';

        currentView = null;
        console.log("🪟 OpenUI: UI geschlossen");
    }

    /**
     * Tauscht nur den Inhalt, ohne das Fenster neu zu öffnen
     */
    function replace(viewId, html = '', rightHtml = null) {
        if (!_ensureModal()) return;

        const left = _getLeft();
        const right = _getRight();

        currentView = viewId;

        left.innerHTML = html;
        if (right && rightHtml !== null) {
            right.innerHTML = rightHtml;
        }

        console.log(`🪟 OpenUI: View gewechselt zu "${viewId}"`);
    }

    /**
     * Liefert die aktuell offene View-ID
     */
    function getCurrentView() {
        return currentView;
    }

    /**
     * Prüft, ob eine bestimmte View aktiv ist
     */
    function isOpen(viewId) {
        return currentView === viewId;
    }

    return {
        open,
        close,
        replace,
        getCurrentView,
        isOpen
    };
})();

// global verfügbar machen
window.OpenUI = OpenUI;
