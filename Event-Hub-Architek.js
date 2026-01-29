
/**
 * THE NEST - Event Hub (v1.0.0)
 * * Zentrale Event-Bridge für die Kommunikation zwischen Modulen.
 * Ermöglicht lose Kopplung durch das CustomEvent-API.
 * * REGLEN:
 * - Keine Firebase-Abhängigkeit
 * - Kein DOM-Zugriff (außer globaler Event-Dispatcher)
 * - Keine Spiellogik
 */

const EventHub = {
    /**
     * Event-Konstanten zur Vermeidung von Tippfehlern
     */
    EVENTS: {
        // Encounter & Kampf
        ENCOUNTER_START: 'encounter:start',
        ENCOUNTER_END: 'encounter:end',
        ARENA_START: 'arena:start',
        
        // UI & Menü
        INVENTORY_OPEN: 'ui:inventory:open',
        INVENTORY_CLOSE: 'ui:inventory:close',
        MENU_TOGGLE: 'ui:menu:toggle',
        
        // Spielwelt
        LOCATION_CHANGE: 'world:location:change',
        NOTIFICATION_SHOW: 'ui:notification:push'
    },

    /**
     * Interner Dispatcher (nutzt das globale window-Objekt als Bridge)
     * @param {string} eventName 
     * @param {object} detail 
     */
    emit(eventName, detail = {}) {
        const event = new CustomEvent(eventName, { 
            detail,
            bubbles: true,
            cancelable: true 
        });
        window.dispatchEvent(event);
    },

    /**
     * Hilfsfunktionen für standardisierte Events
     */

    /**
     * Startet eine Begegnung
     * @param {Object} monsterData - Daten des Gegners
     */
    emitEncounter(monsterData) {
        this.emit(this.EVENTS.ENCOUNTER_START, { monster: monsterData });
    },

    /**
     * Startet die Arena-Sequenz
     * @param {Object} config - Arena-Einstellungen
     */
    emitArenaStart(config) {
        this.emit(this.EVENTS.ARENA_START, config);
    },

    /**
     * Steuert das Inventar-Fenster
     * @param {boolean} isOpen 
     */
    emitInventory(isOpen) {
        const type = isOpen ? this.EVENTS.INVENTORY_OPEN : this.EVENTS.INVENTORY_CLOSE;
        this.emit(type);
    },

    /**
     * Informiert über einen Ortswechsel
     * @param {string} locationId 
     */
    emitLocationChange(locationId) {
        this.emit(this.EVENTS.LOCATION_CHANGE, { id: locationId });
    },

    /**
     * Zeigt eine Nachricht im UI an
     * @param {string} message 
     * @param {string} type - e.g., 'info', 'warning', 'error'
     */
    emitNotification(message, type = 'info') {
        this.emit(this.EVENTS.NOTIFICATION_SHOW, { message, type });
    },

    /**
     * Wrapper zum Registrieren von Listenern (erleichtert die Integration)
     * @param {string} eventName 
     * @param {Function} callback 
     */
    on(eventName, callback) {
        window.addEventListener(eventName, (e) => callback(e.detail));
    },

    /**
     * Entfernt einen Listener
     * @param {string} eventName 
     * @param {Function} callback 
     */
    off(eventName, callback) {
        window.removeEventListener(eventName, callback);
    }
};

// Export für moderne Module oder globales Window-Objekt
if (typeof module !== 'undefined' && module.exports) {
    module.exports = EventHub;
} else {
    window.EventHub = EventHub;
}
