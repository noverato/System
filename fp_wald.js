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
        console.log("[FPWald] Überprüfe Three.js Verfügbarkeit...");
        if (window.THREE && window.THREE.GLTFLoader && window.THREE.GPUComputationRenderer) {
            console.log("[FPWald] Three.js und Plugins bereits geladen.");
            return Promise.resolve(true);
        }
        return new Promise(resolve => {
            console.log("[FPWald] Warte auf Three.js Plugins...");
            const timeout = setTimeout(() => {
                console.error("[FPWald] Timeout beim Laden von Three.js Plugins!");
                resolve(false);
            }, 10000);

            const check = () => {
                if (window.THREE && window.THREE.GLTFLoader && window.THREE.GPUComputationRenderer) {
                    clearTimeout(timeout);
                    console.log("[FPWald] Three.js Plugins geladen.");
                    resolve(true);
                } else {
                    setTimeout(check, 100);
                }
            };
            check();
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
    const AOI_RADIUS = 15;
    const DORMANT_RADIUS = 20;
    let eiActive = false;
    let groundValidated = false;
    // ------------------------------

    function updateMonsters() {
        if (!scene || !avatar) {
            console.warn("[FPWald] updateMonsters: Szene oder Avatar fehlt.", { scene: !!scene, avatar: !!avatar });
            return;
        }
        
        // --- EI HEIGHT VALIDATION (Spawn Fix) ---
        if (!groundValidated) {
            console.log("[FPWald] Starte initiale Höhen-Validierung...");
            
            // Avatar-Position anpassen
            const ax = avatar.position.x;
            const az = avatar.position.z;
            
            // Wir nutzen getRaycastHeight für maximale Präzision am Startpunkt
            const h = (window.FPGraphics && typeof FPGraphics.getRaycastHeight === 'function') 
                ? FPGraphics.getRaycastHeight(ax, az, 15)
                : (window.FPGraphics ? FPGraphics.getGPUHeight(ax, az) : 15);
            
            avatar.position.y = h + 4;
            targetPos.y = h + 4;
            currentPos.y = h + 4;
            groundValidated = true;
            eiActive = true;
            console.log("🥚 Ei-Position validiert auf Höhe:", h, "an X:", ax, "Z:", az);
            console.log("[FPWald] Ground-Validation ERFOLGREICH abgeschlossen.");
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

            // Höhe anpassen (An das Terrain binden via Raycast für Präzision)
            const gpuH = (window.FPGraphics ? FPGraphics.getGPUHeight(m.position.x, m.position.z) : 0);
            const groundH = (window.FPGraphics && typeof FPGraphics.getRaycastHeight === 'function')
                ? FPGraphics.getRaycastHeight(m.position.x, m.position.z, gpuH)
                : gpuH;
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

    function initAdminUI() {
        // Götter-Menü Button hinzufügen
        const overlordBtn = document.createElement('button');
        overlordBtn.className = 'btn-action';
        overlordBtn.style.position = 'absolute';
        overlordBtn.style.top = '80px';
        overlordBtn.style.left = '20px';
        overlordBtn.style.background = 'linear-gradient(135deg, #ff0000, #8b0000)';
        overlordBtn.style.zIndex = '1000';
        overlordBtn.innerText = '🛠 GÖTTER-MENÜ';
        overlordBtn.onclick = () => {
            if (typeof openAdminPanel === 'function') {
                const overlay = document.getElementById('fpInventoryOverlay');
                if (overlay) {
                    overlay.innerHTML = '<h2 style="color:red; border-bottom:2px solid red;">Götter-Menü (Overlord)</h2><div id="adminContent"></div><button class="btn-action" style="margin-top:20px; width:100%;" data-action="closeParent">Schließen</button>';
                    overlay.style.display = 'block';
                    const fakeModalLeft = document.getElementById('adminContent');
                    const realModalLeft = document.getElementById('modalLeft');
                    if (realModalLeft) {
                        const observer = new MutationObserver(() => {
                            if (overlay.style.display === 'block') {
                                fakeModalLeft.innerHTML = realModalLeft.innerHTML;
                            }
                        });
                        observer.observe(realModalLeft, { childList: true, subtree: true });
                        openAdminPanel();
                        setTimeout(() => observer.disconnect(), 1000);
                    }
                }
            }
        };
        const fpModal = document.getElementById('fpModal');
        if (fpModal) fpModal.appendChild(overlordBtn);
    }

    function checkInteractions() {
        if (!avatar) return;
        
        let interactUI = document.getElementById('fpInteractUI');
        const modal = document.getElementById('fpModal');
        
        // Hilfsfunktion zur UI-Erstellung
        const ensureUI = () => {
            if (!interactUI && modal) {
                interactUI = document.createElement('div');
                interactUI.id = 'fpInteractUI';
                interactUI.style.cssText = `
                    position: absolute; bottom: 20%; left: 50%;
                    transform: translateX(-50%); background: rgba(0,0,0,0.7);
                    color: white; padding: 15px 25px; border-radius: 10px;
                    font-family: 'Cinzel', serif; font-size: 20px;
                    border: 2px solid #ffd700; z-index: 1000;
                    text-align: center; pointer-events: none;
                `;
                modal.appendChild(interactUI);
            }
            return interactUI;
        };

        if (window.FPGraphics && FPGraphics.isInterior) {
            let pos = { x: 5000, y: 0, z: 5000 }; // Fallback
            if (FPGraphics.currentInterior === 'inn') pos = { x: 5200, y: 0, z: 5200 };
            if (FPGraphics.currentInterior === 'market') pos = { x: 5400, y: 0, z: 5400 };
            
            const dx = avatar.position.x - pos.x;
            const dz = avatar.position.z - pos.z;
            const size = FPGraphics.currentInterior === 'market' ? 60 : 50;
            
            // Verlassen-Prompt: Nur in der Nähe der Tür (vorne bei z ≈ size)
            if (dz > size - 15 && Math.abs(dx) < 15) {
                const ui = ensureUI();
                if (ui) {
                    ui.innerHTML = `Drücke <span style="color:#ffd700">[E]</span> zum VERLASSEN`;
                    ui.style.display = 'block';
                }
                window._lastInteract = () => enterHouse();
            } else {
                // NPC-Interaktionen im Interior
                let nearNPC = false;
                if (FPGraphics.currentInterior === 'smithy') {
                    const d = Math.hypot(avatar.position.x - (pos.x + 20), avatar.position.z - (pos.z + 20));
                    if (d < 25) nearNPC = true;
                } else if (FPGraphics.currentInterior === 'inn') {
                    const d = Math.hypot(avatar.position.x - pos.x, avatar.position.z - (pos.z - 30));
                    if (d < 25) nearNPC = true;
                } else if (FPGraphics.currentInterior === 'market') {
                    const d = Math.hypot(avatar.position.x - pos.x, avatar.position.z - (pos.z - 40));
                    if (d < 25) nearNPC = true;
                }

                if (nearNPC) {
                    const ui = ensureUI();
                    if (ui) {
                        let actionName = 'REDEN';
                        if (FPGraphics.currentInterior === 'smithy') actionName = 'SCHMIEDEN';
                        if (FPGraphics.currentInterior === 'market') actionName = 'HANDELN';
                        ui.innerHTML = `Drücke <span style="color:#ffd700">[E]</span> zum ${actionName}`;
                        ui.style.display = 'block';
                    }
                    window._lastInteract = () => {
                        const overlay = document.getElementById('fpMarketOverlay');
                        if (FPGraphics.currentInterior === 'smithy') {
                            if (overlay) {
                                overlay.style.display = 'block';
                                overlay.innerHTML = '<div id="crafting_container"></div>';
                                addOverlayCloseButton(overlay);
                                if (window.CraftingUI) window.CraftingUI.render('crafting_container');
                            }
                        } else if (FPGraphics.currentInterior === 'market') {
                            if (overlay) {
                                overlay.style.display = 'block';
                                overlay.innerHTML = '<div id="market_container"></div>';
                                addOverlayCloseButton(overlay);
                                if (typeof renderMarketplace === 'function') renderMarketplace('market_container');
                            }
                        } else {
                            const houseOverlay = document.getElementById('houseOverlay');
                            if (houseOverlay) {
                                houseOverlay.style.display = 'block';
                                houseOverlay.innerHTML = `
                                    <div style="background: rgba(0,0,0,0.9); padding: 30px; border: 3px solid #ffd700; border-radius: 15px; color: white; max-width: 500px; text-align: center;">
                                        <h2 style="color: #ffd700; margin-top: 0;">Der Wirt</h2>
                                        <p style="font-size: 1.2em; line-height: 1.6;">"Willkommen im Goldenen Krug, Wanderer! Setz dich, ruh dich aus. Ein Becher Met kostet nur 5 Gold."</p>
                                        <button id="closeChat" class="btn-action" style="background: #ffd700; border: none; padding: 10px 20px; border-radius: 5px; cursor: pointer; font-weight: bold;" data-action="closeChat">Schließen</button>
                                    </div>
                                `;
                                // document.getElementById('closeChat').onclick = ... (Entfernt für CSP)
                            }
                        }
                    };
                } else if (interactUI) {
                    interactUI.style.display = 'none';
                    window._lastInteract = null;
                }
            }
            return;
        }

        const px = avatar.position.x;
        const pz = avatar.position.z;
        
        // 1. KOMPASS UPDATE
        updateCompass(px, pz);

        let found = null;

        // Gebäude-Interaktion
        const buildings = window.FPGraphics ? FPGraphics.villageBuildings : [];
        buildings.forEach(b => {
            const d = Math.hypot(b.position.x - px, b.position.z - pz);
            if (d < 65) found = { name: b.userData.name, callback: b.userData.callback };
        });

        // Sammelobjekt-Interaktion
        if (!found) {
            collectibles.forEach(c => {
                const d = Math.hypot(c.position.x - px, c.position.z - pz);
                if (d < 15) found = { name: c.userData.name, callback: () => collectItem(c) };
            });
        }

        if (found) {
            const ui = ensureUI();
            if (ui) {
                ui.innerHTML = `Drücke <span style="color:#ffd700">[E]</span> für ${found.name}`;
                ui.style.display = 'block';
            }
            window._lastInteract = found.callback;
        } else {
            if (interactUI) {
                interactUI.style.display = 'none';
            }
            window._lastInteract = null;
        }
    }

    function updateCompass(px, pz) {
        let compass = document.getElementById('fpCompassHUD');
        if (!compass) {
            compass = document.createElement('div');
            compass.id = 'fpCompassHUD';
            compass.style.position = 'absolute';
            compass.style.top = '20px';
            compass.style.left = '50%';
            compass.style.transform = 'translateX(-50%)';
            compass.style.width = '300px';
            compass.style.height = '40px';
            compass.style.background = 'rgba(0,0,0,0.5)';
            compass.style.border = '1px solid rgba(255,215,0,0.3)';
            compass.style.borderRadius = '5px';
            compass.style.overflow = 'hidden';
            compass.style.display = 'flex';
            compass.style.alignItems = 'center';
            compass.style.justifyContent = 'center';
            compass.style.zIndex = '1000';
            document.getElementById('fpModal').appendChild(compass);
        }

        // Winkel zum Dorf (0,0)
        const angleToVillage = Math.atan2(0 - px, 0 - pz);
        // Relative Rotation (Heading vs Dorf)
        let diff = angleToVillage - heading;
        while (diff < -Math.PI) diff += Math.PI * 2;
        while (diff > Math.PI) diff -= Math.PI * 2;

        // Himmelsrichtungen basierend auf heading
        const dirs = ['N', 'O', 'S', 'W'];
        const hDeg = (heading * 180 / Math.PI) % 360;
        const dirIdx = Math.round(((hDeg < 0 ? hDeg + 360 : hDeg) / 90)) % 4;
        const curDir = dirs[dirIdx];

        // Zeichne Kompass-Inhalt
        const offset = (diff / Math.PI) * 150; // Versatz im 300px breiten Kompass
        compass.innerHTML = `
            <div style="position:absolute; width:2px; height:100%; background:gold; left:50%; transform:translateX(-50%); z-index:2; opacity:0.5;"></div>
            <div style="font-family:monospace; color:white; font-size:18px; letter-spacing:5px;">
                ${dirs[(dirIdx+3)%4]} . ${curDir} . ${dirs[(dirIdx+1)%4]}
            </div>
            <div style="position:absolute; left:calc(50% + ${offset}px); font-size:20px; transition: left 0.2s ease-out;">🏠</div>
        `;
    }

    function teleportToVillage() {
        if (!window.data) return;
        
        const now = new Date();
        const todayStr = now.toISOString().split('T')[0]; // YYYY-MM-DD
        
        // Initialisiere Teleport-Stats falls nicht vorhanden
        if (window.data && !window.data.teleportStats) {
            window.data.teleportStats = { lastDate: todayStr, count: 0 };
        }
        
        // Gib dem Spieler die Feder, falls er sie noch nicht hat (Auto-Unlock)
        if (window.data && window.data.inventar) {
            if (!window.data.inventar["item_nest_feder"]) {
                window.data.inventar["item_nest_feder"] = 1;
            }
        }
        
        // Reset bei neuem Tag
        if (window.data.teleportStats.lastDate !== todayStr) {
            window.data.teleportStats.lastDate = todayStr;
            window.data.teleportStats.count = 0;
        }
        
        const count = window.data.teleportStats.count;
        const COST = 700;
        
        if (count < 2) {
            // Kostenlos
            alert(`Teleport zum Dorfplatz... (Kostenlos: ${count + 1}/2 heute)`);
        } else {
            // Kostet 700 LXP
            if ((window.data.lxp || 0) < COST) {
                alert(`Nicht genug LXP! Ein Teleport kostet ${COST} LXP (du hast heute bereits 2 kostenlose Anwendungen genutzt).`);
                return;
            }
            if (!confirm(`Die kostenlosen Teleporte für heute sind aufgebraucht. Möchtest du für ${COST} LXP zum Dorf teleportieren?`)) {
                return;
            }
            window.data.lxp -= COST;
        }
        
        // Teleport durchführen
        gridX = 0;
        gridY = 0;
        targetPos.x = 0;
        targetPos.z = 0;
        window.data.teleportStats.count++;
        
        if (typeof saveStep === 'function') saveStep();
        if (typeof updateUI === 'function') updateUI();
        
        // Visueller Effekt (optional)
        if (scene) {
            const flashGeo = new THREE.SphereGeometry(10, 32, 32);
            const flashMat = new THREE.MeshBasicMaterial({ color: 0x00ffff, transparent: true, opacity: 0.8 });
            const flash = new THREE.Mesh(flashGeo, flashMat);
            flash.position.set(0, 8, 0);
            scene.add(flash);
            setTimeout(() => {
                let op = 0.8;
                const interval = setInterval(() => {
                    op -= 0.1;
                    flash.material.opacity = op;
                    if (op <= 0) {
                        clearInterval(interval);
                        scene.remove(flash);
                    }
                }, 50);
            }, 500);
        }
    }

    async function mount() {
        console.log("[FPWald] Starte Mount...");
        const host = document.getElementById('fpCanvas');
        if (!host) {
            console.error("[FPWald] fpCanvas nicht gefunden!");
            return false;
        }
        if (!window.THREE) { 
            console.error("[FPWald] THREE nicht gefunden in mount!");
            host.innerHTML = '<div style="color:gold; padding:10px;">Lade 3D-Engine...</div>'; 
            return false; 
        }
        
        scene = new THREE.Scene();
        scene.background = new THREE.Color(0x91abbd); // Sanfteres Graublau
        console.log("[FPWald] Scene initialisiert.");
        const quality = getQuality();
        const fogD = quality === 1 ? 0.005 : (quality === 2 ? 0.003 : 0.001);
        scene.fog = new THREE.FogExp2(0x91abbd, fogD); 
        fogEnabled = true;
        const w = host.clientWidth || window.innerWidth || 900;
        const h = host.clientHeight || window.innerHeight || 600;
        camera = new THREE.PerspectiveCamera(60, w / h, 0.1, 1500); // Sichtweite erhöht
        renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        
        const pr = Math.min(window.devicePixelRatio || 1, quality === 1 ? 1 : 2);
        renderer.setPixelRatio(pr);
        renderer.setSize(w, h);
        host.innerHTML = '';
        host.appendChild(renderer.domElement);
        window.addEventListener('resize', onResize);
        console.log("[FPWald] Renderer bereit.");
        
        // Beleuchtung (Sonne)
        ambientLight = new THREE.AmbientLight(0xffffff, 0.7); // Deutlich heller
        scene.add(ambientLight);
        sunLight = new THREE.DirectionalLight(0xfff5e1, 1.2); // Etwas mehr Sonnenlicht
        sunLight.position.set(150, 250, 100);
        sunLight.castShadow = true;
        console.log("[FPWald] Licht initialisiert.");
        sunLight.shadow.mapSize.width = 4096;
        sunLight.shadow.mapSize.height = 4096;
        sunLight.shadow.camera.left = -1000;
        sunLight.shadow.camera.right = 1000;
        sunLight.shadow.camera.top = 1000;
        sunLight.shadow.camera.bottom = -1000;
        sunLight.shadow.camera.far = 2000;
        sunLight.shadow.bias = -0.00005; // Etwas weniger Bias für bessere Kontakt-Schatten
        scene.add(sunLight);

        // KAMERA LAYER INITIALISIEREN
        // Layer 0: Alles (Standard)
        // Layer 1: Wasser
        // Layer 2: Terrain-Assets (Wald)
        camera.layers.enable(0);
        camera.layers.enable(1);
        camera.layers.enable(2);

        // Wolken hinzufügen
        if (window.FPGraphics) FPGraphics.createClouds(scene);
        
        // Gelände & Innenräume
        if (window.FPGraphics) {
            FPGraphics.initInteriors(scene);
        }

        // Nebel für Atmosphäre
        const RANGE = (window.FPGraphics ? FPGraphics.CLIPMAP_RADIUS * 0.9 : 800);
        scene.fog = new THREE.Fog(0x87ceeb, 100, RANGE); 
        
        if (window.FPGraphics) {
            console.log("[FPWald] Initialisiere FPGraphics Welt...");
            await FPGraphics.initWorld(scene, window.EnvironmentManager, (buildingName) => {
                if (buildingName === "Schmiede") enterHouse('smithy');
                else if (buildingName === "Wirtshaus") enterHouse('inn');
                else if (buildingName === "Marktplatz" || buildingName === "Markt") {
                    const overlay = document.getElementById('fpMarketOverlay');
                    if (overlay) {
                        overlay.style.display = 'block';
                        overlay.innerHTML = '<div id="market_container"></div>';
                        addOverlayCloseButton(overlay);
                        if (typeof renderMarketplace === 'function') renderMarketplace('market_container');
                    }
                } else if (buildingName === "Steinbruch") {
                    const overlay = document.getElementById('fpMarketOverlay');
                    if (overlay) {
                        overlay.style.display = 'block';
                        overlay.innerHTML = '<div id="mining_container"></div>';
                        addOverlayCloseButton(overlay);
                        if (window.Mining) window.Mining.open('mining_container');
                    }
                } else if (buildingName === "Arena") {
                    if (window.PvPEvents) window.PvPEvents.openMenu();
                }
            }, renderer);
            console.log("[FPWald] FPGraphics Welt bereit.");
            FPGraphics.initRain(scene);
        } else {
            console.error("[FPWald] FPGraphics nicht gefunden!");
        }

        try {
            let path = 'Ei.png';
            if (window.getCreatureSprite && window.data) {
                path = getCreatureSprite(window.data);
            }
            const tex = new THREE.TextureLoader().load(path);
            tex.magFilter = THREE.NearestFilter;
            tex.minFilter = THREE.NearestFilter;
            const sm = new THREE.SpriteMaterial({ map: tex });
            const sprite = new THREE.Sprite(sm);
            sprite.scale.set(8, 8, 1);
            // VISUELLER FIX: Das Sprite muss vertikal verschoben werden, 
            // damit der "Boden" des Sprites (die Füße des Eis) auf dem Pivot-Punkt liegen.
            // Da das Sprite 8 Einheiten hoch ist, schieben wir es um +8 nach oben (Vollständig über Pivot)
            sprite.position.y = 8;
            
            avatar = new THREE.Group();
            window.avatar = avatar;
            avatar.add(sprite);
            avatar.position.y = -100; // Unter die Erde, bis Validierung erfolgt
            scene.add(avatar);
            
            // Lokales Namensschild
            const twitchName = (window.data && window.data.name) ? window.data.name : 'Gast';
            avatarNameTag = (window.FPGraphics ? FPGraphics.createNameTag(twitchName) : new THREE.Group());
            scene.add(avatarNameTag);

            updateAvatarWeapons(); // Waffen initialisieren
            initAdminUI(); // Admin-UI initialisieren
        } catch {
            const avatarGeo = new THREE.BoxGeometry(6, 10, 6);
            const avatarMat = new THREE.MeshLambertMaterial({ color: 0xbfd5ff });
            avatar = new THREE.Mesh(avatarGeo, avatarMat);
            window.avatar = avatar;
            avatar.position.y = -100;
            scene.add(avatar);

            // Lokales Namensschild (Fallback)
            const twitchName = (window.data && window.data.name) ? window.data.name : 'Gast';
            avatarNameTag = (window.FPGraphics ? FPGraphics.createNameTag(twitchName) : new THREE.Group());
            scene.add(avatarNameTag);
        }
        if (window.data && window.data.x !== undefined && window.data.y !== undefined) {
            currentPos.x = targetPos.x = window.data.x;
            currentPos.z = targetPos.z = window.data.y;
            gridX = Math.round(currentPos.x / GRID);
            gridY = Math.round(currentPos.z / GRID);
        } else {
            // Standard-Startpunkt bei -31, -1183 (Plateau in Graphics)
            gridX = Math.round(-31 / GRID); 
            gridY = Math.round(-1183 / GRID);
            currentPos.x = targetPos.x = -31.0;
            currentPos.z = targetPos.z = -1183.0;
        }

        currentPos.y = targetPos.y = 100.0; // Radikal: Wir starten bei 100m Höhe, um den Ladevorgang der GPGPU abzuwarten
        velocityY = 0; // Keine Fallgeschwindigkeit am Start
        isGrounded = false;
        
        // Anti-Stuck Check: Wenn wir in einem Gebäude spawnen -> Dorfplatz
        if (checkCollision(currentPos.x, currentPos.z)) {
            console.warn("Spieler in Gebäude gespawnt! Teleport zum Dorfplatz...");
            gridX = 0; gridY = 0;
            currentPos.x = targetPos.x = 0;
            currentPos.z = targetPos.z = 0;
        }

        targetHeading = heading = 0;

        applyCamera();
        startSync(); // Sync starten
        
        console.log("[FPWald] Mount abgeschlossen. Avatar Position:", avatar.position);
        
        // --- GLOBALE TELEPORT-FUNKTION ---
        window.teleportTo = (x, z) => {
            console.log(`🚀 Teleportiere zu: ${x}, ${z}`);
            
            // Sofortige Synchronisation aller Positions-Variablen
            currentPos.x = targetPos.x = x;
            currentPos.z = targetPos.z = z;
            currentPos.y = targetPos.y = -100; // Boden-Validierung erzwingen
            
            // Ground-Validation zurücksetzen, damit updateMonsters() die Höhe neu berechnet
            groundValidated = false;
            
            if (avatar) {
                avatar.position.set(x, -100, z);
            }
            // Grid-Koordinaten aktualisieren
            gridX = Math.round(x / GRID);
            gridY = Math.round(z / GRID);
            
            // Sofort Kamera anpassen (ohne Delta für harten Sprung)
            applyCamera(0);
            
            // Save-Step triggern für Persistenz
            saveStep();
        };

        window.resetPosition = () => window.teleportTo(0, 0);
        
        // Pointer Lock für Maussteuerung
        const canvas = renderer.domElement;
        
        // Raycaster für Gebäude-Klicks
        const raycaster = new THREE.Raycaster();
        const mouse = new THREE.Vector2();

        canvas.addEventListener('mousedown', (e) => {
            // Wenn Linksklick und kein Pointer Lock -> Pointer Lock anfordern
            if (e.button === 0 && document.pointerLockElement !== canvas) {
                canvas.requestPointerLock();
                return;
            }

            // Wenn Linksklick und Pointer Lock aktiv -> Prüfen ob Gebäude getroffen wurde
            if (e.button === 0 && document.pointerLockElement === canvas) {
                // In Pointer Lock ist die Maus immer in der Mitte
                mouse.x = 0;
                mouse.y = 0;
                raycaster.setFromCamera(mouse, camera);

                // 1. Prüfen ob Gebäude getroffen wurde
                const buildings = window.FPGraphics ? FPGraphics.villageBuildings : [];
                const buildingIntersects = raycaster.intersectObjects(buildings, true);
                if (buildingIntersects.length > 0) {
                    let obj = buildingIntersects[0].object;
                    while (obj.parent && !obj.userData.callback) {
                        obj = obj.parent;
                    }
                    if (obj.userData.callback) {
                        obj.userData.callback();
                        document.exitPointerLock();
                        return;
                    }
                }

                // 2. Prüfen ob Sammelobjekt getroffen wurde
                const collectIntersects = raycaster.intersectObjects(collectibles, true);
                if (collectIntersects.length > 0) {
                    const obj = collectIntersects[0].object;
                    if (obj.userData.isCollectible) {
                        collectItem(obj);
                    }
                }

                // --- ANGRIFFS-LOGIK FÜR FSM ---
                window.isAttacking = true;
                setTimeout(() => { window.isAttacking = false; }, 300);
            }
        });

        const onMouseMove = (e) => {
            if (document.pointerLockElement === canvas) {
                // Positiver movementX soll targetHeading erhöhen (Rechtsdrehung)
                targetHeading += e.movementX * ROT_SPEED;
            }
        };
        document.addEventListener('mousemove', onMouseMove);

        const onKeyDown = (onKeyDownEvent) => {
            const key = onKeyDownEvent.key.toLowerCase();
            keys[key] = true;
            console.log("Key Down:", key, keys);
            
            // Interaktion mit E
            if (onKeyDownEvent.key.toLowerCase() === 'e') {
                const houseOverlay = document.getElementById('houseOverlay');
                if (houseOverlay) {
                    // Wenn Overlay offen ist, klicke den "BETRETEN" Button falls vorhanden
                    const enterBtn = houseOverlay.querySelector('#enterBtn');
                    if (enterBtn) {
                        enterBtn.click();
                    } else {
                        houseOverlay.remove(); // Sonst einfach schließen
                    }
                } else if (window._lastInteract) {
                    window._lastInteract();
                }
            }
            // Inventar mit I
            if (onKeyDownEvent.key.toLowerCase() === 'i') {
                const overlay = document.getElementById('fpInventoryOverlay');
                if (overlay) {
                    if (overlay.style.display === 'block') {
                        overlay.style.display = 'none';
                    } else {
                        // Öffne das normale Inventar im Overlay
                        if (typeof renderInventar === 'function') {
                            overlay.style.display = 'block';
                            renderInventar('fpInventoryOverlay');
                            if (typeof addOverlayCloseButton === 'function') {
                                addOverlayCloseButton(overlay);
                            }
                        }
                    }
                }
            }
            // ESC zum Schließen von Overlays oder dem Wald
            if (onKeyDownEvent.key === 'Escape') {
                const invOverlay = document.getElementById('fpInventoryOverlay');
                const marketOverlay = document.getElementById('fpMarketOverlay');
                const houseOverlay = document.getElementById('houseOverlay');
                
                let closedAny = false;
                if (marketOverlay && marketOverlay.style.display === 'block') { marketOverlay.style.display = 'none'; closedAny = true; }
                if (invOverlay && invOverlay.style.display === 'block') { invOverlay.style.display = 'none'; closedAny = true; }
                if (houseOverlay && houseOverlay.style.display === 'block') { houseOverlay.style.display = 'none'; closedAny = true; }
                
                if (closedAny) return;
                
                if (typeof close === 'function') close();
                return;
            }
            // Teleport mit T
            if (onKeyDownEvent.key.toLowerCase() === 't') {
                if (typeof teleportToVillage === 'function') teleportToVillage();
            }
            // JUMP mit Space
            if (onKeyDownEvent.key === ' ' && isGrounded) {
                velocityY = JUMP_FORCE;
                isGrounded = false;
            }
        };
        const onKeyUp = (onKeyUpEvent) => keys[onKeyUpEvent.key.toLowerCase()] = false;
        window.addEventListener('keydown', onKeyDown);
        window.addEventListener('keyup', onKeyUp);

    function checkCollision(nx, nz) {
        if (window.FPGraphics && FPGraphics.isInterior) {
            let pos = { x: 5000, y: 0, z: 5000 };
            let size = 50; // Standardhalbe Breite/Tiefe (100x100)
            
            if (FPGraphics.currentInterior === 'inn') {
                pos = { x: 5200, y: 0, z: 5200 };
            } else if (FPGraphics.currentInterior === 'market') {
                pos = { x: 5400, y: 0, z: 5400 };
                size = 60; // 120x120
            }
            
            // Kollision mit den Wänden des Raumes (AABB Check)
            const dx = nx - pos.x;
            const dz = nz - pos.z;
            
            if (Math.abs(dx) > size - 2 || Math.abs(dz) > size - 2) {
                return true; 
            }
            return false;
        }

        // --- CLIPMAP KOLLISION (Wasser/Berge/Steigung) ---
        if (window.FPGraphics) {
            const h = FPGraphics.getGPUHeight(nx, nz);
            
            // Steile Wände (Slope-Check): Wenn der Boden am Zielpunkt deutlich höher ist als die aktuelle Position
            // Aber nur blockieren, wenn wir uns auf einer ähnlichen Höhe befinden (Grounded-Check)
            // Schwellenwert auf 35.0 erhöht für flüssigere Bergwanderungen
            if (isGrounded && (h - targetPos.y > 35.0)) return true;
            
            // Wasser-Kollision (Ozean) - Etwas tieferes Wasser erlauben
            if (h < -30.0) return true; 
        }

        // Kollision mit Gebäuden (Exterior)

        // Kollision mit Gebäuden (Exterior)
        const buildings = window.FPGraphics ? FPGraphics.villageBuildings : [];
        for (const b of buildings) {
            const d = Math.hypot(b.position.x - nx, b.position.z - nz);
            const radius = b.userData.radius || 15;
            if (d < radius) return true;
        }

        // Kollision mit Sammelobjekten
        for (const c of collectibles) {
            const d = Math.hypot(c.position.x - nx, c.position.z - nz);
            if (d < (c.userData.radius || 4)) return true;
        }
        return false;
    }

    let collisionRaycaster = null;
    function loop() {
        anim = requestAnimationFrame(loop);
        if (!renderer || !scene || !camera) return;

        if (!collisionRaycaster && window.THREE) {
            collisionRaycaster = new THREE.Raycaster();
        }

        const now = performance.now();
        const delta = Math.min((now - lastTime) / 16.6, 3); // Normalisiert auf 60 FPS
        lastTime = now;

        updateEnvironment();
        
        // --- AOI & SPAWN VALIDATION ---
        // Wenn der Boden noch nicht validiert ist, überspringen wir die Physik/Bewegung
        if (!groundValidated) {
            console.log("[FPWald] Boden noch nicht validiert. Prüfe Ground...");
            // Zuerst Clipmap aktualisieren, damit GPGPU Daten für die Validierung bereitstellt
            if (window.FPGraphics) {
                FPGraphics.updateClipmap(currentPos.x, currentPos.z, renderer);
                
                // SOFORT-VALIDIERUNG: Wenn GPGPU Daten bereit hat, validieren wir sofort
                const testH = FPGraphics.getGPUHeight(currentPos.x, currentPos.z);
                // Validierung: Wenn wir eine valide Zahl bekommen (auch 0)
                if ((testH !== undefined && !isNaN(testH)) || currentPos.y > -50) {
                    console.log("[FPWald] Boden-Höhe erkannt:", testH, "Setze groundValidated = true");
                    groundValidated = true;
                    // Spawn-Fix: Setze Spieler 40m ÜBER den Boden beim ersten Spawn
                    targetPos.y = currentPos.y = testH + 40.0; 
                }
            } else {
                console.error("[FPWald] FPGraphics fehlt bei Ground-Validation!");
            }

            // Jetzt Validierung durchführen
            updateMonsters();
            
            // Kamera aktualisieren
            applyCamera(delta);

            if (renderer && scene && camera) {
                renderer.render(scene, camera);
            } else {
                console.error("[FPWald] Render-Fehler bei Ground-Validation:", { renderer: !!renderer, scene: !!scene, camera: !!camera });
            }
            return;
        }

        // --- PHYSIK & BEWEGUNG ZUERST ---
        if (!(window.FPGraphics && FPGraphics.isInterior)) {
            velocityY += GRAVITY * delta;
            targetPos.y += velocityY * delta;
            
            // PHYSIK: Nutze die reale Terrain-Höhe (Hybrid: Raycast für Präzision im Nahbereich, GPGPU als Fallback)
            // WICHTIG: Das Clipmap-Mesh ist der einzige Boden.
            let groundH = targetPos.y; 
            if (window.FPGraphics) {
                const gpuH = FPGraphics.getGPUHeight(targetPos.x, targetPos.z);
                
                // Wir nutzen die GPU-Höhe direkt vom Mesh/GPGPU
                if (gpuH !== 0 || (Math.abs(targetPos.x) < 10 && Math.abs(targetPos.z) < 10)) {
                    groundH = (typeof FPGraphics.getRaycastHeight === 'function') 
                        ? FPGraphics.getRaycastHeight(targetPos.x, targetPos.z, gpuH)
                        : gpuH;
                }
            }
            
            // --- INTERIOR-KOLLISION VALIDIERUNG ---
            // Raycasting nur noch für Gebäude/Innenräume, da Terrain über GPGPU präziser ist
            if (collisionRaycaster && window.FPGraphics && FPGraphics.isInterior && FPGraphics.currentInteriorMesh) {
                const rayOrigin = new THREE.Vector3(targetPos.x, targetPos.y + 50, targetPos.z);
                const rayDir = new THREE.Vector3(0, -1, 0);
                collisionRaycaster.set(rayOrigin, rayDir);
                
                const intersects = collisionRaycaster.intersectObject(FPGraphics.currentInteriorMesh);
                if (intersects.length > 0) {
                    groundH = intersects[0].point.y;
                }
            }
        
        // COLLISION FIX: Spieler MUSS ÜBER dem Boden bleiben
        // Wir setzen die minimale Höhe auf -250 (GPGPU Untergrenze)
        // Aber im Dorf/Startplateau sollte groundH 0 sein.
        // VISUELLER FIX: Wir setzen groundH massiv höher (+2.0), damit das Ei-Sprite sicher auf dem Mesh steht
        // Ein T-Modell (oder Sprite) braucht diesen Puffer, um nicht "einzusinken"
        const finalGroundH = Math.max(groundH + 2.0, -250.0);

        // Radikaler Fix: Wenn die Position unter der Bodenhöhe liegt, sofort nach oben setzen
        if (targetPos.y < finalGroundH) { 
            targetPos.y = finalGroundH;
            velocityY = 0;
            isGrounded = true;
        } else if (targetPos.y > finalGroundH + 0.1) {
            isGrounded = false;
        }

        // --- POSITIONSMELDUNG FÜR DEBUGGING ---
        if (Date.now() % 1000 < 50) {
            // console.log(`[Physics] pos: ${targetPos.y.toFixed(2)}, ground: ${finalGroundH.toFixed(2)}, diff: ${(targetPos.y - finalGroundH).toFixed(2)}`);
        }
    } else {
        targetPos.y = 0;
        isGrounded = true;
    }

    // Bewegung verarbeiten
    let moved = false;
    // Richtungsvektoren korrigiert (Standard Three.js Orientierung für diese Szene)
    // H=0 ist Blickrichtung +Z (basierend auf applyCamera)
    const forwardVector = new THREE.Vector3(Math.sin(targetHeading), 0, Math.cos(targetHeading));
    const rightVector = new THREE.Vector3(Math.cos(targetHeading), 0, -Math.sin(targetHeading));

    let nextX = targetPos.x;
    let nextZ = targetPos.z;

    const speedMult = (keys['shift'] || keys['ShiftLeft']) ? 2.5 : ((keys['control'] || keys['controlleft'] || keys['c']) ? 0.5 : 1.0);
    // Geschwindigkeit: MOVE_SPEED (0.22) * delta * speedMult (GRID entfernt für korrekte Skalierung)
    const speed = MOVE_SPEED * delta * speedMult;
    
    if (keys['w']) { nextX += forwardVector.x * speed; nextZ += forwardVector.z * speed; moved = true; }
    if (keys['s']) { nextX -= forwardVector.x * speed; nextZ -= forwardVector.z * speed; moved = true; }
    if (keys['a']) { nextX -= rightVector.x * speed; nextZ -= rightVector.z * speed; moved = true; }
    if (keys['d']) { nextX += rightVector.x * speed; nextZ += rightVector.z * speed; moved = true; }

    // --- DUCKEN-EFFEKT (Kamera-Höhe) ---
    // Wir ändern nicht targetPos.y (den Boden-Punkt), sondern das Offset der Kamera
    let cameraHeightOffset = 1.6; // Standard Augenhöhe
    if (keys['control'] || keys['c']) {
        cameraHeightOffset = 0.8; // Ducken senkt die Augenhöhe
    }
    window._cameraHeightOffset = cameraHeightOffset;

        if (moved) {
            if (!checkCollision(nextX, nextZ)) { 
                targetPos.x = nextX;
                targetPos.z = nextZ;
                if (Date.now() - lastStepAt > STEP_MS) {
                    gridX = Math.round(targetPos.x / GRID);
                    gridY = Math.round(targetPos.z / GRID);
                    saveStep();
                    lastStepAt = Date.now();
                }
            }
        }

        // --- KAMERA AKTUALISIEREN ---
        // Dies berechnet die aktuelle geglättete currentPos
        applyCamera(delta);
        
        // Kamera-Matrix sofort aktualisieren, damit der Shader im nächsten Schritt
        // die exakt gleichen View-Daten hat wie die Kamera-Position (Sync-Fix)
        camera.updateMatrixWorld();

        // --- TERRAIN AN KAMERA AUSRICHTEN ---
        // WICHTIG: Nutze currentPos statt targetPos für perfekte Synchronisation
        if (window.FPGraphics) {
            FPGraphics.updateClipmap(currentPos.x, currentPos.z, renderer);
            FPGraphics.updateRain(avatar);
            FPGraphics.updateRiver();
            FPGraphics.updateFire(delta, now);
        }

        // --- AOI UPDATES ---
        updateMonsters();
        updateCollectibles();
        updateBuildings();
        
        updateOtherPlayers();
        checkInteractions();
        
        if (animFSM) {
            animFSM.update(moved, isGrounded, window.isAttacking);
        }
        
        if (renderer && scene && camera) {
            renderer.render(scene, camera);
        }
    }

    // --- START RENDERING ---
    lastTime = performance.now();
    loop();
    console.log("[FPWald] Render-Loop gestartet.");

    // Cleanup für Event-Listener in unmount speichern
    keyHandler = { onMouseMove, onKeyDown, onKeyUp };

        // Mobile Steuerung ausblenden für PC-Nutzer
        const isPC = !/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
        if (isPC) {
            // Verstecke die untere Nav-Leiste im fpModal
            const hideNav = () => {
                const navBar = document.querySelector('#fpModal > div > div:nth-child(2)');
                if (navBar && navBar.style) {
                    navBar.style.display = 'none';
                    navBar.style.pointerEvents = 'none';
                    navBar.style.height = '0';
                    navBar.style.opacity = '0';
                }
            };
            hideNav();
            setTimeout(hideNav, 500); // Sicherheits-Check nach halber Sekunde
            setTimeout(hideNav, 1500); // Und nochmal nach 1.5s
        }

        spawnCollectibles(); // Sammelobjekte spawnen
        spawnMonsters(); // Monster spawnen

        // Event-Integration für Waffen-Updates
        if (window.EventHub) {
            EventHub.on('inventory:update', () => updateAvatarWeapons());
            EventHub.on('equipment:update', () => updateAvatarWeapons());
        }

        return true;
    }
    function unmount() {
        if (syncTimer) clearInterval(syncTimer);
        syncTimer = null;
        window.removeEventListener('resize', onResize);
        if (anim) cancelAnimationFrame(anim);
        anim = null;

        // Chunks aufräumen
        if (window.FPGraphics && FPGraphics.cleanup) {
            FPGraphics.cleanup(scene);
        } else {
            // Fallback falls FPGraphics nicht da ist (was unwahrscheinlich ist)
            // chunks.forEach(chunk => { ... });
        }

        if (keyHandler) {
            document.removeEventListener('mousemove', keyHandler.onMouseMove);
            window.removeEventListener('keydown', keyHandler.onKeyDown);
            window.removeEventListener('keyup', keyHandler.onKeyUp);
            keyHandler = null;
        }

        if (renderer) {
            if (document.pointerLockElement === renderer.domElement) {
                document.exitPointerLock();
            }
            renderer.dispose();
        }
        renderer = null;
        
        // Andere Spieler aufräumen
        if (scene) {
            const interactUI = document.getElementById('fpInteractUI');
            if (interactUI) interactUI.remove();
            const compass = document.getElementById('fpCompassHUD');
            if (compass) compass.remove();

            scene = null;
            camera = null;
            const host = document.getElementById('fpCanvas');
            if (host) host.innerHTML = '';
        }
    }

    function applyCamera(delta = 1) {
        if (!camera) return;
        
        // Schnelleres Lerping für die Rotation (direkteres Gefühl)
        const ROT_LERP = Math.min(LERP_FACTOR * delta * 4.0, 1.0);
        const POS_LERP = Math.min(LERP_FACTOR * delta * 3.0, 1.0);
        
        // Winkel-Interpolation normalisieren, um "Looping" zu verhindern
        let diff = targetHeading - heading;
        while (diff < -Math.PI) diff += Math.PI * 2;
        while (diff > Math.PI) diff -= Math.PI * 2;
        heading += diff * ROT_LERP;

        // Validierung gegen NaN (Sicherheitscheck für Blackscreen-Fix)
        if (isNaN(currentPos.x)) currentPos.x = targetPos.x || 0;
        if (isNaN(currentPos.y)) currentPos.y = targetPos.y || 0;
        if (isNaN(currentPos.z)) currentPos.z = targetPos.z || 0;
        
        currentPos.x += (targetPos.x - currentPos.x) * POS_LERP;
        currentPos.y += (targetPos.y - currentPos.y) * POS_LERP;
        currentPos.z += (targetPos.z - currentPos.z) * POS_LERP;

        // Wenn immer noch NaN, dann auf 0 setzen
        if (isNaN(currentPos.x)) currentPos.x = 0;
        if (isNaN(currentPos.y)) currentPos.y = 0;
        if (isNaN(currentPos.z)) currentPos.z = 0;

        // Werte im Bereich halten
        if (targetHeading > Math.PI) targetHeading -= Math.PI * 2;
        if (targetHeading < -Math.PI) targetHeading += Math.PI * 2;
        if (heading > Math.PI) heading -= Math.PI * 2;
        if (heading < -Math.PI) heading += Math.PI * 2;

        const px = currentPos.x;
        const py = currentPos.y;
        const pz = currentPos.z;

        if (avatar) {
            // Avatar (Lila Ei) Positionierung
            // px, py, pz ist die Spielerposition (Bodenhöhe)
            // Das Sprite wurde bereits intern um +4 angehoben, 
            // also setzen wir den Pivot direkt auf die berechnete Physik-Höhe (py)
            avatar.position.set(px, py, pz);
            avatar.rotation.y = heading;
        }
        if (avatarNameTag) {
            avatarNameTag.position.set(px, py + 2.5, pz); 
        }
        
        if (thirdPerson) {
            const back = 40; // Xenoblade-Style: Weit weg für Übersicht
            const ox = Math.sin(heading) * back;
            const oz = Math.cos(heading) * back;
            let camY = py + 12.0; // Deutlich höher für dramatischen Blickwinkel
            
            // Kamera-Clipping-Schutz gegen das Terrain
            const camTerrainH = (window.FPGraphics ? FPGraphics.getGPUHeight(px - ox, pz - oz) : 0);
            if (camY < camTerrainH + 4.0) camY = camTerrainH + 4.0;

            camera.position.set(px - ox, camY, pz - oz);
            // Fokus auf das Ei, aber leicht nach oben versetzt
            camera.lookAt(new THREE.Vector3(px, py + 1.5, pz));
        } else {
            let camY = py + 2.0; // First Person Augenhöhe für das Ei
            
            const camTerrainH = (window.FPGraphics ? FPGraphics.getGPUHeight(px, pz) : 0);
            if (camY < camTerrainH + 1.0) camY = camTerrainH + 1.0;

            camera.position.set(px, camY, pz);
            const lookX = px + Math.sin(heading) * 10;
            const lookZ = pz + Math.cos(heading) * 10;
            camera.lookAt(new THREE.Vector3(lookX, camY, lookZ));
        }
        
        // Interaktions-Check bei jeder Kamera-Aktualisierung (nach Bewegung)
        checkInteractions();
    }
    function saveStep() {
        if (!window.data || !window.verifiedID) return;
        window.data.x = Math.round(targetPos.x);
        window.data.y = Math.round(targetPos.z);
        
        // Sofortiges Update für andere (High-Frequency)
        if (window.db) {
            window.db.ref('players/' + window.verifiedID).update({
                x: window.data.x,
                y: window.data.y,
                heading: targetHeading,
                name: window.data.name || 'Gast',
                lastSeen: Date.now()
            });
        }
        
        if (typeof window.saveUserData === 'function') {
            window.saveUserData();
        }
    }

    function startSync() {
        if (syncTimer) clearInterval(syncTimer);
        syncTimer = setInterval(() => {
            if (!window.verifiedID || !window.db) return;
            // Nur senden, wenn wir uns bewegt haben oder die Drehung sich geändert hat
            window.db.ref('players/' + window.verifiedID).update({
                x: Math.round(targetPos.x),
                y: Math.round(targetPos.z),
                heading: targetHeading,
                name: window.data.name || 'Gast',
                lastSeen: Date.now()
            });
        }, 50);
    }

    function updateOtherPlayers() {
        if (!scene || !window.onlinePlayers) return;
        
        const LERP_SPEED = 0.15;

        Object.keys(window.onlinePlayers).forEach(id => {
            if (id === window.verifiedID) return;
            const p = window.onlinePlayers[id];
            if (!p || p.hidden) return;
            
            if (Date.now() - (p.lastSeen || 0) > 60000) {
                const data = otherPlayers.get(id);
                if (data) {
                    if (scene) {
                        scene.remove(data.sprite);
                        if (data.nameTag) scene.remove(data.nameTag);
                    }
                    otherPlayers.delete(id);
                }
                return;
            }

            let data = otherPlayers.get(id);
            if (!data) {
                try {
                    if (!scene) return;
                    const path = (typeof getCreatureSprite === 'function') ? getCreatureSprite(p, id === '573773653') : 'Ei.png';
                    const tex = new THREE.TextureLoader().load(path);
                    tex.magFilter = THREE.NearestFilter;
                    tex.minFilter = THREE.NearestFilter;
                    const sm = new THREE.SpriteMaterial({ map: tex });
                    const sprite = new THREE.Sprite(sm);
                    sprite.scale.set(8, 8, 1);
                    sprite.position.set(p.x || 0, 4, p.y || 0);
                    scene.add(sprite);
                    
                    // Namensschild für Mitspieler
                    const nameTag = (window.FPGraphics ? FPGraphics.createNameTag(p.name || 'Gast') : new THREE.Group());
                    nameTag.position.set(p.x || 0, 10, p.y || 0);
                    scene.add(nameTag);
                    
                    data = { 
                        sprite, 
                        nameTag,
                        targetPos: new THREE.Vector3(p.x || 0, 4, p.y || 0),
                        targetRot: p.heading || 0
                    };
                    otherPlayers.set(id, data);
                 } catch(e) { console.error("Error creating sprite for", id, e); }
             } else {
                 data.targetPos.set(p.x || 0, 4, p.y || 0);
                 data.targetRot = p.heading || 0;
                 data.sprite.position.lerp(data.targetPos, LERP_SPEED);
                 
                 // Namensschild mitbewegen
                 if (data.nameTag) {
                     data.nameTag.position.set(
                         data.sprite.position.x,
                         data.sprite.position.y + 6,
                         data.sprite.position.z
                     );
                 }
             }
        });

        otherPlayers.forEach((data, id) => {
            if (!window.onlinePlayers[id]) {
                if (scene) {
                    scene.remove(data.sprite);
                    if (data.nameTag) scene.remove(data.nameTag);
                }
                otherPlayers.delete(id);
            }
        });
    }

    function forward() {}
    function back() {}
    function left() {}
    function right() {}
    function gridXMove(d) { gridX += d; targetPos.x = gridX * GRID; }
    function gridZMove(d) { gridY += d; targetPos.z = gridY * GRID; }

    async function open() {
        console.log("[FPWald] Öffne 3D-Wald...");
        const modal = document.getElementById('fpModal');
        if (!modal) {
            console.error("[FPWald] fpModal nicht gefunden!");
            return;
        }
        modal.style.display = 'flex';
        
        const success = await ensureThree();
        if (!success) {
            console.error("[FPWald] Three.js konnte nicht initialisiert werden.");
            return;
        }

        const mounted = await mount();
        if (mounted) {
            console.log("[FPWald] Mount erfolgreich, binde UI...");
            bindUI();
        } else {
            console.error("[FPWald] Mount fehlgeschlagen.");
        }

        try { 
            if (window.db && window.verifiedID) { 
                const updateData = { hidden: false, lastSeen: Date.now() };
                if (window.data && window.data.name) {
                    updateData.name = window.data.name;
                }
                window.db.ref('players/' + window.verifiedID).update(updateData); 
            } 
        } catch (e) {
            console.warn("[FPWald] Fehler beim DB-Update:", e);
        }
        
        if (!presenceTimer) {
            presenceTimer = setInterval(() => {
                try { if (window.db && window.verifiedID) { window.db.ref('players/' + window.verifiedID).update({ lastSeen: Date.now(), hidden: false }); } } catch {}
            }, 10000);
        }
    }
    function close() {
        unmount();
        const modal = document.getElementById('fpModal');
        if (modal) modal.style.display = 'none';
        
        // Zurück zur 2D-Welt deaktiviert
        // const world = document.getElementById('world');
        // if (world) world.style.display = 'block';

        // window.removeEventListener('keydown', handleKeys); // Veraltet, wird in unmount() über keyHandler erledigt
        if (presenceTimer) { clearInterval(presenceTimer); presenceTimer = null; }
    }
    function bindUI() {
        const btnL = document.getElementById('fpLeft');
        const btnF = document.getElementById('fpForward');
        const btnR = document.getElementById('fpRight');
        const btnB = document.getElementById('fpBack');
        const btnX = document.getElementById('fpExit');
        const btnInv = document.getElementById('fpInv');
        const navBar = document.querySelector('.fp-nav');

        // Teleport-Button für Mobile hinzufügen (falls noch nicht da)
        let btnTele = document.getElementById('fpTele');
        if (!btnTele && navBar) {
            btnTele = document.createElement('button');
            btnTele.id = 'fpTele';
            btnTele.className = 'btn-nav';
            btnTele.innerHTML = '🪶';
            btnTele.title = 'Teleport zum Dorf';
            btnTele.onclick = teleportToVillage;
            // Vor dem Inventar-Button einfügen
            navBar.insertBefore(btnTele, btnInv);
        }

        // PC-Spieler Check (Maus vorhanden und kein Touch)
        const isPC = !('ontouchstart' in window) || navigator.maxTouchPoints === 0;
        if (navBar) {
            navBar.style.display = isPC ? 'none' : 'flex';
        }

        if (btnL) btnL.onclick = left;
        if (btnF) btnF.onclick = forward;
        if (btnR) btnR.onclick = right;
        if (btnB) btnB.onclick = back;
        if (btnX) btnX.onclick = () => {
            const overlay = document.getElementById('fpInventoryOverlay');
            const isOverlayVisible = overlay && (overlay.style.display === 'block' || overlay.style.display === 'flex');
            if (isOverlayVisible) {
                overlay.style.display = 'none';
            } else {
                close();
            }
        };
        if (btnInv) btnInv.onclick = () => {
            const overlay = document.getElementById('fpInventoryOverlay');
            if (overlay) {
                if (overlay.style.display === 'none') {
                    overlay.style.display = 'block';
                    if (typeof renderInventoryUI === 'function') renderInventoryUI();
                } else {
                    overlay.style.display = 'none';
                }
            }
        };

    }
    window.FPWald = { 
        open, 
        close, 
        bindUI, 
        teleport: teleportToVillage, 
        get avatar() { return avatar; },
        getPosition: () => ({ x: targetPos.x, z: targetPos.z, heading: targetHeading })
    };
})();
