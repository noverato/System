/**
 * 🌍 EnvironmentManager - The Nest: Overlord Edition 2026
 * Rolle: Verwaltung von Zeit (Tag/Nacht), Wetter und Biomen.
 */

window.EnvironmentManager = {
    // Zeit-Konfiguration (60 Minuten Zyklus)
    cycleDurationMs: 60 * 60 * 1000, 
    currentTime: 0.5, // 0..1 (0.0 = Mitternacht, 0.5 = Mittag)
    
    // Wetter-Zustände
    weather: {
        type: 'sunny', // 'sunny', 'cloudy', 'rainy', 'stormy'
        intensity: 0,
        targetIntensity: 0
    },

    // Biome-Definitionen (Basierend auf den 7 Klassen & User-Wünschen)
    biomes: {
        CENTRAL: { 
            name: "Hauptdorf", 
            color: 0x182820, 
            fogColor: 0x1b2b38, 
            treeDensity: 0.3, 
            ambient: "forest_ambient" 
        },
        RANGER: { 
            name: "Wipfelwacht", 
            color: 0x0a1a0a, 
            fogColor: 0x051005, 
            treeDensity: 0.9, // Sehr dicht
            terrain: "high_trees",
            pathLight: "Bogen",
            pathDark: "Messer & Gifte"
        },
        WARRIOR: { 
            name: "Ehrenhain", 
            color: 0x2d3d2d, 
            fogColor: 0x3d4d3d, 
            treeDensity: 0.5,
            terrain: "grove",
            pathLight: "Schwertmeister",
            pathDark: "Degen-Duellant"
        },
        DRUID: { 
            name: "Sumpf-Zuflucht", 
            color: 0x0d1f14, 
            fogColor: 0x1a2e21, 
            treeDensity: 0.7,
            terrain: "swamp",
            pathLight: "Heilung/Wachstum",
            pathDark: "Fäulnis/Parasiten"
        },
        GUARDIAN: { 
            name: "Felsfestung", 
            color: 0x2b2b2b, 
            fogColor: 0x1a1a1a, 
            treeDensity: 0.1,
            terrain: "mountains",
            pathLight: "Axt & Schild",
            pathDark: "Schwerer Stein-Schild"
        },
        SEEKER: { 
            name: "Schattenmarkt", 
            color: 0x1a1a2e, 
            fogColor: 0x0f0f1a, 
            treeDensity: 0.4,
            terrain: "underground_city",
            pathLight: "Glücksbringer",
            pathDark: "Meisterdieb"
        },
        HERMIT: { 
            name: "Leeren-Schrein", 
            color: 0x1a0f2e, 
            fogColor: 0x0a0515, 
            treeDensity: 0.05,
            terrain: "void_waste",
            pathLight: "Heiliger Avatar",
            pathDark: "Leeren-Exekutor"
        },
        WARDEN: { 
            name: "Sonnen-Zitadelle", 
            color: 0x2e2e1a, 
            fogColor: 0x1a1a0f, 
            treeDensity: 0.6,
            terrain: "highlands",
            pathLight: "Heiliger Souverän",
            pathDark: "Schatten-Souverän"
        }
    },

    init() {
        console.log("🌍 EnvironmentManager initialisiert.");
        this.updateTime();
        setInterval(() => this.updateTime(), 1000);
        setInterval(() => this.updateWeather(), 10000); 
        setInterval(() => this.smoothWeather(), 100); // Sanfter Übergang
    },

    updateTime() {
        const now = new Date();
        const secondsInHour = (now.getMinutes() * 60) + now.getSeconds();
        this.currentTime = secondsInHour / 3600; // 0..1 über 60 Minuten
        
        if (window.EventHub) {
            EventHub.emit('env:time:update', { time: this.currentTime });
        }
    },

    smoothWeather() {
        if (this.weather.intensity < this.weather.targetIntensity) {
            this.weather.intensity = Math.min(this.weather.targetIntensity, this.weather.intensity + 0.005);
        } else if (this.weather.intensity > this.weather.targetIntensity) {
            this.weather.intensity = Math.max(this.weather.targetIntensity, this.weather.intensity - 0.005);
        }
    },

    updateWeather() {
        const rand = Math.random();
        if (rand > 0.9) this.setWeather('stormy');
        else if (rand > 0.7) this.setWeather('rainy');
        else if (rand > 0.5) this.setWeather('cloudy');
        else this.setWeather('sunny');
    },

    setWeather(type) {
        this.weather.type = type;
        if (type === 'sunny') this.weather.targetIntensity = 0;
        else if (type === 'cloudy') this.weather.targetIntensity = 0.3;
        else if (type === 'rainy') this.weather.targetIntensity = 0.7;
        else if (type === 'stormy') this.weather.targetIntensity = 1.0;
        console.log(`🌦️ Wetter wechselt zu: ${type} (Intensität: ${this.weather.targetIntensity})`);
        
        if (window.EventHub) {
            EventHub.emit('env:weather:update', { type: type, intensity: this.weather.targetIntensity });
        }
    },

    // Berechnet Lichtfarbe basierend auf der Tageszeit
    getSkyColor() {
        const t = this.currentTime;
        // Einfache Sinus-Kurve für Tag/Nacht
        // Mittag (0.5) = Hellblau, Mitternacht (0.0/1.0) = Dunkelblau/Schwarz
        if (t < 0.25 || t > 0.75) return 0x050510; // Nacht
        if (t > 0.4 && t < 0.6) return 0x87ceeb; // Tag
        return 0xff7f50; // Sonnenauf/untergang
    },

    getSunIntensity() {
        const t = this.currentTime;
        return Math.max(0.1, Math.sin(t * Math.PI));
    }
};

window.EnvironmentManager.init();
