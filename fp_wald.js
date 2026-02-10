(() => {
    const GRID = 64;
    
    let scene = null;
    let camera = null;
    let renderer = null;
    let anim = null;
    let heading = 0;
    let gridX = 0;
    let gridY = 0;
    let fogEnabled = false;
    let avatar = null;
    let avatarNameTag = null; // Namensschild für den lokalen Spieler
    let weaponSprite = null;  // Waffe des lokalen Spielers
    let offhandSprite = null; // Schild/Zweitwaffe des lokalen Spielers
    
    // --- WAFFEN-KONFIGURATION (Hier kannst du die Werte manuell anpassen) ---
    let weaponOffsetX = -0.5;    // Rechts/Links (Höher = weiter rechts)
    let weaponOffsetY = 0.0;    // Hoch/Runter (Höher = weiter oben)
    let weaponOffsetZ = 1.5;    // Vorne/Hinten (Höher = weiter vorne)
    let weaponScale   = 1.0;    // Größe der Waffe (Standard ist 6.0, kleiner = zierlicher)
    let weaponRotDeg  = 45;     // Drehung in Grad (z.B. 45 für Spitze nach oben/vorne)
    // ------------------------------------------------------------------------
    
    let thirdPerson = true;
    let keyHandler = null;
    let lastStepAt = 0;
    const STEP_MS = 160;
    let presenceTimer = null;
    let syncTimer = null; // Neuer Timer für High-Frequency Sync
    let otherPlayers = new Map(); // Map<id, {sprite: Sprite, targetPos: Vector3, targetRot: number}>
    let collectibles = []; // Liste der sammelbaren Objekte
    let monsters = []; // Liste der Monster
    
    // --- PHYSIK & JUMPING ---
    let velocityY = 0;
    let isGrounded = true;
    const GRAVITY = -0.015;
    const JUMP_FORCE = 0.6; // Stärkerer Sprung für Berge
    let lastTime = performance.now();
    // ------------------------
    
    // Tag/Nacht & Wetter (Synchronisiert mit EnvironmentManager)
    let timeOfDay = 0.5; 
    let weatherType = 'sunny';
    let sunLight = null;
    let ambientLight = null;

    // --- EVENT LISTENERS FÜR UMWELT ---
    if (window.EventHub) {
        EventHub.on('env:time:update', (data) => {
            timeOfDay = data.time;
            updateEnvironment();
        });
    }

    function updateEnvironment() {
        if (!scene || !sunLight || !ambientLight) return;
        
        const env = window.EnvironmentManager;
        if (!env) return;

        const t = env.currentTime;
        const weather = env.weather;

        // 1. Himmel & Nebel
        const skyColor = new THREE.Color(env.getSkyColor());
        
        // Wetter-Einfluss auf Himmelsfarbe
        if (weather.intensity > 0) {
            skyColor.lerp(new THREE.Color(0x333333), weather.intensity * 0.7);
        }
        
        scene.background = skyColor;
        if (scene.fog) {
            scene.fog.color.copy(skyColor);
            // Nachts und bei Regen dichter Nebel
            const isNight = (t < 0.25 || t > 0.75);
            scene.fog.far = (isNight ? 400 : 800) * (1 - weather.intensity * 0.5);
        }

        // 2. Sonnenlicht & Schatten
        const intensity = env.getSunIntensity();
        sunLight.intensity = intensity * 1.5 * (1 - weather.intensity * 0.8);
        
        const angle = (t * Math.PI * 2) - (Math.PI / 2);
        const sunDist = 400;
        
        // Die Sonne kreist um den Spieler (für konstante Schattenqualität)
        const px = avatar ? avatar.position.x : 0;
        const pz = avatar ? avatar.position.z : 0;
        
        sunLight.position.set(
            px + Math.cos(angle) * sunDist, 
            Math.sin(angle) * sunDist, 
            pz + 100
        );
        
        // Target des Sonnenlichts folgt dem Spieler
        sunLight.target.position.set(px, 0, pz);
        sunLight.target.updateMatrixWorld();

        // 3. Ambient Light
        ambientLight.intensity = Math.max(0.1, intensity * 0.5) * (1 - weather.intensity * 0.4);

        // 4. Blitze bei Sturm
        if (weather.type === 'stormy' && Math.random() < 0.01) {
            const flash = new THREE.PointLight(0xffffff, 20, 2000);
            flash.position.set((Math.random()-0.5)*1000, 300, (Math.random()-0.5)*1000);
            scene.add(flash);
            setTimeout(() => scene.remove(flash), 50 + Math.random()*100);
        }
    }

    function updateCollectibles() {
        if (!avatar) return;
        for (const c of collectibles) {
            const dist = c.position.distanceTo(avatar.position);
            if (dist > DORMANT_RADIUS) {
                c.visible = true; // Sichtbar für GPU
                continue;
            }
            // Aktive Effekte für Collectibles (z.B. sanftes Schweben)
            c.position.y += Math.sin(Date.now() * 0.002) * 0.01;
        }
    }

    function updateBuildings() {
        if (!avatar) return;
        const buildings = window.FPGraphics ? FPGraphics.villageBuildings : [];
        for (const b of buildings) {
            const dist = b.position.distanceTo(avatar.position);
            // Gebäude außerhalb des Radius als dormant markieren
            b.userData.isDormant = (dist > DORMANT_RADIUS);
        }
    }

    const ENEMY_TYPES = {
        DAY: { icon: '🐺', name: 'Waldwolf', speed: 0.1, power: 1 },
        NIGHT: { icon: '👻', name: 'Nachtgeist', speed: 0.15, power: 2 }
    };

    const COLLECTIBLE_TYPES = [
        { id: 'res_gras', icon: '🌿', name: 'Gras' },
        { id: 'res_kraeuter', icon: '🌱', name: 'Kräuter' },
        { id: 'res_stock', icon: '🪵', name: 'Stock' }
    ];

    // Steuerungsvariablen
    let keys = {};
    let mouseX = 0;
    let targetHeading = 0;
    let targetPos = { x: 0, y: 0, z: 0 };
    let currentPos = { x: 0, y: 0, z: 0 };
    const MOVE_SPEED = 0.22; // Schnellere, flüssigere Bewegung
    const ROT_SPEED = 0.003; // Maus-Sensitivität
    const LERP_FACTOR = 0.1; // Für Smoothening (Snapback-Fix)

    // --- ANIMATION FSM (Finite State Machine) ---
    const ANIM_STATES = {
        IDLE: 'idle',
        WALK: 'walk',
        RUN: 'run',
        JUMP: 'jump',
        ATTACK: 'attack'
    };

    class AnimationFSM {
        constructor() {
            this.state = ANIM_STATES.IDLE;
            this.lastState = null;
        }

        update(moved, isGrounded, isAttacking) {
            this.lastState = this.state;

            if (!isGrounded) {
                this.state = ANIM_STATES.JUMP;
            } else if (isAttacking) {
                this.state = ANIM_STATES.ATTACK;
            } else if (moved) {
                this.state = keys['shift'] ? ANIM_STATES.RUN : ANIM_STATES.WALK;
            } else {
                this.state = ANIM_STATES.IDLE;
            }

            if (this.state !== this.lastState) {
                this.onStateChange(this.state, this.lastState);
            }
            
            // Kontinuierliche Animationseffekte
            this.animate();
        }

        animate() {
            if (!avatar || !avatar.children[0]) return;
            const sprite = avatar.children[0];
            const time = Date.now() * 0.005;

            if (this.state === ANIM_STATES.WALK || this.state === ANIM_STATES.RUN) {
                const bounce = Math.sin(time * (this.state === ANIM_STATES.RUN ? 2 : 1)) * 0.5;
                sprite.position.y = bounce;
            } else {
                sprite.position.y = 0;
            }
        }

        onStateChange(newState, oldState) {
            if (avatar && avatar.children[0]) {
                const sprite = avatar.children[0];
                switch(newState) {
                    case ANIM_STATES.IDLE:
                        sprite.scale.set(8, 8, 1);
                        break;
                    case ANIM_STATES.WALK:
                        sprite.scale.set(8.2, 8, 1);
                        break;
                    case ANIM_STATES.RUN:
                        sprite.scale.set(8.5, 8, 1);
                        break;
                    case ANIM_STATES.JUMP:
                        sprite.scale.set(7, 10, 1);
                        break;
                }
            }
        }
    }

    const animFSM = new AnimationFSM();

    function ensureThree() {
        if (window.THREE) return Promise.resolve(true);
        return new Promise(resolve => {
            const el = document.createElement('script');
            el.src = 'https://cdn.jsdelivr.net/npm/three@0.147.0/build/three.min.js';
            el.onload = () => resolve(true);
            el.onerror = () => resolve(false);
            document.head.appendChild(el);
        });
    }
    function rndSeed(s) {
        let x = s || 1234567;
        return () => (x = (x * 1103515245 + 12345) % 2147483648) / 2147483648;
    }
    function getQuality() {
        const pr = Math.max(1, Math.min(window.devicePixelRatio || 1, 3));
        const cores = (navigator.hardwareConcurrency || 4);
        const mem = (navigator.deviceMemory || 4);
        let q = 2;
        if (pr <= 1 && (cores <= 4 || mem <= 4)) q = 1;
        if (pr >= 2 && cores >= 8 && mem >= 8) q = 3;
        return q;
    }
    function onResize() {
        const host = document.getElementById('fpCanvas');
        if (!host || !camera || !renderer) return;
        const nw = host.clientWidth || window.innerWidth;
        const nh = host.clientHeight || window.innerHeight;
        if (nw === 0 || nh === 0) return;
        camera.aspect = nw / nh;
        camera.updateProjectionMatrix();
        renderer.setSize(nw, nh);
    }
    
    // --- HELFER-FUNKTIONEN FÜR GRAPHICS (Delegiert an FPGraphics) ---
    function enterHouse(type) {
        if (window.FPGraphics) FPGraphics.enterHouse(type, targetPos, avatar, scene, camera, (t) => {
            console.log(`Betrete Haus: ${t}`);
        });
    }

    function addOverlayCloseButton(overlay) {
        if (window.FPGraphics && FPGraphics.addOverlayCloseButton) {
            FPGraphics.addOverlayCloseButton(overlay);
        }
    }

    function spawnMonsters() {
        monsters.forEach(m => scene.remove(m));
        monsters = [];
        
        const count = 15;
        const range = 800;
        const villageSafeZone = 350; // Monster meiden das Dorf weiträumig

        // Bestimme Typ basierend auf Tageszeit
        const isNight = timeOfDay < 0.25 || timeOfDay > 0.75;
        const type = isNight ? ENEMY_TYPES.NIGHT : ENEMY_TYPES.DAY;

        for (let i = 0; i < count; i++) {
            let x, z;
            do {
                x = (Math.random() - 0.5) * range * 2;
                z = (Math.random() - 0.5) * range * 2;
            } while (Math.hypot(x, z) < villageSafeZone);

            const canvas = document.createElement('canvas');
            canvas.width = 64; canvas.height = 64;
            const ctx = canvas.getContext('2d');
            ctx.font = '48px Arial';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(type.icon, 32, 32);
            
            const tex = new THREE.CanvasTexture(canvas);
            const sm = new THREE.SpriteMaterial({ map: tex });
            const sprite = new THREE.Sprite(sm);
            const h = (window.FPGraphics ? FPGraphics.getGPUHeight(x, z) : 0);
            sprite.position.set(x, h + 4, z);
            sprite.scale.set(10, 10, 1);
            
            sprite.userData = { 
                isMonster: true, 
                name: type.name,
                hp: 100 * type.power,
                speed: type.speed,
                power: type.power,
                lastMove: Date.now()
            };
            
            scene.add(sprite);
            monsters.push(sprite);
        }
    }

    // --- AOI & DORMANT SETTINGS ---
    const AOI_RADIUS = 10;
    const DORMANT_RADIUS = 15;
    let eiActive = false;
    let groundValidated = false;
    // ------------------------------

    function updateMonsters() {
        if (!scene || !avatar) return;
        
        // --- EI HEIGHT VALIDATION (Spawn Fix) ---
        if (!groundValidated) {
            // Wir nutzen getGPUHeight, um die initiale Höhe zu bestimmen.
            // Falls GPGPU noch nicht bereit ist, wird automatisch die CPU-Höhe (15m am Start) genommen.
            const h = (window.FPGraphics ? FPGraphics.getGPUHeight(avatar.position.x, avatar.position.z) : 0);
            
            avatar.position.y = h + 4;
            targetPos.y = h + 4;
            currentPos.y = h + 4;
            groundValidated = true;
            eiActive = true;
            console.log("🥚 Ei-Position validiert auf Höhe:", h);
        }
        // ----------------------------------------

        const px = avatar.position.x;
        const pz = avatar.position.z;
        const villageSafeZone = 350;
        const deleteRadius = 150; // Radius um den Brunnen, in dem Monster gelöscht werden

        for (let i = monsters.length - 1; i >= 0; i--) {
            const m = monsters[i];
            const dx = px - m.position.x;
            const dz = pz - m.position.z;
            const dist = Math.hypot(dx, dz);

            // --- AOI CHECK: DORMANT STATE ---
            if (dist > DORMANT_RADIUS) {
                m.visible = true; // Sichtbar für GPU (statisches Bild)
                continue; // Simulation einfrieren (keine Bewegung, keine Ticks)
            }
            // --------------------------------

            const distToVillage = Math.hypot(m.position.x, m.position.z);

            // 0. KRITISCHE SAFE ZONE: Löschen wenn zu nah am Brunnen (0,0)
            if (distToVillage < deleteRadius) {
                scene.remove(m);
                monsters.splice(i, 1);
                continue;
            }

            // 1. Meiden des Dorfzentrums (Sicherheitszone)
            if (distToVillage < villageSafeZone) {
                const fleeX = m.position.x / distToVillage;
                const fleeZ = m.position.z / distToVillage;
                m.position.x += fleeX * m.userData.speed * 1.5;
                m.position.z += fleeZ * m.userData.speed * 1.5;
            } 
            // 2. Verfolgen wenn nah genug (aber nur außerhalb des Dorfes)
            else if (dist < 150) {
                const vx = (dx / dist) * m.userData.speed * 0.8;
                const vz = (dz / dist) * m.userData.speed * 0.8;
                m.position.x += vx;
                m.position.z += vz;
            }

            // Höhe anpassen (An das Terrain binden)
            const groundH = (window.FPGraphics ? FPGraphics.getGPUHeight(m.position.x, m.position.z) : 0);
            m.position.y = groundH + 4;

            // Kampf-Trigger bei Berührung
            if (dist < 8) {
                triggerCombat(m);
            }
        }
    }

    function triggerCombat(monster) {
        // Monster entfernen
        scene.remove(monster);
        monsters = monsters.filter(m => m !== monster);
        
        document.exitPointerLock();
        
        // Arena-Logik nutzen: Kampf direkt starten
        if (window.Arena && typeof Arena.startMonsterFight === 'function') {
            Arena.startMonsterFight();
        } else {
            // Fallback falls Arena nicht geladen
            const modal = document.getElementById('fpModal');
            if (modal) {
                alert("Ein wildes Monster greift an!");
            }
        }
    }

    function spawnCollectibles() {
        // Alte entfernen falls vorhanden
        collectibles.forEach(obj => scene.remove(obj));
        collectibles = [];

        const count = 40; // Anzahl der Objekte im Wald
        const range = 600;

        for (let i = 0; i < count; i++) {
            const type = COLLECTIBLE_TYPES[Math.floor(Math.random() * COLLECTIBLE_TYPES.length)];
            const x = (Math.random() - 0.5) * range * 2;
            const z = (Math.random() - 0.5) * range * 2;

            // Nicht im Dorfzentrum spawnen
            if (Math.hypot(x, z) < 80) continue;

            const canvas = document.createElement('canvas');
            canvas.width = 64; canvas.height = 64;
            const ctx = canvas.getContext('2d');
            ctx.font = '40px Arial';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(type.icon, 32, 32);
            
            const tex = new THREE.CanvasTexture(canvas);
            const sm = new THREE.SpriteMaterial({ map: tex });
            const sprite = new THREE.Sprite(sm);
            const h = (window.FPGraphics ? FPGraphics.getGPUHeight(x, z) : 0);
            sprite.position.set(x, h + 2, z);
            sprite.scale.set(8, 8, 1);
            
            sprite.userData = { 
                isCollectible: true, 
                id: type.id, 
                name: type.name,
                icon: type.icon,
                radius: 4 // Kollisionsradius
            };
            
            scene.add(sprite);
            collectibles.push(sprite);
        }
    }

    function collectItem(obj) {
        if (!window.data) return;
        if (!window.data.inventar) window.data.inventar = {};
        
        const id = obj.userData.id;
        window.data.inventar[id] = (window.data.inventar[id] || 0) + 1;
        
        // Feedback-Effekt
        const startY = obj.position.y;
        let t = 0;
        const animInterval = setInterval(() => {
            t += 0.1;
            obj.position.y += 0.5;
            obj.scale.multiplyScalar(0.9);
            if (t > 1) {
                clearInterval(animInterval);
                scene.remove(obj);
                const idx = collectibles.indexOf(obj);
                if (idx > -1) collectibles.splice(idx, 1);
            }
        }, 30);

        // UI Update falls nötig
        if (typeof updateUI === 'function') updateUI();
        if (typeof saveStep === 'function') saveStep();
        
        // Kleiner Log-Eintrag oder Effekt?
        console.log(`Gesammelt: ${obj.userData.name}`);
    }

    function updateAvatarWeapons() {
        if (!scene || !avatar) return;

        // Alte Waffen entfernen (sowohl aus der Scene als auch vom Avatar-Parent)
        if (weaponSprite) { 
            if (weaponSprite.parent) weaponSprite.parent.remove(weaponSprite);
            scene.remove(weaponSprite); 
            weaponSprite = null; 
        }
        if (offhandSprite) { 
            if (offhandSprite.parent) offhandSprite.parent.remove(offhandSprite);
            scene.remove(offhandSprite); 
            offhandSprite = null; 
        }

        if (!window.data || !window.data.equipment) return;

        const loader = new THREE.TextureLoader();

        // Helfer zum Erstellen einer Waffe als 3D-Mesh (statt Sprite)
        const createWepSprite = (itemId, isOffhand) => {
            const itemData = (typeof window.getItemById === 'function') ? window.getItemById(itemId) : null;
            if (!itemData) return null;

            const canvas = document.createElement('canvas');
            canvas.width = 128;
            canvas.height = 128;
            const ctx = canvas.getContext('2d');
            ctx.font = '80px Arial';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(itemData.emoji || '⚔️', 64, 64);

            const tex = new THREE.CanvasTexture(canvas);
            // MeshBasicMaterial statt SpriteMaterial, damit die Waffe eine feste 3D-Ausrichtung hat
            const mat = new THREE.MeshBasicMaterial({ 
                map: tex, 
                transparent: true, 
                side: THREE.DoubleSide,
                alphaTest: 0.5 // Verhindert unschöne Ränder
            });
            
            // PlaneGeometry statt Sprite
            const geo = new THREE.PlaneGeometry(weaponScale * 6, weaponScale * 6);
            const mesh = new THREE.Mesh(geo, mat);
            
            return mesh;
        };

        if (data.equipment.weapon) {
            weaponSprite = createWepSprite(data.equipment.weapon, false);
            if (weaponSprite) {
                // Basis-Rotation: Das Mesh so drehen, dass die "Seite" nach vorne zeigt (Spitze nach vorne)
                // Wir drehen es um 90 Grad um die Y-Achse, damit die X-Achse der Plane nach vorne zeigt.
                weaponSprite.rotation.y = Math.PI / 2;
                
                // Die benutzerdefinierte Drehung (weaponRotDeg) anwenden (Spitze nach oben/unten)
                weaponSprite.rotation.z = (weaponRotDeg * Math.PI) / 180;
                
                // Parenting
                avatar.add(weaponSprite);
                
                // Positionierung relativ zum Avatar
                weaponSprite.position.set(weaponOffsetX, weaponOffsetY, weaponOffsetZ);
            }
        }
    }
})();