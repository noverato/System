/**
 * THE NEST: STORAGE & SYNC MODULE (storage.js)
 * Phase A: System-Stabilisierung & Firebase-Zentralisierung.
 * Ziel: Lauffähigkeit ohne F12-Fehler.
 */

// 1. FIREBASE INITIALISIERUNG (Defensiv gegen Doppel-Initialisierung)
// Die Config wird hier festgeschrieben, da sie in der HTML oft zu spät oder doppelt kommt.
const storageFirebaseConfig = { 
    apiKey: "AIzaSyCKNXJ-ouAOAcLr5ut-EemWQI8_zJxhqa8", 
    authDomain: "thenest-81de6.firebaseapp.com", 
    databaseURL: "https://thenest-81de6-default-rtdb.firebaseio.com", 
    projectId: "thenest-81de6" 
};

// Schutz vor "Redeclaration of const db" und "Firebase App already exists"
if (!firebase.apps.length) {
    firebase.initializeApp(storageFirebaseConfig);
}

// Global verfügbare Datenbank-Instanz (var statt const/let zur Vermeidung von Redeclaration-Fehlern)
if (typeof window.db === "undefined") {
    window.db = firebase.database();
}

// 2. GLOBALE VARIABLEN ABSICHERN (Nur initialisieren, wenn sie nicht existieren)
window.isIdentified = window.isIdentified || false;
window.twitchToken = window.twitchToken || "";
window.verifiedID = window.verifiedID || "";
window.onlinePlayers = window.onlinePlayers || {};
window.isAdmin = window.isAdmin || false;

// Zentrales Daten-Objekt (Sicherer Fallback)
if (!window.data) {
    window.data = { 
        name: "Held", x: 960, y: 540, lxp: 0, hp: 100, maxHp: 100, 
        stats: { atk: 10, def: 10, currentLevel: 1, className: "Ei" }, 
        inventar: {}, equipment: {}, lxpBuffer: 0 
    };
}

// 3. ÖFFENTLICHE API (Funktionen für die HTML)

/**
 * Lädt Spielerdaten aus der Firebase.
 */
window.loadUserData = async function() {
    if (!window.verifiedID) return;
    try {
        const snap = await window.db.ref('players/' + window.verifiedID).once('value');
        if (snap.exists()) {
            const dbData = snap.val();
            // Daten-Merge: Cloud-Werte überschreiben lokale Standardwerte
            Object.assign(window.data, dbData);
            console.log("📂 Storage: Profil geladen (" + window.verifiedID + ")");
        } else {
            console.log("📂 Storage: Neues Profil wird bei erstem Save erstellt.");
        }
        // UI-Update-Trigger (falls vorhanden)
        if (typeof updateUI === "function") updateUI();
    } catch (e) {
        console.error("❌ Storage Load Error:", e);
    }
};

/**
 * Speichert den aktuellen Status in die Firebase.
 */
window.save = function() {
    if (!window.isIdentified || !window.verifiedID) return;
    
    const savePacket = {
        ...window.data,
        lastSeen: Date.now()
    };

    window.db.ref('players/' + window.verifiedID).update(savePacket)
        .then(() => console.log("💾 Storage: Fortschritt gespeichert."))
        .catch(e => console.error("❌ Storage Save Error:", e));
    
    // Lokales Backup
    localStorage.setItem('nest_backup_' + window.verifiedID, JSON.stringify(savePacket));
};

/**
 * Aktiviert den Realtime-Sync für die Map.
 */
window.initRealtimeSync = function() {
    if (!window.db) return;
    window.db.ref('players').on('value', snap => {
        window.onlinePlayers = snap.val() || {};
        // Render-Trigger (falls vorhanden)
        if (typeof renderPlayers === "function") {
            renderPlayers(window.onlinePlayers);
        }
    });
    console.log("📡 Storage: Realtime-Sync aktiv.");
};

// 4. AUTOMATISIERUNG
// Sicherheits-Intervall alle 30 Sekunden
setInterval(() => {
    if (window.isIdentified) window.save();
}, 30000);

// triggerAutoSave Alias für Kompatibilität mit battle.js
window.triggerAutoSave = window.save;
