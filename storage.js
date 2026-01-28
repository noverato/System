/**
 * THE NEST: STORAGE & SYNC MODULE (storage.js)
 * Spezialisierung: Evolutions-Beständigkeit & Kapselung im Stats-Objekt.
 */

// --- 1. CORE SPEICHER-LOGIK ---

function save() {
    if (typeof verifiedID === 'undefined' || !verifiedID || !isIdentified) return;

    // SICHERHEITSABFRAGE
    if (data.lxp === undefined || data.inventar === undefined || data.stats === undefined) {
        console.error("Hüter-Alarm: Speichern abgebrochen! Datenstruktur (stats) beschädigt.");
        return;
    }

    // Wir strukturieren das Paket so, dass die Evolutions-Werte in stats landen
    const savePacket = {
        ...data,
        stats: {
            ...data.stats,
            currentClass: data.stats.currentClass || "Ei",
            currentPath: data.stats.currentPath || "Neutral",
            dailyMarkers: data.stats.dailyMarkers || 0,
            hiddenXP: data.stats.hiddenXP || 0,
            evolutionDate: data.stats.evolutionDate || Date.now()
        },
        lastSeen: Date.now()
    };

    db.ref('players/' + verifiedID).update(savePacket)
    .then(() => {
        console.log("💾 Hüter: Stats & Evolution sicher verwahrt.");
        if (typeof updateUI === "function") updateUI();
    })
    .catch(err => console.error("Hüter-Fehler beim Sichern:", err));

    localStorage.setItem('nest_backup_' + verifiedID, JSON.stringify(savePacket));
}

function triggerAutoSave() {
    save();
}
window.triggerAutoSave = triggerAutoSave;

// --- 2. DATEN-LADEN & EVOLUTION-SYNC ---

async function loadUserData() {
    if (typeof verifiedID === 'undefined' || !verifiedID) return;
    
    try {
        const snapshot = await db.ref('players/' + verifiedID).once('value');
        if (snapshot.exists()) {
            const dbData = snapshot.val();
            
            // Tiefen-Mapping für das stats-Objekt
            Object.assign(data, dbData);
            
            // Sicherstellen, dass das stats-Objekt und seine neuen Felder existieren
            data.stats = {
                ...(dbData.stats || {}),
                currentClass: dbData.stats?.currentClass || "Ei",
                currentPath: dbData.stats?.currentPath || "Neutral",
                dailyMarkers: dbData.stats?.dailyMarkers || 0,
                hiddenXP: dbData.stats?.hiddenXP || 0,
                evolutionDate: dbData.stats?.evolutionDate || Date.now()
            };
            
            console.log("📂 Hüter: Profil & Evolutions-Stats erfolgreich geladen.");
            
            if (typeof updateUI === "function") updateUI();
            if (typeof updateInventoryUI === "function") updateInventoryUI(data.inventar);
            
            // Die evolution.js kann nun direkt auf data.stats.hiddenXP etc. zugreifen
            if (typeof syncEvolutionState === "function") {
                syncEvolutionState(data);
            }
            
        } else {
            console.log("📂 Hüter: Kein Profil gefunden. Erschaffe neuen Helden...");
            save(); 
        }
    } catch (err) { 
        console.error("Hüter-Ladefehler:", err); 
    }
}

// --- 3. AUTOMATISIERUNG ---

setInterval(() => {
    if (typeof isIdentified !== 'undefined' && isIdentified) {
        save();
    }
}, 30000);
