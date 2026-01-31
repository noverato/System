/**
 * THE NEST: OVERLORD EDITION 2026
 * MODUL: battle.js (Rolle: Battle-Meister)
 * Fokus: Event-gesteuerter Kampfstart (Decoupled), ATB-System & Equipment-Sync
 */

const BattleEngine = {
    active: false,
    isPaused: false,
    player: null,
    enemy: null,
    playerATB: 0,
    enemyATB: 0,
    healsUsed: 0,
    maxHeals: 3,
    animationLock: false,

    // --- 1. INITIALISIERUNG ---
    startCombat(monsterData) {
        if (this.active || !monsterData) {
            console.warn("⚔️ Battle-Meister: Kampf-Start abgebrochen.");
            return;
        }

        console.log("⚔️ Battle-Meister: Kampf wird initialisiert:", monsterData.name);

        this.resetState();

        const weaponPower = data.equipment?.weapon?.power || 0;
        const armorValue = data.equipment?.armor?.value || 0;

        this.player = {
            name: data.name || "Held",
            hp: data.hp || 100,
            maxHp: data.maxHp || 100,
            mp: data.stats?.mp || 20,
            maxMp: data.stats?.mp || 20,
            atk: (isAdmin ? 999 : (data.stats?.atk || 10)) + weaponPower,
            def: (data.stats?.def || 5) + armorValue,
            spd: data.stats?.spd || 10,
            lvl: data.stats?.currentLevel || 1
        };

        this.enemy = {
            ...monsterData,
            hp: monsterData.hp,
            maxHp: monsterData.maxHp,
            isMonster: true
        };

        this.active = true;

        if (typeof toggleModal === 'function') {
            toggleModal('gameModal', true);
        } else {
            const modal = document.getElementById('gameModal');
            if (modal) modal.style.display = 'flex';
        }

        this.renderArena();
        this.startLoop();
        this.log(`Ein wildes ${this.enemy.name} erscheint!`, "white");
    },

    resetState() {
        this.playerATB = 0;
        this.enemyATB = 0;
        this.healsUsed = 0;
        this.animationLock = false;
        this.isPaused = false;
    },

    // --- 2. ATB ENGINE ---
    startLoop() {
        const tick = () => {
            if (!this.active) return;

            if (!this.isPaused && !this.animationLock) {
                this.playerATB += (this.player.spd * 0.07);
                this.enemyATB += (this.enemy.spd * 0.07);

                this.updateBars();

                if (this.playerATB >= 100) {
                    this.playerATB = 100;
                    this.toggleActionButtons(true);
                }

                if (this.enemyATB >= 100) {
                    this.enemyATB = 100;
                    this.executeEnemyTurn();
                }
            }
            requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
    },

    // --- 3. KAMPF-LOGIK ---
    executeAction(type) {
        if (this.playerATB < 100 || this.animationLock) return;

        this.animationLock = true;
        this.toggleActionButtons(false);

        if (type === 'attack') {
            this.calculateDamage(this.player, this.enemy, 'player');
        } else if (type === 'heal') {
            this.executeHeal();
        }

        this.playerATB = 0;
        this.checkVictoryCondition();

        if (this.active) {
            setTimeout(() => { this.animationLock = false; }, 600);
        }
    },

    executeEnemyTurn() {
        this.animationLock = true;
        this.toggleActionButtons(false);

        setTimeout(() => {
            if (!this.active) return;
            this.calculateDamage(this.enemy, this.player, 'enemy');
            this.enemyATB = 0;
            this.checkVictoryCondition();

            if (this.active) {
                this.animationLock = false;
            }
        }, 900);
    },

    calculateDamage(attacker, defender, side) {
        const variance = 0.85 + Math.random() * 0.3;
        let dmg = Math.floor((attacker.atk * variance) - (defender.def * 0.7));
        dmg = Math.max(1, dmg);

        defender.hp -= dmg;

        if (side === 'enemy') {
            data.hp = Math.max(0, Math.ceil(this.player.hp));
        }

        this.log(`${attacker.name} trifft für ${dmg} Schaden!`,
            side === 'player' ? '#4ade80' : '#ff4444');
        this.updateBars();
    },

    executeHeal() {
        if (this.healsUsed >= this.maxHeals) return;
        const healAmt = Math.floor(this.player.maxHp * 0.25);
        this.player.hp = Math.min(this.player.maxHp, this.player.hp + healAmt);
        data.hp = this.player.hp;
        this.healsUsed++;
        this.log(`✨ Heilung! +${healAmt} HP`, 'cyan');
        this.updateBars();
    },

    checkVictoryCondition() {
        if (this.enemy.hp <= 0) {
            this.enemy.hp = 0;
            this.active = false;
            this.win();
        } else if (this.player.hp <= 0) {
            this.player.hp = 0;
            this.active = false;
            this.lose();
        }
    },

    // --- 🔔 EVENT-HUB SIGNALISIERUNG ---
    win() {
        const reward = this.enemy.lxpReward || 50;
        this.log(`🏆 SIEG! +${reward} LXP erhalten!`, "gold");
        data.lxp += reward;

        if (typeof EventHub !== 'undefined') {
            EventHub.emit("battle:victory", { monster: this.enemy });
        }

        if (typeof updateUI === 'function') updateUI();
        if (typeof save === 'function') save();
        setTimeout(() => this.endCombat(), 2500);
    },

    lose() {
        this.log("💀 Du wurdest bezwungen...", "#ff4444");

        if (typeof EventHub !== 'undefined') {
            EventHub.emit("battle:defeat", { monster: this.enemy });
        }

        data.hp = data.maxHp;
        if (typeof updateUI === 'function') updateUI();
        if (typeof save === 'function') save();
        setTimeout(() => this.endCombat(), 2500);
    },

    endCombat() {
        // 🔥 HARTER RESET – OPTION A
        this.active = false;
        this.isPaused = false;
        this.animationLock = false;
        this.player = null;
        this.enemy = null;

        if (typeof EventHub !== 'undefined') {
            EventHub.emit("battle:escape");
        }

        const left = document.getElementById('modalLeft');
        if (left) left.style.backgroundImage = "none";

        if (typeof closeGeneralModal === 'function') {
            closeGeneralModal();
        } else if (typeof toggleModal === 'function') {
            toggleModal('gameModal', false);
        } else {
            const modal = document.getElementById('gameModal');
            if (modal) modal.style.display = 'none';
        }
    },

    // --- UI (UNVERÄNDERT) ---
    renderArena() { /* UNVERÄNDERT */ },
    updateBars() { /* UNVERÄNDERT */ },
    log(msg, color) { /* UNVERÄNDERT */ },
    toggleActionButtons(enabled) { /* UNVERÄNDERT */ }
};

/**
 * EVENT-SYSTEM INTEGRATION
 */
if (typeof EventHub !== 'undefined') {
    EventHub.on(EventHub.EVENTS.ENCOUNTER_START, (payload) => {
        const monster = payload.monster || payload;
        if (monster) BattleEngine.startCombat(monster);
    });
} else {
    console.error("❌ Battle-Meister: EventHub nicht gefunden!");
}

/** GLOBAL */
function executeCombatAction(type) {
    BattleEngine.executeAction(type);
}
