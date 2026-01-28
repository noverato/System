/**
 * THE NEST: STORAGE & SYNC MODULE (storage.js)
 * Hüter der Beständigkeit - Zentralisierte Version.
 * Greift auf die globalen Variablen der Master-HTML zu.
 */

// --- 1. CORE SPEICHER-LOGIK ---

/**
 * Zentrale Save-Funktion mit Korruptions-Schutz.
 * Schreibt direkt das globale 'data' Objekt in die Firebase.
 */
function save() {
    // Zugriff auf globale Variablen der HTML (verifiedID, isIdentified)
    if (typeof verifiedID === 'undefined' || !verifiedID || !isIdentified) return;

    // SICHERHEITSABFRAGE: Abbruch bei korrupten Daten
    if (data.lxp === undefined || data.inventar === undefined) {
        console.error("Hüter-Alarm: Speichern abgebrochen! Globales 'data' Objekt unvollständig.");
        return;
    }

    // Firebase Sync (nutzt die globale 'db' Instanz)
    db.ref('players/' + verifiedID).update({
        ...data,
        lastSeen: Date.now()
    })
    .then(() => {
        console.log("💾 Hüter: Fortschritt global festgeschrieben.");
        // HUD nach dem Speichern aktualisieren
        if (typeof updateUI === "function") updateUI();
    })
    .catch(err => console.error("Hüter-Fehler beim Sichern:", err));

    // Lokales Backup als zusätzliche Sicherheit
    localStorage.setItem('nest_backup_' + verifiedID, JSON.stringify(data));
}

/**
 * TRIGGER-SAVE: Kann von überall (battle.js, inventar.js) aufgerufen werden.
 */
function triggerAutoSave() {
    save();
}

// Global verfügbar machen für andere Skripte
window.triggerAutoSave = triggerAutoSave;

// --- 2. DATEN-LADEN & SYNCHRONISATION ---

/**
 * Lädt die Cloud-Daten in das globale 'data' Objekt.
 */
async function loadUserData() {
    if (typeof verifiedID === 'undefined' || !verifiedID) return;
    
    try {
        const snapshot = await db.ref('players/' + verifiedID).once('value');
        if (snapshot.exists()) {
            const dbData = snapshot.val();
            
            // Globales Objekt befüllen (Spread-Operator erhält bestehende lokale Werte)
            // Wir mappen die Cloud-Daten direkt auf das globale 'data'
            Object.assign(data, dbData);
            
            console.log("📂 Hüter: Profil erfolgreich geladen.");
            
            // DIE BRÜCKE: HUD und Inventar-UI aktualisieren
            if (typeof updateUI === "function") updateUI();
            if (typeof updateInventoryUI === "function") updateInventoryUI(data.inventar);
            
        } else {
            console.log("📂 Hüter: Kein Cloud-Profil gefunden. Initialer Save...");
            save(); 
        }
    } catch (err) { 
        console.error("Hüter-Ladefehler:", err); 
    }
}

// --- 3. AUTOMATISIERUNG ---

/**
 * Ein Sicherheits-Timer, der alle 30 Sekunden den aktuellen Stand sichert.
 */
setInterval(() => {
    if (typeof isIdentified !== 'undefined' && isIdentified) {
        save();
    }
}, 30000);
