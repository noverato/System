/**
 * THE NEST: STORAGE & SYNC MODULE (storage.js)
 * Hüter der Beständigkeit für das Spawn2909 Isekai-Nest.
 */

// --- 1. INITIALISIERUNG ---
const firebaseConfig = { 
    apiKey: "AIzaSyCKNXJ-ouAOAcLr5ut-EemWQI8_zJxhqa8", 
    authDomain: "thenest-81de6.firebaseapp.com", 
    databaseURL: "https://thenest-81de6-default-rtdb.firebaseio.com", 
    projectId: "thenest-81de6" 
};

if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}
const db = firebase.database();

// Globales Daten-Objekt
let data = {
    lxp: 0,
    inventar: {},
    evolutionStage: "Ei",
    stats: {},
    hp: 100,
    maxHp: 100,
    x: 960,
    y: 540,
    name: "Unbekannter Abenteurer"
};

// --- 2. SICHERHEIT & SPEICHER-LOGIK ---

/**
 * Zentrale Save-Funktion mit Korruptions-Schutz
 */
function save() {
    if (!isIdentified || !verifiedID) return;

    // SICHERHEITSABFRAGE: Abbruch bei korrupten Daten
    if (data.lxp === undefined || data.inventar === undefined) {
        console.error("Hüter-Alarm: Speichern abgebrochen! Daten-Integrität gefährdet (LXP oder Inventar fehlt).");
        return;
    }

    const savePacket = {
        lxp: data.lxp,
        inventar: data.inventar,
        evolutionStage: data.evolutionStage,
        hp: data.hp,
        maxHp: data.maxHp,
        stats: data.stats,
        x: data.x,
        y: data.y,
        name: data.name,
        lastSeen: Date.now()
    };

    // Backup & Cloud Sync
    localStorage.setItem('nest_backup_' + verifiedID, JSON.stringify(savePacket));
    db.ref('players/' + verifiedID).update(savePacket)
        .then(() => console.log("Hüter: Fortschritt gesichert."))
        .catch(err => console.error("Hüter-Fehler:", err));
}

/**
 * TRIGGER-SAVE: Exportiert die Funktion global, damit battle.js sie nutzen kann.
 */
function triggerAutoSave() {
    console.log("Hüter: Automatisches Speichern ausgelöst...");
    save();
}

// Global verfügbar machen
window.triggerAutoSave = triggerAutoSave;

// --- 3. INITIALISIERUNG (Startschuss) ---

/**
 * Lädt Daten und füttert andere Module
 */
async function loadUserData() {
    if (!verifiedID) {
        console.warn("Hüter: Keine VerifiedID gefunden. Warte auf Identifizierung...");
        return;
    }
    
    try {
        const snapshot = await db.ref('players/' + verifiedID).once('value');
        if (snapshot.exists()) {
            const dbData = snapshot.val();
            
            // Mapping mit Fallback auf Standardwerte
            data.lxp = dbData.lxp ?? 0;
            data.inventar = dbData.inventar || {};
            data.evolutionStage = dbData.evolutionStage || "Ei";
            data.stats = dbData.stats || data.stats;
            data.hp = dbData.hp ?? data.maxHp;
            
            console.log("Hüter: Daten aus der Cloud wiederhergestellt.");
            
            // Inventar informieren
            if (typeof updateInventoryUI === "function") {
                updateInventoryUI(data.inventar); 
            }
        }
    } catch (err) { 
        console.error("Hüter-Ladefehler:", err); 
    }
}

// --- 4. EVENT LISTENER ---

// Startschuss: Sobald das Dokument bereit ist
window.addEventListener('DOMContentLoaded', () => {
    // Falls die ID schon da ist (z.B. durch Redirect), laden wir sofort
    if (typeof verifiedID !== 'undefined' && verifiedID) {
        loadUserData();
    }
});

// Automatischer Fangnetz-Save alle 30 Sekunden
setInterval(save, 30000);
