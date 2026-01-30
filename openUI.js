/**
 * 🪟 OpenUI.js
 * Zentrale UI-Steuerung für The Nest
 * Rolle: Fenster öffnen / schließen
 * KEINE Spiellogik
 * KEINE Zustände
 */

/**
 * 🏗️ UI-GRUNDREGEL – GILT IMMER
 *
 * UI ist ein Einweg-Objekt.
 * Öffnen  = Rendern
 * Schließen = Vergessen
 *
 * Keine Ausnahmen.
 */
const OpenUI = (() => {

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

    function _clearContent() {
        const left = _getLeft();
        const right = _getRight();
        if (left) left.innerHTML = '';
        if (right) right.innerHTML = '';
    }

    /** ✅ EINZIGE Quelle der Wahrheit für Hintergründe */
    function resetModalBackground() {
        const left = _getLeft();
        if (!left) return;
        left.style.backgroundImage = '';
        left.style.backgroundSize = '';
        left.style.backgroundPosition = '';
    }

    // --- öffentliche API ---

    /**
     * Öffnet ein UI-Fenster
     * JEDER AUFRUF = NEUER RENDER
     */
    function open(html = '', rightHtml = null) {
        if (!_ensureModal()) return;

        const modal = _getModal();
        const left = _getLeft();
        const right = _getRight();

        // 🔥 ABSOLUTE RESET-PHASE
        resetModalBackground();
        _clearContent();

        // 🔧 Rendern
        left.innerHTML = html;
        if (right && rightHtml !== null) {
            right.innerHTML = rightHtml;
        }

        modal.style.display = 'flex';
    }

    /**
     * Schließt das UI
     * = KOMPLETTES VERGESSEN
     */
    function close() {
        resetModalBackground();
        _clearContent();

        const modal = _getModal();
        if (modal) modal.style.display = 'none';
    }

    /**
     * Alias für open()
     */
    function replace(html = '', rightHtml = null) {
        open(html, rightHtml);
    }

    return {
        open,
        close,
        replace,
        resetModalBackground
    };
})();

// global verfügbar
window.OpenUI = OpenUI;
