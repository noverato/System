/**
 * THE NEST: GLOBAL MARKET STATE
 * Verwaltet die simulierten Umlaufmengen im Hain.
 */
const MarketState = {
    // Initialmengen (Idealbestände)
    config: {
        defaultIdeal: 100,
        damping: 0.8, // Wie stark reagiert der Preis? (0.1 = schwach, 1.5 = extrem)
        minPriceMult: 0.2, // Preis fällt nie unter 20%
        maxPriceMult: 5.0  // Preis steigt nie über 500%
    },

    /**
     * Holt die Umlaufmenge eines Items aus dem LocalStorage
     */
    getCirculation(itemID) {
        const globalCounts = JSON.parse(localStorage.getItem('nest_market_global')) || {};
        // Startwert ist immer der Idealbestand, damit Preise stabil starten
        return globalCounts[itemID] || this.config.defaultIdeal;
    },

    /**
     * Aktualisiert die Umlaufmenge (wird bei Drop, Kauf, Verkauf getriggert)
     */
    updateCirculation(itemID, amount) {
        let globalCounts = JSON.parse(localStorage.getItem('nest_market_global')) || {};
        let current = globalCounts[itemID] || this.config.defaultIdeal;
        
        globalCounts[itemID] = Math.max(1, current + amount);
        localStorage.setItem('nest_market_global', JSON.stringify(globalCounts));
        
        console.log(`⚖️ Markt-Update: ${itemID} Umlauf jetzt ${globalCounts[itemID]}`);
    }
};

window.MarketState = MarketState;
