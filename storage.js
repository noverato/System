/**
 * THE NEST: STORAGE & SYNC MODULE (storage.js)
 * Alleinige Instanz für Firebase, Auth-Sync und Daten-Persistenz.
 * V1-Zentralisierung: Ausgelagert aus der Master-HTML.
 */

// --- 1. FIREBASE & AUTH INITIALISIERUNG ---
// Firebase wird hier zentral verwaltet (Config aus HTML-Vorgabe)
if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}
const db = firebase.database();

// --- 2. GLOBALE DATEN-VERWALTUNG ---
// Diese Variablen steuern den Status des Nests
window.isIdentified = false;
window.twitchToken = "";
window.verifiedID = "";
window.onlinePlayers = {};
window.isAdmin = false;

// Das zentrale Daten-Objekt (Initialzustand)
window.data = { 
    name: "Held", 
    x: 960, 
    y: 540, 
    lxp: 0, 
    hp: 100, 
    maxHp: 100, 
    stats: { 
        atk: 10, 
        def: 10, 
        currentLevel: 1, 
        className: "Ei",
        currentPath: "Neutral",
        dailyMarkers: 0,
        hiddenXP: 0,
        evolutionDate: Date.now()
    }, 
    inventar: {}, 
    equipment: {}, 
    lxpBuffer: 0 
};

// --- 3. CORE SPEICHER-LOGIK ---

/**
 * Schreibt den aktuellen Stand des globalen 'data' Objekts in die Firebase.
 */
function save() {
    if (!window.isIdentified || !window.verifiedID) return;

    // Sicherheitsabfrage: Abbruch bei Daten-Korruption
    if (data.lxp === undefined || data.stats === undefined) {
        console.error("Hüter-Alarm: Speichern abgebrochen! Datenstruktur unvollständig.");
        return;
    }

    const savePacket = {
        ...data,
        lastSeen: Date.now()
    };

    db.ref('players/' + window.verifiedID).update(savePacket)
    .then(() => {
        console.log("💾 Hüter: Fortschritt gesichert.");
        if (typeof updateUI === "function") updateUI();
    })
    .catch(err => console.error("Hüter-Fehler beim Sichern:", err));

    localStorage.setItem('nest_backup_' + window.verifiedID, JSON.stringify(savePacket));
}

function triggerAutoSave() {
    save();
}
window.triggerAutoSave = triggerAutoSave;

// --- 4. DATEN-LADEN & TWITCH-SYNC ---

/**
 * Lädt Spielerdaten aus der Cloud und mappt sie auf das globale Objekt.
 */
async function loadUserData() {
    if (!window.verifiedID) return;
    
    try {
        const snapshot = await db.ref('players/' + window.verifiedID).once('value');
        if (snapshot.exists()) {
            const dbData = snapshot.val();
            
            // Tiefen-Mapping (Sicherstellung der stats-Struktur)
            Object.assign(data, dbData);
            data.stats = { ...(data.stats || {}), ...dbData.stats };
            
            console.log("📂 Hüter: Profil erfolgreich geladen.");
            
            if (typeof updateUI === "function") updateUI();
            if (typeof renderInventoryUI === "function") renderInventoryUI();
        } else {
            console.log("📂 Hüter: Neues Profil wird angelegt.");
            save(); 
        }
    } catch (err) { 
        console.error("Hüter-Ladefehler:", err); 
    }
}

/**
 * Übernimmt die Echtzeit-Synchronisation aller Spieler auf der Karte.
 */
function initRealtimeSync() {
    db.ref('players').on('value', snap => {
        window.onlinePlayers = snap.val() || {};
        if (typeof renderPlayers === 'function') {
            renderPlayers(window.onlinePlayers);
        }
    });
}

// --- 5. AUTOMATISIERUNG & CLEANUP ---

// Intervall-Save alle 30 Sekunden
setInterval(() => {
    if (window.isIdentified) save();
}, 30000);

// Macht die Hauptfunktionen global für die HTML-Event-Handler verfügbar
window.loadUserData = loadUserData;
window.save = save;
window.initRealtimeSync = initRealtimeSync;
