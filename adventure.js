/**
 * THE NEST: ADVENTURE MODULE (adventure.js)
 * Architektur: Passiver Observer-Modus.
 * Überwacht Positionsänderungen im 'data'-Objekt und triggert Encounter.
 */

const AdventureModule = {
    // --- KONFIGURATION ---
    config: {
        stepThreshold: 40,      // Pixel/Einheiten, die für einen "Schritt" nötig sind
        encounterChance: 0.2,   // 20% Chance pro erreichtem Schwellenwert
        minLevel: 1
    },

    // --- INTERNER STATE ---
    state: {
        lastX: 0,
        lastY: 0,
        accumulatedDistance: 0,
        isActive: true
    },

    /**
     * Initialisiert das Modul und setzt die Startposition.
     */
    init() {
        console.log("🌲 Adventure-Architekt: Überwachung gestartet.");
        
        // Warte kurz, bis storage.js die Daten geladen hat
        setTimeout(() => {
            if (typeof data !== 'undefined') {
                this.state.lastX = data.x || 0;
                this.state.lastY = data.y || 0;
            }
            this.startObservation();
        }, 1000);
    },

    /**
     * Startet einen Heartbeat, der die Position in 'data' prüft,
     * ohne die bestehende Bewegungslogik in der HTML zu stören.
     */
    startObservation() {
        setInterval(() => {
            if (this.state.isActive) {
                this.trackMovement();
            }
        }, 200); // Prüft 5x pro Sekunde auf Veränderungen
    },

    /**
     * Berechnet die Differenz zwischen der aktuellen und der letzten Position.
     */
    trackMovement() {
        if (typeof data === 'undefined') return;

        const dx = data.x - this.state.lastX;
        const dy = data.y - this.state.lastY;
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (distance > 0) {
            this.state.accumulatedDistance += distance;
            
            // Wenn die Distanz den Schwellenwert für einen "Schritt" erreicht
            if (this.state.accumulatedDistance >= this.config.stepThreshold) {
                this.state.accumulatedDistance = 0;
                this.rollForEncounter();
            }

            // Letzte Position aktualisieren
            this.state.lastX = data.x;
            this.state.lastY = data.y;
        }
    },

    /**
     * Würfelt um eine Monsterbegegnung.
     */
    rollForEncounter() {
        if (Math.random() < this.config.encounterChance) {
            this.triggerEncounter();
        }
    },

    /**
     * Erstellt das Monster und sendet das Event an das Battle-System.
     */
    triggerEncounter() {
        // Monster generieren (MonsterLibrary ist global verfügbar)
        const playerLevel = data.level || this.config.minLevel;
        const monster = MonsterLibrary.generateWildnisMonster(playerLevel);

        console.log(`⚔️ Nest-Event: ${monster.name} nähert sich!`);

        // Kommunikation via Event (Entkoppelt von battle.js)
        if (window.EventHub) {
            EventHub.emit(EventHub.EVENTS.ENCOUNTER_START, { monster });
        } else {
            const event = new CustomEvent('ENCOUNTER_START', {
                detail: { 
                    monster: monster,
                    location: { x: data.x, y: data.y }
                }
            });
            window.dispatchEvent(event);
        }
    }
};

// Start des Moduls
AdventureModule.init();
