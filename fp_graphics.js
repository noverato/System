(() => {
    const PALETTE = {
        walls: 0xfdf5e6,
        wood: 0x4a3728,
        roof: 0xa52a2a,
        grass: 0x567d46,
        water: 0x4fa3e1,
        stone: 0x808080,
        trunk: 0x3d2b1f
    };

    const CLIPMAP_RADIUS = 1000; // Etwas kleiner als GPU_WORLD_SIZE / 2
    const CLIPMAP_SEGMENTS = 128; // Reduziert für Stabilität
    
    const DECORATION_CELL_SIZE = 256; 
    const DECORATION_RANGE = 4; 
    
    // --- GPGPU TERRAIN SETTINGS ---
    const GPU_TERRAIN_SIZE = 512; 
    const GPU_WORLD_SIZE = 2400;  // Deutlich größer als CLIPMAP_RADIUS * 2 für Puffer
    
    // --- LOD SETTINGS entfernt für Clipmap ---
    
    let gpuCompute;
    let heightVariable;
    let smoothVariable;
    let gpuHeightData = new Float32Array(GPU_TERRAIN_SIZE * GPU_TERRAIN_SIZE * 4);
    
    let clipmapMesh;
    let clipmapMaterial;
    let clipmapBackupMesh;
    let clipmapGroup;
    let mainScene; // Referenz für Dekorationen
    
    const NOISE_SHADER = `
        uniform float time;
        uniform vec2 offset; // Welt-Position der Textur-Ecke (unten-links)
        uniform float worldSize;
        
        // Simplex 2D noise
        vec3 permute(vec3 x) { return mod(((x*34.0)+1.0)*x, 289.0); }
        float snoise(vec2 v) {
            const vec4 C = vec4(0.211324865405187, 0.366025403784439, -0.577350269189626, 0.024390243902439);
            vec2 i  = floor(v + dot(v, C.yy) );
            vec2 x0 = v -   i + dot(i, C.xx);
            vec2 i1;
            i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
            vec4 x12 = x0.xyxy + C.xxzz;
            x12.xy -= i1;
            i = mod(i, 289.0);
            vec3 p = permute( permute( i.y + vec3(0.0, i1.y, 1.0 )) + i.x + vec3(0.0, i1.x, 1.0 ));
            vec3 m = max(0.5 - vec3(dot(x0,x0), dot(x12.xy,x12.xy), dot(x12.zw,x12.zw)), 0.0);
            m = m*m ;
            m = m*m ;
            vec3 x = 2.0 * fract(p * C.www) - 1.0;
            vec3 h = abs(x) - 0.5;
            vec3 a0 = x - floor(x + 0.5);
            float m7 = 1.79284291400159 - 0.85373472095314 * ( a0*a0 + h*h ).x;
            vec3 g;
            g.x  = a0.x  * x0.x  + h.x  * x0.y;
            g.yz = a0.yz * x12.xz + h.yz * x12.yw;
            return 130.0 * dot(m, g);
        }

        float fbm(vec2 p) {
            float v = 0.0;
            float a = 0.5;
            vec2 shift = vec2(100);
            mat2 rot = mat2(cos(0.5), sin(0.5), -sin(0.5), cos(0.50));
            for (int i = 0; i < 6; ++i) {
                v += a * snoise(p);
                p = rot * p * 2.0 + shift;
                a *= 0.5;
            }
            return v;
        }

        void main() {
            vec2 uv = gl_FragCoord.xy / resolution.xy;
            // Absolute Welt-Position berechnen
            vec2 pos = uv * worldSize + offset;
            
            // --- TERRAIN GENERATION (MATCHING CPU getTerrainHeight) ---
            
            // 1. Village Factor (Dörfer flach halten)
            float villageFactor = 1.0;
            vec2 villageLocs[5];
            villageLocs[0] = vec2(0.0, 0.0);
            villageLocs[1] = vec2(1200.0, 0.0);
            villageLocs[2] = vec2(-1200.0, 0.0);
            villageLocs[3] = vec2(0.0, 1200.0);
            villageLocs[4] = vec2(0.0, -1200.0);
            float radiuses[5];
            radiuses[0] = 400.0;
            radiuses[1] = 300.0;
            radiuses[2] = 300.0;
            radiuses[3] = 300.0;
            radiuses[4] = 300.0;

            for(int i=0; i<5; i++) {
                float d = length(pos - villageLocs[i]);
                if (d < radiuses[i]) {
                    float f = clamp((d - radiuses[i] * 0.4) / (radiuses[i] * 0.6), 0.0, 1.0);
                    villageFactor = min(villageFactor, f * f);
                }
            }

            // 2. Biome Weights (Matching CPU getBiomeData)
            float biomeScale = 0.15; // 1000.0 * 0.00015
            float temp = snoise(pos * biomeScale) * 0.5 + 0.5; // In Bereich [0,1] bringen für Logik
            temp = temp * 2.0 - 1.0; // Zurück auf [-1, 1]
            
            float humidity = snoise(pos * biomeScale + vec2(100.0)) * 0.5 + 0.5;
            humidity = humidity * 2.0 - 1.0;

            float wDesert = 0.0, wSnow = 0.0, wJungle = 0.0, wSwamp = 0.0, wPlains = 1.0;

            if (temp > 0.4) {
                float tFactor = smoothstep(0.4, 0.6, temp);
                if (humidity < -0.2) {
                    float hFactor = 1.0 - smoothstep(-0.2, 0.0, humidity);
                    wDesert = tFactor * hFactor;
                    wPlains = 1.0 - wDesert;
                } else if (humidity > 0.3) {
                    float hFactor = smoothstep(0.3, 0.5, humidity);
                    wJungle = tFactor * hFactor;
                    wPlains = 1.0 - wJungle;
                }
            } else if (temp < -0.3) {
                wSnow = 1.0 - smoothstep(-0.3, -0.1, temp);
                wPlains = 1.0 - wSnow;
            } else {
                if (humidity > 0.5) {
                    wSwamp = smoothstep(0.5, 0.7, humidity);
                    wPlains = 1.0 - wSwamp;
                } else if (humidity < -0.4) {
                    wDesert = 1.0 - smoothstep(-0.4, -0.2, humidity);
                    wPlains = 1.0 - wDesert;
                }
            }

            // 3. Octave Noise (CPU Äquivalent)
            float h_plains = fbm(pos * 0.005) * 10.0;
            float h_desert = fbm(pos * 0.002) * 5.0;
            float h_snow = fbm(pos * 0.008) * 40.0;
            float h_jungle = fbm(pos * 0.015) * 25.0;
            float h_swamp = -5.0 + fbm(pos * 0.01) * 8.0;

            float h = h_plains * wPlains + h_desert * wDesert + h_snow * wSnow + h_jungle * wJungle + h_swamp * wSwamp;
            h += 10.0; // Basis-Höhe

            // 4. Berge
            float distToCenter = length(pos);
            if (distToCenter > 1500.0) {
                float mountainEdge = (distToCenter - 1500.0) / 1000.0;
                float h_mountains = abs(fbm(pos * 0.002)) * 150.0;
                h += h_mountains * min(2.5, mountainEdge);
            }
            
            h *= villageFactor;
            
            // Schutz gegen extreme Werte
            h = clamp(h, -50.0, 500.0);

            gl_FragColor = vec4(h, 0.0, 0.0, 1.0);
        }
    `;

    const SMOOTH_SHADER = `
        void main() {
            vec2 uv = gl_FragCoord.xy / resolution.xy;
            vec2 texelSize = 1.0 / resolution.xy;
            
            float h = 0.0;
            float weightSum = 0.0;
            
            for(int y = -2; y <= 2; y++) {
                for(int x = -2; x <= 2; x++) {
                    float dist = length(vec2(float(x), float(y)));
                    float weight = exp(-dist * dist * 0.5); // Gauß-Blur
                    
                    h += texture2D(textureHeight, uv + vec2(float(x), float(y)) * texelSize).r * weight;
                    weightSum += weight;
                }
            }
            gl_FragColor = vec4(h / weightSum, 0.0, 0.0, 1.0);
        }
    `;

    function initGPGPU(renderer) {
        if (typeof THREE.GPUComputationRenderer === 'undefined') {
            console.error("GPUComputationRenderer not found!");
            return;
        }
        gpuCompute = new THREE.GPUComputationRenderer(GPU_TERRAIN_SIZE, GPU_TERRAIN_SIZE, renderer);
        
        const heightData = gpuCompute.createTexture();
        heightVariable = gpuCompute.addVariable("textureHeight", NOISE_SHADER, heightData);
        heightVariable.texture.magFilter = THREE.LinearFilter;
        heightVariable.texture.minFilter = THREE.LinearFilter;
        
        const smoothData = gpuCompute.createTexture();
        smoothVariable = gpuCompute.addVariable("textureSmooth", SMOOTH_SHADER, smoothData);
        smoothVariable.texture.magFilter = THREE.LinearFilter;
        smoothVariable.texture.minFilter = THREE.LinearFilter;
        
        gpuCompute.setVariableDependencies(smoothVariable, [heightVariable]);
        
        heightVariable.material.uniforms = {
            time: { value: 0 },
            offset: { value: new THREE.Vector2(0, 0) },
            worldSize: { value: GPU_WORLD_SIZE }
        };

        const error = gpuCompute.init();
        if (error !== null) console.error("GPGPU Init Error:", error);
    }

    function initClipmap(scene) {
        if (!scene) return;
        mainScene = scene;
        
        clipmapGroup = new THREE.Group();
        scene.add(clipmapGroup);

        // Circular Geometry for Radial Clipmap
        const geo = new THREE.CircleGeometry(CLIPMAP_RADIUS, CLIPMAP_SEGMENTS);
        
        // Wir verwenden einen Standard-Shader und passen ihn an
        clipmapMaterial = new THREE.MeshStandardMaterial({
            vertexColors: false,
            flatShading: false, // Smooth Shading für weniger Artefakte
            roughness: 0.9,
            metalness: 0.0,
            transparent: false, // Transparenz aus gegen Depth-Probleme
            side: THREE.FrontSide, // Nur Vorderseite rendern
            depthWrite: true,
            depthTest: true
        });

        // Custom Shader Injection für Displacement und Biome-Farben
        clipmapMaterial.onBeforeCompile = (shader) => {
            shader.uniforms.heightMap = { value: null };
            shader.uniforms.worldOffset = { value: new THREE.Vector2(0, 0) };
            shader.uniforms.gpuWorldSize = { value: GPU_WORLD_SIZE };
            shader.uniforms.clipRadius = { value: CLIPMAP_RADIUS };
            shader.uniforms.plainsColor = { value: new THREE.Color(0x557d45) };
            shader.uniforms.desertColor = { value: new THREE.Color(0xedcaaf) };
            shader.uniforms.snowColor = { value: new THREE.Color(0xffffff) };
            shader.uniforms.jungleColor = { value: new THREE.Color(0x2d4c1e) };
            shader.uniforms.swampColor = { value: new THREE.Color(0x2f351a) };
            shader.uniforms.stoneColor = { value: new THREE.Color(0x808080) };
            shader.uniforms.pathColor = { value: new THREE.Color(0x9b7653) };

            shader.vertexShader = `
                uniform sampler2D heightMap;
                uniform vec2 worldOffset;
                uniform float gpuWorldSize;
                varying vec3 vWorldPos;
                varying float vHeight;
                varying float vDist;
            ` + shader.vertexShader;

            shader.vertexShader = shader.vertexShader.replace(
                '#include <begin_vertex>',
                `
                // Welt-Position vor Verschiebung
                vec4 wPos = modelMatrix * vec4(position, 1.0);
                
                // UV für Heightmap (0-1 Bereich)
                // Wir nutzen hier eine präzisere Berechnung
                vec2 hUv = (wPos.xz - worldOffset) / gpuWorldSize + 0.5;
                
                // Höhe sampeln (Linear Filtered)
                float h = texture2D(heightMap, hUv).r;
                vHeight = h;
                
                // Displacement anwenden (Local Z wird zu World Y)
                vec3 transformed = vec3(position.x, position.y, h);
                
                // Final Weltposition für Fragment Shader
                vWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
                vDist = length(position.xy);
                `
            );

            shader.fragmentShader = `
                uniform vec3 plainsColor;
                uniform vec3 desertColor;
                uniform vec3 snowColor;
                uniform vec3 jungleColor;
                uniform vec3 swampColor;
                uniform vec3 stoneColor;
                uniform vec3 pathColor;
                uniform float clipRadius;
                varying vec3 vWorldPos;
                varying float vHeight;
                varying float vDist;

                // Simple hash for noise
                float hash(vec2 p) {
                    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
                }

                float noise(vec2 p) {
                    vec2 i = floor(p);
                    vec2 f = fract(p);
                    vec2 u = f * f * (3.0 - 2.0 * f);
                    return mix(mix(hash(i + vec2(0.0, 0.0)), hash(i + vec2(1.0, 0.0)), u.x),
                               mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
                }

                float fbm(vec2 p) {
                    float f = 0.0;
                    f += 0.5000 * noise(p); p *= 2.02;
                    f += 0.2500 * noise(p); p *= 2.03;
                    return f * 1.3333 - 0.3333; // Normalisieren
                }

                vec3 getBiomeColor(vec3 pos, float h) {
                    float x = pos.x;
                    float z = pos.z;
                    
                    // Biome-Noise (Skalierung muss mit CPU übereinstimmen)
                    float scale = 0.00015;
                    float temp = noise(pos.xz * 1000.0 * scale) * 2.0 - 1.0;
                    float humidity = noise(pos.xz * 1000.0 * scale + vec2(100.0)) * 2.0 - 1.0;

                    vec3 col = plainsColor;
                    
                    // Biome Weights (Matching CPU Logic)
                    float wDesert = 0.0, wSnow = 0.0, wJungle = 0.0, wSwamp = 0.0, wPlains = 1.0;

                    if (temp > 0.4) {
                        float tFactor = smoothstep(0.4, 0.6, temp);
                        if (humidity < -0.2) {
                            float hFactor = 1.0 - smoothstep(-0.2, 0.0, humidity);
                            wDesert = tFactor * hFactor;
                            wPlains = 1.0 - wDesert;
                        } else if (humidity > 0.3) {
                            float hFactor = smoothstep(0.3, 0.5, humidity);
                            wJungle = tFactor * hFactor;
                            wPlains = 1.0 - wJungle;
                        }
                    } else if (temp < -0.3) {
                        wSnow = 1.0 - smoothstep(-0.3, -0.1, temp);
                        wPlains = 1.0 - wSnow;
                    } else {
                        if (humidity > 0.5) {
                            wSwamp = smoothstep(0.5, 0.7, humidity);
                            wPlains = 1.0 - wSwamp;
                        } else if (humidity < -0.4) {
                            wDesert = 1.0 - smoothstep(-0.4, -0.2, humidity);
                            wPlains = 1.0 - wDesert;
                        }
                    }

                    col = plainsColor * wPlains + desertColor * wDesert + snowColor * wSnow + jungleColor * wJungle + swampColor * wSwamp;

                    // Dorf-Einfluss (Terrain-Abflachung Regionen)
                    float distToVillage = 9999.0;
                    distToVillage = min(distToVillage, length(pos.xz - vec2(0.0, 0.0)));
                    distToVillage = min(distToVillage, length(pos.xz - vec2(1200.0, 0.0)));
                    distToVillage = min(distToVillage, length(pos.xz - vec2(-1200.0, 0.0)));
                    distToVillage = min(distToVillage, length(pos.xz - vec2(0.0, 1200.0)));
                    distToVillage = min(distToVillage, length(pos.xz - vec2(0.0, -1200.0)));

                    // 1. Village / Path Detection (Matching CPU Logic)
                    if (distToVillage < 400.0) {
                        float villageEffect = 1.0 - smoothstep(0.0, 300.0, distToVillage); // Radius-Anpassung
                        float pathNoise = noise(pos.xz * 0.05); // simpleNoise-Äquivalent
                        
                        if (pathNoise > 0.3) {
                            col = mix(col, stoneColor, villageEffect * 0.8);
                        } else if (pathNoise > -0.2) {
                            col = mix(col, pathColor, villageEffect * 0.7);
                        }
                    }

                    // Laub/Erde Variation (nur in Plains/Jungle)
                    if (wPlains > 0.5 || wJungle > 0.5) {
                        float leafNoise = noise(pos.xz * 0.1);
                        if (leafNoise > 0.4) {
                            col = mix(col, vec3(0.239, 0.169, 0.122), 0.3); // 0x3d2b1f
                        }
                    }

                    // Stein bei steilen Hängen und hohen Bergen
                    float slopeNoise = noise(pos.xz * 0.5);
                    float slopeThreshold = 28.0 + slopeNoise * 12.0;
                    
                    if (h > slopeThreshold) {
                        float blend = smoothstep(slopeThreshold, slopeThreshold + 15.0, h);
                        col = mix(col, stoneColor, blend);
                    }

                    // Mikro-Rauschen für Details
                    float n = hash(pos.xz * 0.1);
                    col *= 0.92 + 0.12 * n;
                    
                    // Höhen-Schattierung (Tiefland dunkler, Gipfel heller)
                    col *= smoothstep(-10.0, 50.0, h) * 0.5 + 0.6;
                    
                    return col;
                }
            ` + shader.fragmentShader;

            shader.fragmentShader = shader.fragmentShader.replace(
                '#include <color_fragment>',
                `
                diffuseColor.rgb = getBiomeColor(vWorldPos, vHeight);
                `
            );

            // Alpha-Ausblendung am Rand (Alpha-Boden) mit Noise-Kante
            // Wir nutzen hier opacity direkt da wir transparent=false haben
            shader.fragmentShader = shader.fragmentShader.replace(
                '#include <alphamap_fragment>',
                `
                #include <alphamap_fragment>
                float edgeNoise = noise(vWorldPos.xz * 0.02) * 40.0;
                float edgeFade = smoothstep(clipRadius, clipRadius - 100.0 + edgeNoise, vDist);
                if (vDist > clipRadius) discard;
                `
            );

            clipmapMaterial.userData.shader = shader;
        };


        clipmapMesh = new THREE.Mesh(geo, clipmapMaterial);
        clipmapMesh.rotation.x = -Math.PI / 2;
        clipmapMesh.receiveShadow = true;
        clipmapMesh.castShadow = true;
        clipmapMesh.frustumCulled = false; // Gegen Verschwinden bei hohen Bergen
        clipmapGroup.add(clipmapMesh);

        // Backup Plane
        const backGeo = new THREE.CircleGeometry(CLIPMAP_RADIUS + 10, 32);
        const backMat = new THREE.MeshStandardMaterial({ 
            color: 0x1a2a1a, 
            transparent: true, 
            opacity: 0.3 
        });
        clipmapBackupMesh = new THREE.Mesh(backGeo, backMat);
        clipmapBackupMesh.rotation.x = -Math.PI / 2;
        clipmapBackupMesh.position.y = -5;
        clipmapGroup.add(clipmapBackupMesh);
    }

    function updateClipmap(px, pz, renderer) {
        if (!clipmapMesh || !gpuCompute) return;

        // Clipmap folgt dem Spieler (gesnappt an ein kleines Gitter gegen Zittern)
        const snap = 1.0;
        const sx = Math.floor(px / snap) * snap;
        const sz = Math.floor(pz / snap) * snap;
        
        clipmapGroup.position.set(sx, 0, sz);

        // GPGPU Update (Textur folgt Spieler)
        updateGPGPU(px, pz, renderer);

        // Uniforms im Shader aktualisieren
        if (clipmapMaterial.userData.shader) {
            const shader = clipmapMaterial.userData.shader;
            shader.uniforms.heightMap.value = gpuCompute.getCurrentRenderTarget(smoothVariable).texture;
            
            // Der worldOffset ist das Zentrum der GPGPU Textur
            shader.uniforms.worldOffset.value.set(px, pz);
        }

        // Dekorationen aktualisieren
        updateClipmapDecorations(px, pz, mainScene);
    }

    function updateGPGPU(px, pz, renderer) {
        if (!gpuCompute) return;
        
        // Offset so setzen, dass der Spieler in der Mitte der Textur ist
        const ox = px - GPU_WORLD_SIZE / 2;
        const oz = pz - GPU_WORLD_SIZE / 2;
        
        heightVariable.material.uniforms.offset.value.set(ox, oz);
        gpuCompute.compute();
        
        const renderTarget = gpuCompute.getCurrentRenderTarget(smoothVariable);
        renderer.readRenderTargetPixels(renderTarget, 0, 0, GPU_TERRAIN_SIZE, GPU_TERRAIN_SIZE, gpuHeightData);
    }
    
    function getGPUHeight(x, z) {
        if (!gpuCompute) return getTerrainHeight(x, z);
        
        const ox = heightVariable.material.uniforms.offset.value.x;
        const oz = heightVariable.material.uniforms.offset.value.y;
        
        // Relative Position in UV umrechnen (0 bis 1)
        const u = (x - ox) / GPU_WORLD_SIZE;
        const v = (z - oz) / GPU_WORLD_SIZE;
        
        if (u < 0 || u > 1 || v < 0 || v > 1) {
            return getTerrainHeight(x, z);
        }

        // Bilineare Interpolation für glatteres Terrain
        const fx = u * (GPU_TERRAIN_SIZE - 1);
        const fz = v * (GPU_TERRAIN_SIZE - 1);
        const ix = Math.floor(fx);
        const iz = Math.floor(fz);
        const tx = fx - ix;
        const tz = fz - iz;

        const getH = (x, z) => {
            const idx = (z * GPU_TERRAIN_SIZE + x) * 4;
            return gpuHeightData[idx];
        };

        const h00 = getH(ix, iz);
        const h10 = getH(Math.min(ix + 1, GPU_TERRAIN_SIZE - 1), iz);
        const h01 = getH(ix, Math.min(iz + 1, GPU_TERRAIN_SIZE - 1));
        const h11 = getH(Math.min(ix + 1, GPU_TERRAIN_SIZE - 1), Math.min(iz + 1, GPU_TERRAIN_SIZE - 1));

        const h = (h00 * (1 - tx) + h10 * tx) * (1 - tz) +
                  (h01 * (1 - tx) + h11 * tx) * tz;
        
        // Fallback wenn GPGPU noch keine Daten hat
        if (h === 0 && Math.abs(x) > 10 && Math.abs(z) > 10) {
            return getTerrainHeight(x, z);
        }
        
        return h;
    }
    
    // Basis-Pfad für Assets (Lokal vs. GitHub flexibel)
    // Dieser Pfad wird jetzt zentral in AssetsLibrary.js verwaltet.
    
    let chunks = new Map(); // Nur noch für Kollision/Vegetation im Hintergrund (Veraltet)
    let villageBuildings = [];
    const VILLAGE_POS = { x: 0, z: 0 };
    
    let isInterior = false;
    let currentInterior = null;
    let selectedHouse = null;
    let calibrationParams = {
        overallScale: 6.0,
        targetWidth: 6.5,
        targetDepth: 6.5,
        wallScaleW: 1.625,
        wallScaleD: 1.625,
        roofScaleY: 1.3,
        gableScaleY: 1.3,
        wallY: 0,
        roofY: 4,
        offsetX: 0,
        offsetY: 0,
        offsetZ: 0,
        houseModel: 'house1'
    };

    // Lade initiale Werte aus LocalStorage falls vorhanden
    const savedParams = localStorage.getItem('houseCalibrationParams');
    if (savedParams) {
        try {
            const parsed = JSON.parse(savedParams);
            calibrationParams = { ...calibrationParams, ...parsed };
        } catch (e) {
            console.warn("Fehler beim Laden der Kalibrierung aus LocalStorage:", e);
        }
    }

    function selectNearestHouse(px, pz) {
        let minDist = Infinity;
        let nearest = null;
        
        // Suche in allen geladenen Chunks nach Häusern
        chunks.forEach(chunk => {
            if (chunk.group) {
                chunk.group.children.forEach(obj => {
                    if (obj.isBuildingGroup) { // Wir müssen diese Flag beim Erstellen setzen
                        const dist = Math.hypot(obj.position.x - px, obj.position.z - pz);
                        if (dist < minDist) {
                            minDist = dist;
                            nearest = obj;
                        }
                    }
                });
            }
        });

        if (nearest) {
            if (selectedHouse) {
                // Vorheriges Haus entmarkieren (z.B. BoxHelper entfernen)
                selectedHouse.remove(selectedHouse.getObjectByName("CalibrationHelper"));
            }
            selectedHouse = nearest;
            const helper = new THREE.BoxHelper(selectedHouse, 0x00ff00);
            helper.name = "CalibrationHelper";
            selectedHouse.add(helper);
            console.log("[Kalibrierung] Haus ausgewählt:", selectedHouse.userData.name);
            return true;
        }
        return false;
    }

    async function updateCalibration(params) {
        if (!selectedHouse) return;
        Object.assign(calibrationParams, params);
        
        // Speichere in LocalStorage
        localStorage.setItem('houseCalibrationParams', JSON.stringify(calibrationParams));
        
        // Haus neu aufbauen
        const x = selectedHouse.position.x;
        const z = selectedHouse.position.z;
        const name = selectedHouse.userData.name;
        const parent = selectedHouse.parent;
        
        // Altes Haus entfernen
        parent.remove(selectedHouse);
        
        // Typ bestimmen (Kalibrierung oder House1)
        let type = 'calibration';
        if (calibrationParams.houseModel === 'house1') {
            type = 'house1';
        }

        // Neues Haus mit Kalibrierungswerten erstellen
        const newHouse = await createModularHouse(type, x, z);
        newHouse.userData.name = name;
        newHouse.isBuildingGroup = true;
        parent.add(newHouse);
        
        selectedHouse = newHouse;
        const helper = new THREE.BoxHelper(selectedHouse, 0x00ff00);
        helper.name = "CalibrationHelper";
        selectedHouse.add(helper);
    }

    let lastExteriorPos = null;

    const INTERIOR_POS_SMITHY = { x: 5000, y: 0, z: 5000 };
    const INTERIOR_POS_INN = { x: 5200, y: 0, z: 5200 };
    const INTERIOR_POS_MARKET = { x: 5400, y: 0, z: 5400 };

    let rainParticles = null;
    let grassInst = null;
    let fireParticles = [];
    let blacksmithNPC = null;
    let innkeeperNPC = null;
    let marketNPC = null;
    let villageGroups = [];
    let riverPlanes = [];

    function getQuality() {
        const pr = Math.max(1, Math.min(window.devicePixelRatio || 1, 3));
        const cores = (navigator.hardwareConcurrency || 4);
        const mem = (navigator.deviceMemory || 4);
        let q = 2;
        if (pr <= 1 && (cores <= 4 || mem <= 4)) q = 1;
        if (pr >= 2 && cores >= 8 && mem >= 8) q = 3;
        return q;
    }

    const QUALITY = getQuality();

    // Fallback für globale noise-Variable, falls eine Bibliothek fehlt
    if (typeof window.noise === 'undefined') {
        window.noise = {
            perlin2: (x, y) => simpleNoise(x, y),
            seed: (s) => {}
        };
    }

    let loader;
    try {
        if (typeof THREE.GLTFLoader !== 'undefined') {
            loader = new THREE.GLTFLoader();
            
            // DracoLoader hinzufügen für komprimierte .glb Dateien
            if (typeof THREE.DRACOLoader !== 'undefined') {
                const dracoLoader = new THREE.DRACOLoader();
                // Nutze das Google-CDN für die Draco-Decoder-Dateien
                dracoLoader.setDecoderPath('https://www.gstatic.com/draco/v1/decoders/');
                loader.setDRACOLoader(dracoLoader);
            }
        } else {
            console.error("THREE.GLTFLoader ist nicht definiert. Stelle sicher, dass der Loader in index.html korrekt geladen wird.");
        }
    } catch (e) {
        console.error("Fehler beim Initialisieren des GLTFLoaders:", e);
    }

    const modelCache = new Map();

    async function loadModel(path) {
        if (modelCache.has(path)) return modelCache.get(path).clone();
        if (!loader) {
            console.warn("Loader nicht verfügbar für:", path);
            throw new Error("Loader not initialized");
        }
        
        // Die AssetsLibrary übernimmt jetzt die Pfad-Kodierung
        // Falls der Pfad bereits ein voller URL/kodiert ist, lassen wir ihn
        const encodedPath = (path.startsWith('http') || path.startsWith('animation/') || path.includes('%')) 
            ? path 
            : AssetsLibrary.encode(path);
        
        const tryLoad = (fullPath) => {
        return new Promise((resolve, reject) => {
            // Bestimme den Basis-Pfad für Texturen (alles vor dem Dateinamen)
            const lastSlash = fullPath.lastIndexOf('/');
            const basePath = lastSlash !== -1 ? fullPath.substring(0, lastSlash + 1) : '';
            loader.setPath(''); // Reset
            
            loader.load(fullPath, (gltf) => {
                // Falls das Modell Texturen hat, die relativ geladen werden müssen
                gltf.scene.traverse(obj => {
                    if (obj.isMesh && obj.material) {
                        const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
                        mats.forEach(m => {
                            if (m.map) m.map.name = m.map.name || "texture";
                        });
                    }
                });
                modelCache.set(path, gltf.scene);
                resolve(gltf.scene.clone());
            }, undefined, (err) => {
                // Nur bei echten Fehlern loggen, um Rauschen zu vermeiden
                if (err instanceof RangeError || (err.message && err.message.includes('out-of-bounds'))) {
                    console.error("!!! GLB STRUKTUR-FEHLER !!!", fullPath);
                }
                reject(err);
            });
        });
    };

        try {
            return await tryLoad(encodedPath);
        } catch (e) {
            // Fallback-Logik bleibt erhalten, falls der Pfad nicht aus der Library kam
            if (path.includes('/glTF/')) {
                const fallbackPath = path.replace('/glTF/', '/');
                console.log("Erster Ladeversuch fehlgeschlagen, versuche Fallback:", fallbackPath);
                return await tryLoad(fallbackPath);
            }
            throw e;
        }
    }

    async function createModularHouse(type = 'small', seedX = 0, seedZ = 0) {
        const group = new THREE.Group();
        
        // Spezialfall: Neues House_1.glb Modell
        if (type === 'house1' || (type === 'calibration' && calibrationParams.houseModel === 'house1')) {
            try {
                const model = await loadModel(AssetsLibrary.get('HOUSE', 'HOUSE_1'));
                
                let s = 10;
                if (type === 'calibration') {
                    s = calibrationParams.overallScale;
                    group.position.x += calibrationParams.offsetX;
                    group.position.y += calibrationParams.offsetY;
                    group.position.z += calibrationParams.offsetZ;
                } else {
                    // Deterministische Variation für normale Häuser
                    const houseRng = () => {
                        const s = Math.sin(seedX * 12.9898 + seedZ * 78.233) * 43758.5453;
                        return s - Math.floor(s);
                    };
                    const rand = houseRng();
                    s = 8 + rand * 4; // Skalierung 8-12
                    group.rotation.y = Math.floor(rand * 4) * (Math.PI / 2); // 0, 90, 180, 270 Grad
                }
                
                model.scale.set(s, s, s);
                group.add(model);
                return group;
            } catch (e) {
                console.warn("Konnte House_1.glb nicht laden, wechsle zu modular:", e);
                // Fallback zu modular
            }
        }

        // Grundwerte initialisieren
        let currentScale = 6.0;
        let targetWidth, targetDepth, wallScaleW, wallScaleD;
        let roofScaleY = 1.3, gableScaleY = 1.3;
        let wallY = 0, roofY = 4;

        if (type === 'calibration') {
            currentScale = calibrationParams.overallScale;
            targetWidth = calibrationParams.targetWidth;
            targetDepth = calibrationParams.targetDepth;
            wallScaleW = calibrationParams.wallScaleW;
            wallScaleD = calibrationParams.wallScaleD;
            roofScaleY = calibrationParams.roofScaleY;
            gableScaleY = calibrationParams.gableScaleY;
            wallY = calibrationParams.wallY;
            roofY = calibrationParams.roofY;
            
            // Positions-Offsets anwenden
            group.position.x += calibrationParams.offsetX;
            group.position.y += calibrationParams.offsetY;
            group.position.z += calibrationParams.offsetZ;
        } else {
            // Deterministischer Zufall basierend auf Position für konsistente Größe
            const houseRng = () => {
                const s = Math.sin(seedX * 12.9898 + seedZ * 78.233) * 43758.5453;
                return s - Math.floor(s);
            };
            const BASE_SIZE = 4.0; 
            targetWidth = 4.5 + houseRng() * 4.0;
            targetDepth = 4.5 + houseRng() * 4.0;
            wallScaleW = targetWidth / BASE_SIZE;
            wallScaleD = targetDepth / BASE_SIZE;
        }

        const halfW = targetWidth / 2;
        const halfD = targetDepth / 2;

        try {
            // Boden (skaliert auf exakte Fundamentgröße)
            const floor = await loadModel(AssetsLibrary.get('VILLAGE', 'FLOOR_WOOD'));
            floor.scale.set(wallScaleW, 1, wallScaleD);
            group.add(floor);

            // Wände (Skalierung füllt Raum zwischen Eckpfeilern zu 100%)
            const wallConfigs = [
                { path: 'WALL_DOOR', pos: [0, wallY, halfD], rot: 0, scale: wallScaleW },
                { path: 'WALL_WINDOW', pos: [halfW, wallY, 0], rot: Math.PI / 2, scale: wallScaleD },
                { path: 'WALL_STRAIGHT', pos: [0, wallY, -halfD], rot: Math.PI, scale: wallScaleW },
                { path: 'WALL_STRAIGHT', pos: [-halfW, wallY, 0], rot: -Math.PI / 2, scale: wallScaleD }
            ];

            for (const config of wallConfigs) {
                const wall = await loadModel(AssetsLibrary.get('VILLAGE', config.path));
                wall.position.set(...config.pos);
                wall.rotation.y = config.rot;
                wall.scale.x = config.scale; 
                group.add(wall);
            }

            // Ecken (Pfeiler) - An die Ecken des Fundaments gepinnt
            const cornerPos = [
                [halfW, 0, halfD],   // VR
                [-halfW, 0, halfD],  // VL
                [-halfW, 0, -halfD], // HL
                [halfW, 0, -halfD]   // HR
            ];

            for (let i = 0; i < 4; i++) {
                const corner = await loadModel(AssetsLibrary.get('VILLAGE', 'CORNER'));
                corner.position.set(...cornerPos[i]);
                corner.rotation.y = i * (-Math.PI / 2) + Math.PI/2;
                group.add(corner);
            }

            // Dach (Skalierung folgt Fundament)
            const roof = await loadModel(AssetsLibrary.get('VILLAGE', 'ROOF_4X4'));
            roof.scale.set(wallScaleW, roofScaleY, wallScaleD); 
            roof.position.set(0, roofY, 0); 
            group.add(roof);

            // Giebel (Dachabschluss)
            let gablePath = AssetsLibrary.get('VILLAGE', 'ROOF_GABLE');
            if (gablePath.endsWith('ROOF_GABLE')) {
                 gablePath = AssetsLibrary.encode('animation/Medieval Village MegaKit[Standard]/glTF/Roof_Front_Brick4.gltf');
            }

            const gableFront = await loadModel(gablePath);
            gableFront.position.set(0, roofY, halfD);
            gableFront.scale.set(wallScaleW, gableScaleY, 1);
            group.add(gableFront);

            const gableBack = await loadModel(gablePath);
            gableBack.position.set(0, roofY, -halfD);
            gableBack.rotation.y = Math.PI;
            gableBack.scale.set(wallScaleW, gableScaleY, 1);
            group.add(gableBack);

            group.scale.set(currentScale, currentScale, currentScale);
        } catch (e) {
            console.error("Error building modular house:", e);
            // Fallback: Einfaches Low-Poly Haus
            const houseBody = new THREE.Mesh(
                new THREE.BoxGeometry(7, 7, 7),
                new THREE.MeshStandardMaterial({ color: 0x8b4513, flatShading: true })
            );
            houseBody.position.y = 3.5;
            group.add(houseBody);

            const roof = new THREE.Mesh(
                new THREE.ConeGeometry(6, 4, 4),
                new THREE.MeshStandardMaterial({ color: 0x4a3728, flatShading: true })
            );
            roof.position.y = 9;
            roof.rotation.y = Math.PI / 4;
            group.add(roof);
        }

        return group;
    }

    async function createMonsterModel(type = 'WARRIOR') {
        const group = new THREE.Group();
        try {
            // Hole Pfad aus AssetsLibrary
            const modelPath = AssetsLibrary.get('SKELETONS', type.toUpperCase());
            const model = await loadModel(modelPath);
            group.add(model);

            // Animationen vorbereiten (General Rig)
            const animPath = AssetsLibrary.get('SKELETONS', 'GENERAL');
            // Hier könnte man den AnimationMixer laden
        } catch (e) {
            console.error("Error creating monster model:", e);
            // Fallback: Rote Box
            const fallback = new THREE.Mesh(
                new THREE.BoxGeometry(4, 8, 4),
                new THREE.MeshStandardMaterial({ color: 0xff0000 })
            );
            fallback.position.y = 4;
            group.add(fallback);
        }
        return group;
    }

    // --- VERBESSERTE NOISE-FUNKTION (Multi-Octave) ---
    function simpleNoise(x, z) {
        let n = Math.sin(x * 0.0123 + z * 0.0456) + Math.cos(x * 0.0789 - z * 0.0123);
        n += Math.sin(x * 0.0234 - z * 0.0567) * 0.5;
        return n * 0.5;
    }

    function getOctaveNoise(x, z, octaves = 4) {
        let v = 0;
        let a = 1.0;
        let f = 1.0;
        for (let i = 0; i < octaves; i++) {
            v += simpleNoise(x * f, z * f) * a;
            f *= 2.0;
            a *= 0.5;
        }
        return v;
    }

    // --- DORF-POSITIONEN (für Terrain-Glättung) ---
    const VILLAGE_LOCATIONS = [
        { x: 0, z: 0, radius: 400 },     // Hauptdorf
        { x: 1200, z: 0, radius: 300 },   // Biome Dorf 1
        { x: -1200, z: 0, radius: 300 },  // Biome Dorf 2
        { x: 0, z: 1200, radius: 300 },   // Biome Dorf 3
        { x: 0, z: -1200, radius: 300 }   // Biome Dorf 4
    ];

    function getTerrainHeight(x, z) {
        const distToCenter = Math.hypot(x, z);
        
        // 1. Village Zone (Dorf-Bereiche flach halten)
        let villageFactor = 1.0;
        for (const loc of VILLAGE_LOCATIONS) {
            const d = Math.hypot(x - loc.x, z - loc.z);
            if (d < loc.radius) {
                const f = Math.max(0, (d - loc.radius * 0.4) / (loc.radius * 0.6));
                villageFactor = Math.min(villageFactor, Math.pow(f, 2));
            }
        }

        // 2. Basis-Höhe durch Biome bestimmt
        const biome = getBiomeData(x, z);
        let h = 0;

        // Biome-spezifische Höhenprofile
        const h_plains = getOctaveNoise(x * 0.005, z * 0.005, 3) * 10;
        const h_desert = getOctaveNoise(x * 0.002, z * 0.002, 2) * 5;
        const h_mountains = getOctaveNoise(x * 0.01, z * 0.01, 5) * 80;
        const h_snow = getOctaveNoise(x * 0.008, z * 0.008, 4) * 40;
        const h_jungle = getOctaveNoise(x * 0.015, z * 0.015, 4) * 25;
        const h_swamp = -5 + getOctaveNoise(x * 0.01, z * 0.01, 2) * 8;

        // Blending der Höhen basierend auf Biome-Gewichten
        h += h_plains * biome.weights.plains;
        h += h_desert * biome.weights.desert;
        h += h_snow * biome.weights.snow;
        h += h_jungle * biome.weights.jungle;
        h += h_swamp * biome.weights.swamp;

        h += 10.0; // Basis-Höhe (muss mit GPGPU-Shader übereinstimmen)

        // 3. Große Berge im Hintergrund (nur weit weg vom Zentrum und Dörfern)
        if (distToCenter > 1500) {
            const mountainEdge = (distToCenter - 1500) / 1000;
            h += h_mountains * Math.min(2.5, mountainEdge);
        }

        return h * villageFactor;
    }

    function getBiomeData(x, z) {
        // Diese Logik MUSS mit dem Clipmap-Shader in initClipmap übereinstimmen!
        const scale = 0.00015;
        
        // Einfacher 2D Value-Noise Nachbau für CPU (wie im Shader)
        const noise2D = (nx, nz) => {
            const hash = (p) => {
                const s = Math.sin(p[0] * 127.1 + p[1] * 311.7) * 43758.5453123;
                return s - Math.floor(s);
            };
            const ix = Math.floor(nx);
            const iz = Math.floor(nz);
            const fx = nx - ix;
            const fz = nz - iz;
            const ux = fx * fx * (3.0 - 2.0 * fx);
            const uz = fz * fz * (3.0 - 2.0 * fz);
            
            const v00 = hash([ix, iz]);
            const v10 = hash([ix + 1, iz]);
            const v01 = hash([ix, iz + 1]);
            const v11 = hash([ix + 1, iz + 1]);
            
            return (v00 * (1 - ux) + v10 * ux) * (1 - uz) +
                   (v01 * (1 - ux) + v11 * ux) * uz;
        };

        const temp = noise2D(x * 1000.0 * scale, z * 1000.0 * scale) * 2.0 - 1.0;
        const humidity = noise2D(x * 1000.0 * scale + 100.0, z * 1000.0 * scale + 100.0) * 2.0 - 1.0;

        // Gewichte berechnen für sanfte Übergänge
        const weights = {
            desert: 0,
            snow: 0,
            jungle: 0,
            swamp: 0,
            plains: 0
        };

        // Einfaches Weighting basierend auf Schwellenwerten mit Smoothing
        const smoothStep = (edge0, edge1, x) => {
            const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
            return t * t * (3 - 2 * t);
        };

        if (temp > 0.4) {
            const tFactor = smoothStep(0.4, 0.6, temp);
            if (humidity < -0.2) {
                const hFactor = 1.0 - smoothStep(-0.2, 0.0, humidity);
                weights.desert = tFactor * hFactor;
                weights.plains = 1.0 - weights.desert;
            } else if (humidity > 0.3) {
                const hFactor = smoothStep(0.3, 0.5, humidity);
                weights.jungle = tFactor * hFactor;
                weights.plains = 1.0 - weights.jungle;
            } else {
                weights.plains = 1.0;
            }
        } else if (temp < -0.3) {
            weights.snow = 1.0 - smoothStep(-0.3, -0.1, temp);
            weights.plains = 1.0 - weights.snow;
        } else {
            if (humidity > 0.5) {
                weights.swamp = smoothStep(0.5, 0.7, humidity);
                weights.plains = 1.0 - weights.swamp;
            } else if (humidity < -0.4) {
                weights.desert = 1.0 - smoothStep(-0.4, -0.2, humidity);
                weights.plains = 1.0 - weights.desert;
            } else {
                weights.plains = 1.0;
            }
        }

        // Haupt-Biom bestimmen (für Kompatibilität)
        let maxWeight = -1;
        let mainBiome = 'plains';
        for (const [name, w] of Object.entries(weights)) {
            if (w > maxWeight) {
                maxWeight = w;
                mainBiome = name;
            }
        }

        return { name: mainBiome, temp, humidity, weights };
    }

    function getBiomeColor(x, z) {
        const data = getBiomeData(x, z);
        
        // 1. Village / Path Detection
        let isVillage = false;
        let distToVillage = 9999;
        for (const loc of VILLAGE_LOCATIONS) {
            const d = Math.hypot(x - loc.x, z - loc.z);
            if (d < loc.radius) {
                isVillage = true;
                distToVillage = Math.min(distToVillage, d);
            }
        }

        const biomeColors = {
            desert: new THREE.Color(0xedc9af),
            snow: new THREE.Color(0xffffff),
            jungle: new THREE.Color(0x1a472a),
            swamp: new THREE.Color(0x2f351e),
            plains: new THREE.Color(0x567d46),
            stone: new THREE.Color(0x808080),
            path: new THREE.Color(0x9b7653) // Braun für Wege
        };
        
        // Blending der Farben basierend auf Gewichten
        let finalColor = new THREE.Color(0, 0, 0);
        
        const blend = (color, weight) => {
            finalColor.r += color.r * weight;
            finalColor.g += color.g * weight;
            finalColor.b += color.b * weight;
        };

        blend(biomeColors.desert, data.weights.desert);
        blend(biomeColors.snow, data.weights.snow);
        blend(biomeColors.jungle, data.weights.jungle);
        blend(biomeColors.swamp, data.weights.swamp);
        blend(biomeColors.plains, data.weights.plains);

        // 2. Village Ground logic
        if (isVillage) {
            const villageEffect = 1.0 - Math.min(1.0, distToVillage / 300);
            const pathNoise = getOctaveNoise(x * 0.05, z * 0.05, 2);
            
            // In Dorfnähe mischen wir Stein und Weg-Farben ein
            if (pathNoise > 0.3) {
                finalColor.lerp(biomeColors.stone, villageEffect * 0.8);
            } else if (pathNoise > -0.2) {
                finalColor.lerp(biomeColors.path, villageEffect * 0.7);
            }
        }
        
        // 3. Laub/Erde Variation (nur in Plains/Jungle)
        if (data.weights.plains > 0.5 || data.weights.jungle > 0.5) {
            const leafNoise = getOctaveNoise(x * 0.1, z * 0.1, 2);
            if (leafNoise > 0.4) {
                finalColor.lerp(new THREE.Color(0x3d2b1f), 0.3); // Dunkle Erde/Laub
            }
        }
        
        // Kleine Rausch-Variation für "Textur"-Effekt
        const noise = simpleNoise(x * 0.5, z * 0.5) * 0.05;
        finalColor.r += noise;
        finalColor.g += noise;
        finalColor.b += noise;
        
        return finalColor;
    }

    function createDetailedTree(x, z, h, rng, leafColor = 0x567d46, customScale = 1.0) {
        const g = new THREE.Group();
        g.position.set(x, h, z);
        const s = (0.8 + rng() * 1.2) * customScale;
        
        const trunkMat = new THREE.MeshStandardMaterial({ color: PALETTE.trunk, flatShading: true });
        const trunk = new THREE.Mesh(
            new THREE.CylinderGeometry(0.8, 2.5, 15, 7),
            trunkMat
        );
        trunk.position.y = 7.5;
        trunk.castShadow = true;
        trunk.receiveShadow = true;
        g.add(trunk);

        const rootCount = 3 + Math.floor(rng() * 3);
        for(let i=0; i<rootCount; i++) {
            const angle = (i / rootCount) * Math.PI * 2 + rng() * 0.5;
            const root = new THREE.Mesh(
                new THREE.BoxGeometry(1.5, 1.2, 7 + rng() * 3),
                trunkMat
            );
            const dist = 2 + rng();
            root.position.set(Math.cos(angle) * dist, 0.2, Math.sin(angle) * dist);
            root.rotation.y = angle;
            root.rotation.x = 0.3 + rng() * 0.2;
            root.rotation.z = (rng() - 0.5) * 0.2;
            root.castShadow = true;
            g.add(root);
        }

        const crown = new THREE.Mesh(
            new THREE.DodecahedronGeometry(10, 0),
            new THREE.MeshStandardMaterial({ color: leafColor, flatShading: true })
        );
        crown.position.y = 18;
        crown.castShadow = true;
        g.add(crown);

        g.scale.set(s, s, s);
        return g;
    }

    function createCactus(rng) {
        const g = new THREE.Group();
        const mat = new THREE.MeshStandardMaterial({ color: 0x556b2f, flatShading: true });
        
        // Hauptstamm
        const body = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.5, 12, 6), mat);
        body.position.y = 6;
        g.add(body);
        
        // Arme
        for(let i=0; i<2; i++) {
            const arm = new THREE.Group();
            arm.position.y = 5 + rng() * 4;
            arm.rotation.y = rng() * Math.PI * 2;
            
            const part1 = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, 4, 6), mat);
            part1.rotation.z = Math.PI / 2;
            part1.position.x = 2;
            arm.add(part1);
            
            const part2 = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, 6, 6), mat);
            part2.position.set(4, 2, 0);
            arm.add(part2);
            
            g.add(arm);
        }
        return g;
    }

    function createPalm(rng) {
        const g = new THREE.Group();
        const trunkMat = new THREE.MeshStandardMaterial({ color: 0x8b4513, flatShading: true });
        
        // Gebogener Stamm
        const trunk = new THREE.Group();
        let currY = 0;
        let currX = 0;
        for(let i=0; i<8; i++) {
            const seg = new THREE.Mesh(new THREE.CylinderGeometry(1.5 - i*0.1, 1.6 - i*0.1, 4, 6), trunkMat);
            seg.position.y = 2;
            const node = new THREE.Group();
            node.position.y = currY;
            node.position.x = currX;
            node.rotation.z = Math.sin(i * 0.5) * 0.1;
            node.add(seg);
            trunk.add(node);
            currY += 3.5;
            currX += Math.sin(i * 0.5) * 0.5;
        }
        g.add(trunk);
        
        // Blätter
        const leafMat = new THREE.MeshStandardMaterial({ color: 0x228b22, flatShading: true, side: THREE.DoubleSide });
        const leafGeo = new THREE.BoxGeometry(1, 15, 0.2);
        for(let i=0; i<10; i++) {
            const leaf = new THREE.Mesh(leafGeo, leafMat);
            leaf.position.y = currY;
            leaf.position.x = currX;
            leaf.rotation.y = (i / 10) * Math.PI * 2;
            leaf.rotation.z = 1.2;
            leaf.geometry.translate(0, 7.5, 0);
            g.add(leaf);
        }
        
        return g;
    }

    function spawnClutter(group, x, z, h, rng) {
        const type = rng();
        if (type > 0.85) {
            const stoneGeo = new THREE.DodecahedronGeometry(1 + rng() * 2, 0);
            const stoneMat = new THREE.MeshStandardMaterial({ color: 0x888888, flatShading: true });
            const stone = new THREE.Mesh(stoneGeo, stoneMat);
            stone.position.set(x, h + 0.5, z);
            stone.rotation.set(rng(), rng(), rng());
            group.add(stone);
        } else if (type > 0.6) {
            const bushGeo = new THREE.IcosahedronGeometry(2, 0);
            const bushMat = new THREE.MeshStandardMaterial({ color: 0x3a5a2a, flatShading: true });
            const bush = new THREE.Mesh(bushGeo, bushMat);
            bush.position.set(x, h + 1, z);
            group.add(bush);
        } else if (type > 0.5) {
            const bench = createBench(x, z, rng() * Math.PI, h);
            group.add(bench);
        }
    }

    function createDesertRuin(rng) {
        const g = new THREE.Group();
        const stoneMat = new THREE.MeshStandardMaterial({ color: 0xbc8f8f, flatShading: true });
        for(let i=0; i<3; i++) {
            const pillar = new THREE.Mesh(new THREE.BoxGeometry(4, 10 + rng()*15, 4), stoneMat);
            pillar.position.set((rng()-0.5)*20, 5, (rng()-0.5)*20);
            pillar.rotation.set(rng()*0.2, rng()*Math.PI, rng()*0.2);
            g.add(pillar);
        }
        return g;
    }

    function createDesertRock(rng) {
        const mesh = new THREE.Mesh(
            new THREE.DodecahedronGeometry(5 + rng() * 10, 0),
            new THREE.MeshStandardMaterial({ color: 0x8b4513, flatShading: true })
        );
        mesh.rotation.set(rng(), rng(), rng());
        mesh.scale.y *= 0.5;
        return mesh;
    }

    function createJunglePlant(rng) {
        const g = new THREE.Group();
        for(let i=0; i<5; i++) {
            const leaf = new THREE.Mesh(
                new THREE.BoxGeometry(2, 10, 0.5),
                new THREE.MeshStandardMaterial({ color: 0x006400 })
            );
            leaf.rotation.z = (rng() - 0.5) * 2;
            leaf.rotation.y = (i / 5) * Math.PI * 2;
            leaf.position.y = 5;
            g.add(leaf);
        }
        return g;
    }

   // Deterministischer Zufall für Chunks
    function mulberry32(a) {
        return function() {
            let t = a += 0x6D2B79F5;
            t = Math.imul(t ^ t >>> 15, t | 1);
            t ^= t + Math.imul(t ^ t >>> 7, t | 61);
            return ((t ^ t >>> 14) >>> 0) / 4294967296;
        }
    }

    const instanceCache = new Map(); // Cache für InstancedMesh-Vorlagen (Geometry/Material)

    async function getModelInstanceData(path) {
        if (instanceCache.has(path)) return instanceCache.get(path);
        
        const model = await loadModel(path);
        let mesh = null;
        model.traverse(obj => {
            if (obj.isMesh && !mesh) mesh = obj;
        });

        if (mesh) {
            const data = { geo: mesh.geometry, mat: mesh.material };
            instanceCache.set(path, data);
            return data;
        }
        return null;
    }

    // --- CLIPMAP DECORATIONS ---
    let decorationGroups = new Map(); // Speichert InstancedMeshes pro Zelle

    function updateClipmapDecorations(px, pz, scene) {
        if (!scene) return;
        
        const currentCellX = Math.floor(px / DECORATION_CELL_SIZE);
        const currentCellZ = Math.floor(pz / DECORATION_CELL_SIZE);
        
        // 1. Neue Zellen spawnen
        for (let x = currentCellX - DECORATION_RANGE; x <= currentCellX + DECORATION_RANGE; x++) {
            for (let z = currentCellZ - DECORATION_RANGE; z <= currentCellZ + DECORATION_RANGE; z++) {
                const key = `${x},${z}`;
                if (!decorationGroups.has(key)) {
                    const group = new THREE.Group();
                    scene.add(group);
                    decorationGroups.set(key, group);
                    spawnDecorationsInCell(x, z, group);
                }
            }
        }
        
        // 2. Weit entfernte Zellen aufräumen
        decorationGroups.forEach((group, key) => {
            const [x, z] = key.split(',').map(Number);
            const dx = Math.abs(x - currentCellX);
            const dz = Math.abs(z - currentCellZ);
            
            if (dx > DECORATION_RANGE + 1 || dz > DECORATION_RANGE + 1) {
                scene.remove(group);
                group.traverse(obj => {
                    if (obj.geometry) obj.geometry.dispose();
                    if (obj.material) {
                        if (Array.isArray(obj.material)) obj.material.forEach(m => m.dispose());
                        else obj.material.dispose();
                    }
                });
                decorationGroups.delete(key);
            }
        });
    }

    function createCactus(rng) {
        const group = new THREE.Group();
        const mat = new THREE.MeshStandardMaterial({ color: 0x2d5a27, flatShading: true });
        
        // Hauptstamm
        const body = new THREE.Mesh(new THREE.BoxGeometry(2, 8 + rng() * 6, 2), mat);
        body.position.y = 4;
        group.add(body);
        
        // Arme
        if (rng() > 0.3) {
            const arm1 = new THREE.Mesh(new THREE.BoxGeometry(1.5, 4, 1.5), mat);
            arm1.position.set(2, 6, 0);
            group.add(arm1);
            const elbow1 = new THREE.Mesh(new THREE.BoxGeometry(3, 1.5, 1.5), mat);
            elbow1.position.set(1, 4, 0);
            group.add(elbow1);
        }
        return group;
    }

    function createSnowMound(rng) {
        const geo = new THREE.IcosahedronGeometry(2 + rng() * 3, 1);
        const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, flatShading: false });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.scale.y = 0.5;
        mesh.rotation.y = rng() * Math.PI;
        return mesh;
    }

    function createDeadTree(rng) {
        const group = new THREE.Group();
        const mat = new THREE.MeshStandardMaterial({ color: 0x4a3728, flatShading: true });
        const trunk = new THREE.Mesh(new THREE.BoxGeometry(1.5, 15 + rng() * 10, 1.5), mat);
        trunk.position.y = 7;
        trunk.rotation.z = (rng() - 0.5) * 0.3;
        group.add(trunk);
        return group;
    }

    async function spawnDecorationsInCell(cx, cz, group) {
        const seed = (cx * 73856093) ^ (cz * 19349663);
        const rng = mulberry32(seed);
        
        const x0 = cx * DECORATION_CELL_SIZE;
        const z0 = cz * DECORATION_CELL_SIZE;

        // Biome für die Zelle bestimmen (Mitte der Zelle als Referenz)
        const biome = getBiomeData(x0 + DECORATION_CELL_SIZE / 2, z0 + DECORATION_CELL_SIZE / 2);
        
        // 1. Große Vegetation (Individuelle Meshes für Komplexität)
        let treeCount = 0;
        if (biome.name === 'jungle') treeCount = 8 + Math.floor(rng() * 8);
        else if (biome.name === 'plains') treeCount = 2 + Math.floor(rng() * 3);
        else if (biome.name === 'swamp') treeCount = 5 + Math.floor(rng() * 5);
        else if (biome.name === 'snow') treeCount = 1 + Math.floor(rng() * 2);
        else if (biome.name === 'desert') treeCount = 1 + Math.floor(rng() * 2);

        for (let i = 0; i < treeCount; i++) {
            const tx = x0 + rng() * DECORATION_CELL_SIZE;
            const tz = z0 + rng() * DECORATION_CELL_SIZE;
            const th = getTerrainHeight(tx, tz);
            
            if (th > 12) { 
                let plant;
                if (biome.name === 'jungle') {
                    plant = rng() > 0.4 ? createPalm(rng) : createDetailedTree(tx, tz, th, rng, 0x1a472a, 1.5);
                } else if (biome.name === 'desert') {
                    plant = rng() > 0.5 ? createCactus(rng) : createDesertRock(rng);
                } else if (biome.name === 'snow') {
                    plant = rng() > 0.3 ? createDetailedTree(tx, tz, th, rng, 0xffffff, 0.8) : createDeadTree(rng);
                } else if (biome.name === 'swamp') {
                    plant = rng() > 0.3 ? createDetailedTree(tx, tz, th, rng, 0x2f351e, 1.2) : createDeadTree(rng);
                } else {
                    plant = createDetailedTree(tx, tz, th, rng);
                }
                
                if (plant) {
                        plant.position.set(tx, th - 1.0, tz); // Leicht einsinken lassen gegen Schweben
                        plant.rotation.y = rng() * Math.PI * 2;
                        group.add(plant);
                    }
            }
        }

        // 2. Clutter (Instanced) - Biome-abhängig
        const clutterCount = 40 + Math.floor(rng() * 40);
        const stoneInstances = { positions: [], scales: [] };
        const plantInstances = { positions: [], scales: [] };
        
        for (let i = 0; i < clutterCount; i++) {
            const sx = x0 + rng() * DECORATION_CELL_SIZE;
            const sz = z0 + rng() * DECORATION_CELL_SIZE;
            const sh = getTerrainHeight(sx, sz);
            
            if (sh > 11) {
                if (rng() > 0.8) { // Steine seltener als Pflanzen
                    stoneInstances.positions.push(sx, sh, sz);
                    stoneInstances.scales.push(0.5 + rng() * 2.5);
                } else {
                    plantInstances.positions.push(sx, sh, sz);
                    plantInstances.scales.push(0.5 + rng() * 1.5);
                }
            }
        }

        // Steine rendern
        if (stoneInstances.positions.length > 0) {
            const stoneColor = biome.name === 'desert' ? 0xbc8f8f : 0x888888;
            const geo = new THREE.DodecahedronGeometry(1, 0);
            const mat = new THREE.MeshStandardMaterial({ color: stoneColor, flatShading: true });
            const imesh = new THREE.InstancedMesh(geo, mat, stoneInstances.positions.length / 3);
            const dummy = new THREE.Object3D();
            for (let i = 0; i < stoneInstances.positions.length / 3; i++) {
                dummy.position.set(stoneInstances.positions[i*3], stoneInstances.positions[i*3+1], stoneInstances.positions[i*3+2]);
                const s = stoneInstances.scales[i];
                dummy.scale.set(s, s, s);
                dummy.rotation.set(rng() * Math.PI, rng() * Math.PI, rng() * Math.PI);
                dummy.updateMatrix();
                imesh.setMatrixAt(i, dummy.matrix);
            }
            imesh.receiveShadow = true;
            imesh.castShadow = true;
            group.add(imesh);
        }

        // Kleine Pflanzen / Clutter rendern
        if (plantInstances.positions.length > 0) {
            let plantColor = 0x3a5a2a;
            let geo;
            
            if (biome.name === 'desert') {
                plantColor = 0x8b4513; // Vertrocknetes Gestrüpp
                geo = new THREE.IcosahedronGeometry(0.8, 0);
            } else if (biome.name === 'snow') {
                plantColor = 0xffffff; // Schneehaufen
                geo = new THREE.IcosahedronGeometry(1.2, 1);
            } else if (biome.name === 'jungle') {
                plantColor = 0x006400;
                geo = new THREE.CylinderGeometry(0.1, 1.5, 2, 4);
            } else if (biome.name === 'swamp') {
                plantColor = 0x1a2410;
                geo = new THREE.IcosahedronGeometry(1, 0);
            } else {
                geo = new THREE.IcosahedronGeometry(0.8, 0);
            }

            const mat = new THREE.MeshStandardMaterial({ 
                color: plantColor, 
                flatShading: biome.name !== 'snow' 
            });
            const imesh = new THREE.InstancedMesh(geo, mat, plantInstances.positions.length / 3);
            const dummy = new THREE.Object3D();
            for (let i = 0; i < plantInstances.positions.length / 3; i++) {
                dummy.position.set(plantInstances.positions[i*3], plantInstances.positions[i*3+1], plantInstances.positions[i*3+2]);
                const s = plantInstances.scales[i];
                dummy.scale.set(s, s, s);
                if (biome.name === 'snow') dummy.scale.y *= 0.3; // Flachere Schneehaufen
                dummy.rotation.y = rng() * Math.PI * 2;
                dummy.updateMatrix();
                imesh.setMatrixAt(i, dummy.matrix);
            }
            imesh.receiveShadow = true;
            group.add(imesh);
        }
    }


    async function initWorld(scene, env, enterHouseCallback, renderer) {
        console.log("[FPGraphics] Initialisiere Welt...");
        if (!env) {
            console.warn("[FPGraphics] Keine Umgebung (env) übergeben!");
            return;
        }

        // GPGPU Initialisierung
        if (renderer) {
            initGPGPU(renderer);
            initClipmap(scene);
            // Erste Berechnung erzwingen
            updateClipmap(0, 0, renderer);
        }

        console.log("[FPGraphics] Biome gefunden:", Object.keys(env.biomes));

        // Große Basis-Ebene für den Hintergrund (verhindert das "blaue Nichts")
        // const baseGeo = new THREE.PlaneGeometry(5000, 5000);
        // const baseMat = new THREE.MeshStandardMaterial({ 
        //     color: 0x3d4f35, // Dunkles Grün/Erde
        //     roughness: 1.0,
        //     metalness: 0.0
        // });
        // const basePlane = new THREE.Mesh(baseGeo, baseMat);
        // basePlane.rotation.x = -Math.PI / 2;
        // basePlane.position.y = -5; // Tief genug unter dem eigentlichen Terrain
        // scene.add(basePlane);

        // initMountains(scene); // Entfernt, da Berge jetzt Teil des Terrains sind
        // initRiver(scene);
        // await initVegetation(scene); // Jetzt in Chunks
        // initForestDetails(scene); // Jetzt in Chunks

        /*
        const biomeKeys = Object.keys(env.biomes);
        for (let index = 0; index < biomeKeys.length; index++) {
            const key = biomeKeys[index];
            const biome = env.biomes[key];
            if (key === 'CENTRAL') {
                await spawnVillage(scene, biome, 0, 0, enterHouseCallback);
                
                const fountainGeo = new THREE.CylinderGeometry(15, 18, 5, 16);
                const fountainMat = new THREE.MeshStandardMaterial({ color: 0x888888, flatShading: true });
                const fountain = new THREE.Mesh(fountainGeo, fountainMat);
                fountain.position.set(0, 2.5, 0);
                fountain.castShadow = true;
                fountain.receiveShadow = true;
                scene.add(fountain);
                
                const waterGeo = new THREE.CircleGeometry(12, 16);
                const waterMat = new THREE.MeshStandardMaterial({ 
                    color: 0x0044ff, 
                    transparent: true, 
                    opacity: 0.6,
                    roughness: 0.1,
                    metalness: 0.5
                });
                const water = new THREE.Mesh(waterGeo, waterMat);
                water.rotation.x = -Math.PI / 2;
                water.position.set(0, 5.1, 0);
                water.receiveShadow = true;
                scene.add(water);
            } else {
                const angle = (index / (biomeKeys.length - 1)) * Math.PI * 2;
                const dist = 1200;
                const vx = Math.cos(angle) * dist;
                const vz = Math.sin(angle) * dist;
                
                const bGeo = new THREE.CircleGeometry(400, 32);
                const bMat = new THREE.MeshLambertMaterial({ 
                    color: biome.color, 
                    transparent: true, 
                    opacity: 0.8 
                });
                const bFloor = new THREE.Mesh(bGeo, bMat);
                bFloor.rotation.x = -Math.PI / 2;
                bFloor.position.set(vx, 0.2, vz);
                scene.add(bFloor);

                await spawnVillage(scene, biome, vx, vz, enterHouseCallback);
            }
        }
        */
    }

    function initMountains(scene) {
        const mountCount = 15; 
        for (let i = 0; i < mountCount; i++) {
            const radius = 60 + Math.random() * 180;
            const height = 120 + Math.random() * 200;
            const geo = new THREE.DodecahedronGeometry(radius, 0);
            const mat = new THREE.MeshStandardMaterial({ 
                color: 0x666666, 
                flatShading: true,
                roughness: 0.9 
            });
            const mount = new THREE.Mesh(geo, mat);
            
            const angle = Math.random() * Math.PI * 2;
            const dist = 1100 + Math.random() * 900;
            mount.position.set(Math.cos(angle) * dist, height * 0.2, Math.sin(angle) * dist);
            mount.scale.y = 1.2 + Math.random() * 2;
            mount.rotation.set(Math.random(), Math.random(), Math.random());
            scene.add(mount);
        }
    }

    function initRiver(scene) {
        const riverGroup = new THREE.Group();
        const riverGeo = new THREE.PlaneGeometry(120, 4000, 10, 40);
        const riverMat = new THREE.MeshStandardMaterial({ 
            color: PALETTE.water, 
            flatShading: true,
            transparent: true, 
            opacity: 0.8,
            roughness: 0.1,
            metalness: 0.3
        });
        
        const mainRiver = new THREE.Mesh(riverGeo, riverMat);
        mainRiver.rotation.x = -Math.PI / 2;
        mainRiver.position.y = 0.5;
        riverGroup.add(mainRiver);
        riverPlanes.push(mainRiver);

        [[-800], [0], [800]].forEach(z => {
            const bridge = createWoodenBridge(0, z);
            riverGroup.add(bridge);
        });

        riverGroup.position.set(450, 0, 0); 
        scene.add(riverGroup);
    }

    function createWoodenBridge(x, z) {
        const group = new THREE.Group();
        group.position.set(x, 0, z);
        const woodMat = new THREE.MeshStandardMaterial({ color: PALETTE.wood, flatShading: true });
        
        const beamGeo = new THREE.BoxGeometry(140, 4, 4);
        [[-22], [22]].forEach(bz => {
            const beam = new THREE.Mesh(beamGeo, woodMat);
            beam.position.y = 4;
            beam.position.z = bz + (Math.random() - 0.5) * 2;
            beam.rotation.y = (Math.random() - 0.5) * 0.05;
            beam.castShadow = true;
            beam.receiveShadow = true;
            group.add(beam);
        });
        
        const postGeo = new THREE.CylinderGeometry(2, 2.5, 40, 6);
        [[-60, -22], [60, -22], [-60, 22], [60, 22], [0, -22], [0, 22]].forEach(p => {
            const postGroup = new THREE.Group();
            postGroup.position.set(p[0], -15, p[1]);
            
            const post = new THREE.Mesh(postGeo, woodMat);
            post.rotation.z = (Math.random() - 0.5) * 0.15;
            post.rotation.x = (Math.random() - 0.5) * 0.15;
            post.castShadow = true;
            post.receiveShadow = true;
            postGroup.add(post);

            if (Math.random() > 0.3) {
                const strut = new THREE.Mesh(new THREE.BoxGeometry(20, 1.5, 1.5), woodMat);
                strut.position.y = 10;
                strut.rotation.z = Math.PI / 4 * (Math.random() > 0.5 ? 1 : -1);
                postGroup.add(strut);
            }
            
            group.add(postGroup);
        });

        let currentX = -65;
        while (currentX <= 65) {
            const pWidth = 5 + Math.random() * 6;
            const pLen = 50 + Math.random() * 15;
            const plankGeo = new THREE.BoxGeometry(pWidth, 2, pLen);
            const plank = new THREE.Mesh(plankGeo, woodMat);
            
            const offsetX = (Math.random() - 0.5) * 1.5;
            const offsetZ = (Math.random() - 0.5) * 5;
            const offsetY = 6 + (Math.random() - 0.5) * 0.5;
            
            plank.position.set(currentX + offsetX, offsetY, offsetZ);
            plank.rotation.y = (Math.random() - 0.5) * 0.2;
            plank.rotation.z = (Math.random() - 0.5) * 0.1;
            plank.castShadow = true;
            plank.receiveShadow = true;
            group.add(plank);
            
            currentX += pWidth + 0.5 + Math.random() * 2;
        }
        
        [[-26], [26]].forEach(gz => {
            const rail = new THREE.Mesh(new THREE.BoxGeometry(130, 1.5, 2.5), woodMat);
            rail.position.set(0, 15, gz);
            rail.castShadow = true;
            group.add(rail);
            
            for (let rx = -60; rx <= 60; rx += 30) {
                const rPost = new THREE.Mesh(new THREE.BoxGeometry(2, 10, 2), woodMat);
                rPost.position.set(rx, 10, gz);
                rPost.rotation.z = (Math.random() - 0.5) * 0.1;
                rPost.castShadow = true;
                group.add(rPost);
            }
        });
        
        return group;
    }

    function updateRiver() {
        riverPlanes.forEach(wave => {
            wave.position.z += 2; 
            if (wave.position.z > 2000) wave.position.z = -2000;
        });
    }

    function updateFire(delta, now) {
        if (!isInterior) return;
        fireParticles.forEach(p => {
            p.position.y += p.userData.speed * delta;
            p.position.x += Math.sin(now * 0.005 + p.userData.phase) * 0.05 * delta;
            if (p.position.y > 15) {
                p.position.y = 2;
                p.position.x = -20 + (Math.random() - 0.5) * 5;
                p.position.z = -20 + (Math.random() - 0.5) * 5;
            }
        });
    }

    function createPalisade(scene, centerX, centerZ, radius) {
        const count = 60;
        const woodMat = new THREE.MeshStandardMaterial({ color: PALETTE.wood, flatShading: true });
        const postGeo = new THREE.CylinderGeometry(2, 2, 25, 5);
        
        for (let i = 0; i < count; i++) {
            const angle = (i / count) * Math.PI * 2;
            if (angle > 1.4 && angle < 1.7) continue;

            const x = centerX + Math.cos(angle) * radius;
            const z = centerZ + Math.sin(angle) * radius;
            
            const post = new THREE.Mesh(postGeo, woodMat);
            post.position.set(x, 10, z);
            post.rotation.y = Math.random();
            const tipGeo = new THREE.ConeGeometry(2, 5, 5);
            const tip = new THREE.Mesh(tipGeo, woodMat);
            tip.position.y = 12.5 + 2.5;
            post.add(tip);
            
            scene.add(post);
        }
    }

    function createWatchtower(scene, x, z) {
        const group = new THREE.Group();
        group.position.set(x, 0, z);
        const woodMat = new THREE.MeshStandardMaterial({ color: PALETTE.wood, flatShading: true });
        
        [[-6, -6], [6, -6], [-6, 6], [6, 6]].forEach(p => {
            const postGeo = new THREE.BoxGeometry(2, 45, 2);
            const post = new THREE.Mesh(postGeo, woodMat);
            post.position.set(p[0], 22.5, p[1]);
            group.add(post);
        });
        
        const platGeo = new THREE.BoxGeometry(16, 2, 16);
        const plat = new THREE.Mesh(platGeo, woodMat);
        plat.position.y = 35;
        group.add(plat);
        
        const roofGeo = new THREE.ConeGeometry(12, 10, 4);
        const roofMat = new THREE.MeshStandardMaterial({ color: PALETTE.roof, flatShading: true });
        const roof = new THREE.Mesh(roofGeo, roofMat);
        roof.position.y = 45 + 5;
        roof.rotation.y = Math.PI / 4;
        group.add(roof);
        
        scene.add(group);
    }

    function createStreetLamp(x, z, h = 0) {
        const group = new THREE.Group();
        group.position.set(x, h, z);
        const woodMat = new THREE.MeshStandardMaterial({ color: PALETTE.wood, flatShading: true });
        
        const postGeo = new THREE.BoxGeometry(2, 25, 2);
        const post = new THREE.Mesh(postGeo, woodMat);
        post.position.y = 12.5;
        post.castShadow = true;
        group.add(post);
        
        const armGeo = new THREE.BoxGeometry(6, 1.5, 1.5);
        const arm = new THREE.Mesh(armGeo, woodMat);
        arm.position.set(2, 23, 0);
        arm.castShadow = true;
        group.add(arm);
        
        const lampGeo = new THREE.BoxGeometry(3, 4, 3);
        const lampMat = new THREE.MeshStandardMaterial({ 
            color: 0xffffaa, 
            emissive: 0xffffaa,
            emissiveIntensity: 1,
            flatShading: true 
        });
        const lamp = new THREE.Mesh(lampGeo, lampMat);
        lamp.position.set(4, 21, 0);
        lamp.castShadow = true;
        group.add(lamp);
        
        const light = new THREE.PointLight(0xffffaa, 1, 50);
        light.position.set(4, 21, 0);
        light.castShadow = true;
        group.add(light);
        
        return group;
    }

    function createBench(x, z, rotY, h = 0) {
        const group = new THREE.Group();
        group.position.set(x, h, z);
        group.rotation.y = rotY;
        const woodMat = new THREE.MeshStandardMaterial({ color: PALETTE.wood, flatShading: true });
        
        const seatGeo = new THREE.BoxGeometry(12, 1, 4);
        const seat = new THREE.Mesh(seatGeo, woodMat);
        seat.position.y = 4;
        seat.castShadow = true;
        group.add(seat);
        
        const legGeo = new THREE.BoxGeometry(1, 4, 1);
        [[-5, -1.5], [5, -1.5], [-5, 1.5], [5, 1.5]].forEach(p => {
            const leg = new THREE.Mesh(legGeo, woodMat);
            leg.position.set(p[0], 2, p[1]);
            leg.castShadow = true;
            group.add(leg);
        });
        
        return group;
    }

    function spawnRoadStones(scene, centerX, centerZ) {
        const stoneMat = new THREE.MeshStandardMaterial({ 
            color: 0x888888, 
            roughness: 0.8,
            flatShading: true 
        });

        const directions = [
            { x: 1, z: 0 }, { x: -1, z: 0 }, { x: 0, z: 1 }, { x: 0, z: -1 },
            { x: 0.7, z: 0.7 }, { x: -0.7, z: 0.7 }, { x: 0.7, z: -0.7 }, { x: -0.7, z: -0.7 }
        ];

        directions.forEach(dir => {
            for (let d = 30; d < 200; d += 15 + Math.random() * 20) {
                const rx = centerX + dir.x * d + (Math.random() - 0.5) * 15;
                const rz = centerZ + dir.z * d + (Math.random() - 0.5) * 15;
                
                const dist = Math.hypot(rx - centerX, rz - centerZ);
                if (dist > 250) continue;

                const h = getTerrainHeight(rx, rz);

                const size = 1 + Math.random() * 3;
                const stoneGeo = new THREE.IcosahedronGeometry(size, 0);
                const stone = new THREE.Mesh(stoneGeo, stoneMat);
                
                stone.position.set(rx, h + size * 0.5, rz);
                stone.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
                stone.scale.set(1, 0.5 + Math.random() * 0.5, 1);
                stone.castShadow = true;
                stone.receiveShadow = true;
                
                scene.add(stone);
            }
        });
    }

    async function spawnVillage(scene, biome, x, z, enterHouseCallback) {
        const centerGeo = new THREE.CylinderGeometry(5, 5, 0.5, 16);
        const centerMat = new THREE.MeshStandardMaterial({ color: 0x555555, flatShading: true });
        const center = new THREE.Mesh(centerGeo, centerMat);
        center.position.set(x, 0.1, z);
        center.receiveShadow = true;
        scene.add(center);

        if (biome.name === "Hauptdorf") {
            spawnRoadStones(scene, x, z);
            createPalisade(scene, x, z, 250);
            createWatchtower(scene, x + 180, z + 180);
            createWatchtower(scene, x - 180, z + 180);
            createWatchtower(scene, x + 180, z - 180);
            createWatchtower(scene, x - 180, z - 180);

            scene.add(createStreetLamp(x + 30, z + 30, getTerrainHeight(x + 30, z + 30)));
            scene.add(createStreetLamp(x - 30, z - 30, getTerrainHeight(x - 30, z - 30)));
            scene.add(createBench(x + 20, z - 30, 0, getTerrainHeight(x + 20, z - 30)));
            scene.add(createBench(x - 20, z + 30, Math.PI, getTerrainHeight(x - 20, z + 30)));

            scene.add(createStreetLamp(x - 55, z + 35, getTerrainHeight(x - 55, z + 35)));
            scene.add(createStreetLamp(x + 65, z - 20, getTerrainHeight(x + 65, z - 20)));
            scene.add(createStreetLamp(x - 30, z - 45, getTerrainHeight(x - 30, z - 45)));
            scene.add(createStreetLamp(x + 45, z + 55, getTerrainHeight(x + 45, z + 55)));
            
            scene.add(createBench(x - 80, z + 50, Math.PI / 4, getTerrainHeight(x - 80, z + 50)));
            scene.add(createBench(x + 100, z - 20, -Math.PI / 4, getTerrainHeight(x + 100, z - 20)));
            scene.add(createBench(x - 40, z - 70, Math.PI / 6, getTerrainHeight(x - 40, z - 70)));

            const buildings = [
                { name: "Marktplatz", x: 130, z: -40, color: 0x8b4513, icon: "🏪" },
                { name: "Wohnhaus 1", x: -140, z: -30, color: 0x8b4513, icon: "🏠" },
                { name: "Schmiede", x: -110, z: 70, color: 0x555555, icon: "⚔️" },
                { name: "Steinbruch", x: -160, z: 20, color: 0x888888, icon: "⛏️" },
                { name: "Arena", x: 0, z: 180, color: 0xaa2222, icon: "🏟️" },
                { name: "Wirtshaus", x: -60, z: -90, color: 0x8b4513, icon: "🍺" },
                { name: "Gilde", x: 90, z: 110, color: 0x4444aa, icon: "🏛️" },
                { name: "Wohnhaus 2", x: 160, z: 60, color: 0x8b4513, icon: "🏠" }
            ];

            for (const b of buildings) {
                const h = getTerrainHeight(x + b.x, z + b.z);
                const bObj = await createBuilding(b.name, x + b.x, z + b.z, b.color, b.icon, () => {
                    if (enterHouseCallback) enterHouseCallback(b.name);
                }, scene);
                bObj.position.y = h;

                if (b.name === "Marktplatz") {
                    addMarketNPC(scene, x + b.x + 15, z + b.z + 10, h);
                }
            }
        } else {
            const houseCount = 3;
            const icons = ["🏠", "🏪", "⚔️", "🧪", "🛡️"];
            for (let i = 0; i < houseCount; i++) {
                const angle = (i / houseCount) * Math.PI * 2;
                const dist = 60;
                const bx = x + Math.cos(angle) * dist;
                const bz = z + Math.sin(angle) * dist;
                const h = getTerrainHeight(bx, bz);
                
                let icon = icons[i % icons.length];
                if (i === 0) icon = "🏛️";
                if (i === 1) icon = "✨";
                if (i === 2) icon = "💀";

                const bName = `${biome.name} Haus ${i}`;
                const bObj = await createBuilding(bName, bx, bz, biome.color || 0x8b4513, icon, () => {
                    if (enterHouseCallback) enterHouseCallback(biome, i);
                }, scene);
                bObj.position.y = h;
            }
        }

        // Biome-spezifische Deko & Architektur
        if (biome.terrain === "high_trees") {
            for (let j = 0; j < 5; j++) {
                const tx = x + (Math.random()-0.5) * 120;
                const tz = z + (Math.random()-0.5) * 120;
                const trunkGeo = new THREE.CylinderGeometry(4, 5, 60, 8);
                const trunkMat = new THREE.MeshLambertMaterial({ color: 0x3d2a1a });
                const trunk = new THREE.Mesh(trunkGeo, trunkMat);
                trunk.position.set(tx, 30, tz);
                scene.add(trunk);
                if (j === 1) {
                    const houseGeo = new THREE.BoxGeometry(15, 10, 15);
                    const houseMat = new THREE.MeshLambertMaterial({ color: 0x8b4513 });
                    const house = new THREE.Mesh(houseGeo, houseMat);
                    house.position.set(tx, 50, tz);
                    scene.add(house);
                }
            }
        } else if (biome.terrain === "swamp") {
            for (let j = 0; j < 8; j++) {
                const px = x + (Math.random()-0.5) * 150;
                const pz = z + (Math.random()-0.5) * 150;
                const stemGeo = new THREE.CylinderGeometry(1, 1.5, 5, 8);
                const stemMat = new THREE.MeshLambertMaterial({ color: 0xddddcc });
                const stem = new THREE.Mesh(stemGeo, stemMat);
                stem.position.set(px, 2.5, pz);
                scene.add(stem);
                const capGeo = new THREE.SphereGeometry(4, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2);
                const capMat = new THREE.MeshLambertMaterial({ color: Math.random() > 0.5 ? 0xaa2222 : 0x442266 });
                const cap = new THREE.Mesh(capGeo, capMat);
                cap.position.set(px, 5, pz);
                scene.add(cap);
                const light = new THREE.PointLight(0x00ff88, 1, 30);
                light.position.set(px, 6, pz);
                scene.add(light);
            }
        } else if (biome.terrain === "mountains") {
            const rockGeo = new THREE.DodecahedronGeometry(12);
            const rockMat = new THREE.MeshLambertMaterial({ color: 0x555555 });
            for (let j = 0; j < 10; j++) {
                const rx = x + Math.cos(j) * 90;
                const rz = z + Math.sin(j) * 90;
                const rock = new THREE.Mesh(rockGeo, rockMat);
                rock.position.set(rx, 6, rz);
                rock.scale.set(1 + Math.random()*3, 1 + Math.random()*5, 1 + Math.random()*3);
                scene.add(rock);
            }
        } else if (biome.terrain === "grove") {
            for (let j = 0; j < 6; j++) {
                const px = x + (Math.random()-0.5) * 100;
                const pz = z + (Math.random()-0.5) * 100;
                const postGeo = new THREE.CylinderGeometry(1, 1, 15, 8);
                const postMat = new THREE.MeshLambertMaterial({ color: 0x8b4513 });
                const post = new THREE.Mesh(postGeo, postMat);
                post.position.set(px, 7.5, pz);
                scene.add(post);
            }
        } else if (biome.terrain === "underground_city") {
            for (let j = 0; j < 8; j++) {
                const px = x + (Math.random()-0.5) * 140;
                const pz = z + (Math.random()-0.5) * 140;
                const cryGeo = new THREE.OctahedronGeometry(5);
                const cryMat = new THREE.MeshPhongMaterial({ color: 0x4444ff, emissive: 0x2222aa, transparent: true, opacity: 0.8 });
                const crystal = new THREE.Mesh(cryGeo, cryMat);
                crystal.position.set(px, 5, pz);
                crystal.rotation.set(Math.random(), Math.random(), Math.random());
                scene.add(crystal);
                const light = new THREE.PointLight(0x4444ff, 1, 40);
                light.position.set(px, 6, pz);
                scene.add(light);
            }
        } else if (biome.terrain === "void_waste") {
            for (let j = 0; j < 4; j++) {
                const px = x + Math.cos(j) * 80;
                const pz = z + Math.sin(j) * 80;
                const obeGeo = new THREE.ConeGeometry(5, 20, 4);
                const obeMat = new THREE.MeshLambertMaterial({ color: 0x1a0a2a });
                const obelisk = new THREE.Mesh(obeGeo, obeMat);
                obelisk.position.set(px, 20 + Math.sin(j)*10, pz);
                scene.add(obelisk);
            }
        } else if (biome.terrain === "highlands") {
            for (let j = 0; j < 6; j++) {
                const angle = (j / 6) * Math.PI * 2;
                const px = x + Math.cos(angle) * 70;
                const pz = z + Math.sin(angle) * 70;
                const colGeo = new THREE.CylinderGeometry(3, 3, 40, 12);
                const colMat = new THREE.MeshLambertMaterial({ color: 0xddccaa });
                const column = new THREE.Mesh(colGeo, colMat);
                column.position.set(px, 20, pz);
                scene.add(column);
            }
        }
    }

    function addMarketNPC(scene, x, z, h = 0) {
        const tex = new THREE.TextureLoader().load('Ei.png');
        tex.magFilter = THREE.NearestFilter;
        tex.minFilter = THREE.NearestFilter;
        const sm = new THREE.SpriteMaterial({ map: tex });
        const sprite = new THREE.Sprite(sm);
        sprite.position.set(x, h + 5, z);
        sprite.scale.set(6, 6, 1);
        scene.add(sprite);

        const tag = createNameTag("Händler");
        tag.position.set(x, h + 10, z);
        scene.add(tag);
    }

    function createNameTag(name) {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        canvas.width = 256;
        canvas.height = 64;
        ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
        
        const roundRect = (ctx, x, y, w, h, r) => {
            if (w < 2 * r) r = w / 2;
            if (h < 2 * r) r = h / 2;
            ctx.beginPath();
            ctx.moveTo(x + r, y);
            ctx.arcTo(x + w, y, x + w, y + h, r);
            ctx.arcTo(x + w, y + h, x, y + h, r);
            ctx.arcTo(x, y + h, x, y, r);
            ctx.arcTo(x, y, x + w, y, r);
            ctx.closePath();
            return ctx;
        };
        roundRect(ctx, 10, 10, 236, 44, 15).fill();

        ctx.font = 'bold 28px Arial';
        ctx.fillStyle = 'white';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.strokeStyle = 'black';
        ctx.lineWidth = 4;
        ctx.strokeText(name, 128, 32);
        ctx.fillText(name, 128, 32);
        
        const tex = new THREE.CanvasTexture(canvas);
        const sm = new THREE.SpriteMaterial({ map: tex });
        const sprite = new THREE.Sprite(sm);
        sprite.scale.set(16, 4, 1);
        return sprite;
    }

    function initInteriors(scene) {
        if (!window.THREE) return;
        if (!lastExteriorPos) lastExteriorPos = new THREE.Vector3();

        const createDoor = (group, zPos) => {
            const doorGeo = new THREE.PlaneGeometry(15, 25);
            const doorMat = new THREE.MeshBasicMaterial({ 
                color: 0xffd700, 
                transparent: true, 
                opacity: 0.3, 
                side: THREE.DoubleSide 
            });
            const door = new THREE.Mesh(doorGeo, doorMat);
            door.position.set(0, 12.5, zPos);
            group.add(door);
            const frame = new THREE.LineSegments(new THREE.EdgesGeometry(doorGeo), new THREE.LineBasicMaterial({ color: 0xffd700 }));
            frame.position.copy(door.position);
            group.add(frame);
            
            const tag = createNameTag("AUSGANG");
            tag.position.set(0, 30, zPos);
            group.add(tag);
        };

        const smithyGroup = new THREE.Group();
        smithyGroup.position.set(INTERIOR_POS_SMITHY.x, INTERIOR_POS_SMITHY.y, INTERIOR_POS_SMITHY.z);
        createDoor(smithyGroup, 49.5);
        const smithyRoom = new THREE.Mesh(new THREE.BoxGeometry(100, 80, 100), new THREE.MeshStandardMaterial({ color: 0x3d2a1a, side: THREE.BackSide, flatShading: true, roughness: 0.9 }));
        smithyRoom.position.y = 40;
        smithyGroup.add(smithyRoom);
        const smithyFloor = new THREE.Mesh(new THREE.PlaneGeometry(100, 100), new THREE.MeshStandardMaterial({ color: 0x2a1a0a, flatShading: true, roughness: 0.8 }));
        smithyFloor.rotation.x = -Math.PI / 2;
        smithyGroup.add(smithyFloor);
        const texEi = new THREE.TextureLoader().load('Ei.png');
        texEi.magFilter = THREE.NearestFilter;
        blacksmithNPC = new THREE.Sprite(new THREE.SpriteMaterial({ map: texEi }));
        blacksmithNPC.position.set(20, 5, 20);
        blacksmithNPC.scale.set(10, 10, 1);
        smithyGroup.add(blacksmithNPC);
        scene.add(smithyGroup);

        const innGroup = new THREE.Group();
        innGroup.position.set(INTERIOR_POS_INN.x, INTERIOR_POS_INN.y, INTERIOR_POS_INN.z);
        createDoor(innGroup, 49.5);
        const innRoom = new THREE.Mesh(new THREE.BoxGeometry(100, 60, 100), new THREE.MeshStandardMaterial({ color: 0x4a3728, side: THREE.BackSide, flatShading: true, roughness: 0.9 }));
        innRoom.position.y = 30;
        innGroup.add(innRoom);
        const innFloor = new THREE.Mesh(new THREE.PlaneGeometry(100, 100), new THREE.MeshStandardMaterial({ color: 0x3d2b1f, flatShading: true, roughness: 0.8 }));
        innFloor.rotation.x = -Math.PI / 2;
        innGroup.add(innFloor);
        innkeeperNPC = new THREE.Sprite(new THREE.SpriteMaterial({ map: texEi }));
        innkeeperNPC.position.set(0, 5, -30);
        innkeeperNPC.scale.set(10, 10, 1);
        innGroup.add(innkeeperNPC);
        scene.add(innGroup);

        const marketGroup = new THREE.Group();
        marketGroup.position.set(INTERIOR_POS_MARKET.x, INTERIOR_POS_MARKET.y, INTERIOR_POS_MARKET.z);
        createDoor(marketGroup, 59.5);
        const marketRoom = new THREE.Mesh(new THREE.BoxGeometry(120, 60, 120), new THREE.MeshStandardMaterial({ color: 0x5a4a3a, side: THREE.BackSide, flatShading: true, roughness: 0.9 }));
        marketRoom.position.y = 30;
        marketGroup.add(marketRoom);
        const marketFloor = new THREE.Mesh(new THREE.PlaneGeometry(120, 120), new THREE.MeshStandardMaterial({ color: 0x4a3a2a, flatShading: true, roughness: 0.8 }));
        marketFloor.rotation.x = -Math.PI / 2;
        marketGroup.add(marketFloor);
        marketNPC = new THREE.Sprite(new THREE.SpriteMaterial({ map: texEi }));
        marketNPC.position.set(0, 5, -40);
        marketNPC.scale.set(10, 10, 1);
        marketGroup.add(marketNPC);
        scene.add(marketGroup);
    }

    function enterHouse(target = 'smithy', avatar, targetPos, currentPos, avatarNameTag) {
        if (!avatar) return;
        if (isInterior) {
            isInterior = false;
            currentInterior = null;
            avatar.position.copy(lastExteriorPos);
            targetPos.x = lastExteriorPos.x;
            targetPos.z = lastExteriorPos.z;
            currentPos.x = lastExteriorPos.x;
            currentPos.z = lastExteriorPos.z;
            if (avatarNameTag) avatarNameTag.position.set(avatar.position.x, avatar.position.y + 12, avatar.position.z);
            const conts = ['craftingContainer', 'marketContainer', 'houseOverlay', 'fpMarketOverlay'];
            conts.forEach(id => { const el = document.getElementById(id); if(el) el.style.display = 'none'; });
            return;
        }
        if (!lastExteriorPos) lastExteriorPos = new THREE.Vector3();
        lastExteriorPos.copy(avatar.position);
        let pos = INTERIOR_POS_SMITHY;
        if (target === 'inn') pos = INTERIOR_POS_INN;
        if (target === 'market') pos = INTERIOR_POS_MARKET;
        avatar.position.set(pos.x, pos.y + 4, pos.z);
        targetPos.x = pos.x;
        targetPos.z = pos.z;
        currentPos.x = pos.x;
        currentPos.z = pos.z;
        if (avatarNameTag) avatarNameTag.position.set(pos.x, pos.y + 12, pos.z);
        isInterior = true;
        currentInterior = target;
    }

    async function createBuilding(name, x, z, color, icon, callback, scene) {
        const group = new THREE.Group();
        group.position.set(x, 0, z);

        // Debug-Log für Dorf-Erstellung
        console.log(`[Dorf] Erstelle Gebäude: ${name} an (${x}, ${z})`);

        // Versuche modulares Haus zu laden
        try {
            let modularHouse;
            if (name === "Schmiede") {
                modularHouse = await createModularHouse('calibration', x, z);
            } else {
                // Alle Häuser nutzen jetzt standardmäßig das neue House_1.glb
                modularHouse = await createModularHouse('house1', x, z);
            }
            modularHouse.isBuildingGroup = true; // Markierung für Kalibrierung
            modularHouse.userData.name = name;
            group.add(modularHouse);
            console.log(`[Dorf] GLTF-Haus für ${name} erfolgreich geladen.`);
        } catch (e) {
            console.warn(`[Dorf] GLTF-Haus für ${name} fehlgeschlagen, nutze Fallback:`, e);
            const bodyGeo = new THREE.BoxGeometry(25, 22, 25);
            const bodyMat = new THREE.MeshStandardMaterial({ color: PALETTE.walls, flatShading: true, roughness: 0.8 });
            const body = new THREE.Mesh(bodyGeo, bodyMat);
            body.position.y = 11;
            body.castShadow = true;
            body.receiveShadow = true;
            group.add(body);
        }

        const canvas = document.createElement('canvas');
        canvas.width = 128; canvas.height = 128;
        const ctx = canvas.getContext('2d');
        ctx.font = '80px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(icon, 64, 64);
        const tex = new THREE.CanvasTexture(canvas);
        const sm = new THREE.SpriteMaterial({ map: tex });
        const sprite = new THREE.Sprite(sm);
        sprite.position.y = 55;
        sprite.scale.set(20, 20, 1);
        group.add(sprite);
        group.userData = { name, callback };
        scene.add(group);
        villageBuildings.push(group);
        return group;
    }

    function createClouds(scene) {
        const count = 20;
        const group = new THREE.Group();
        for (let i = 0; i < count; i++) {
            const canvas = document.createElement('canvas');
            canvas.width = 128; canvas.height = 64;
            const ctx = canvas.getContext('2d');
            ctx.fillStyle = 'white';
            ctx.beginPath();
            ctx.arc(32, 32, 20, 0, Math.PI * 2);
            ctx.arc(64, 32, 25, 0, Math.PI * 2);
            ctx.arc(96, 32, 20, 0, Math.PI * 2);
            ctx.fill();
            const tex = new THREE.CanvasTexture(canvas);
            const sm = new THREE.SpriteMaterial({ map: tex, transparent: true, opacity: 0.6 });
            const sprite = new THREE.Sprite(sm);
            sprite.position.set((Math.random()-0.5)*1500, 150+Math.random()*100, (Math.random()-0.5)*1500);
            sprite.scale.set(100, 50, 1);
            group.add(sprite);
        }
        scene.add(group);
    }

    function initRain(scene) {
        if (rainParticles) scene.remove(rainParticles);
        const count = 5000;
        const geo = new THREE.BufferGeometry();
        const pos = new Float32Array(count * 3);
        const vel = new Float32Array(count);
        for (let i = 0; i < count; i++) {
            pos[i * 3] = (Math.random() - 0.5) * 1000;
            pos[i * 3 + 1] = Math.random() * 500;
            pos[i * 3 + 2] = (Math.random() - 0.5) * 1000;
            vel[i] = 2 + Math.random() * 3;
        }
        geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
        const mat = new THREE.PointsMaterial({ color: 0xaaaaaa, size: 0.5, transparent: true, opacity: 0.6 });
        rainParticles = new THREE.Points(geo, mat);
        rainParticles.userData = { velocities: vel };
        rainParticles.visible = false;
        scene.add(rainParticles);
    }

    function updateRain(avatar) {
        if (!rainParticles || !avatar) return;
        const env = window.EnvironmentManager;
        if (!env || (env.weather.type !== 'rainy' && env.weather.type !== 'stormy')) {
            rainParticles.visible = false;
            return;
        }
        rainParticles.visible = true;
        rainParticles.material.opacity = env.weather.intensity * 0.6;
        const pos = rainParticles.geometry.attributes.position.array;
        const vels = rainParticles.userData.velocities;
        const px = avatar.position.x;
        const pz = avatar.position.z;
        for (let i = 0; i < vels.length; i++) {
            pos[i * 3 + 1] -= vels[i];
            if (pos[i * 3 + 1] < 0) {
                pos[i * 3 + 1] = 400 + Math.random() * 100;
                pos[i * 3] = px + (Math.random() - 0.5) * 1000;
                pos[i * 3 + 2] = pz + (Math.random() - 0.5) * 1000;
            }
        }
        rainParticles.geometry.attributes.position.needsUpdate = true;
    }

    function addOverlayCloseButton(overlay) {
        const closeBtn = document.createElement('div');
        closeBtn.innerHTML = '×';
        closeBtn.style.cssText = `
            position: absolute;
            top: 15px;
            right: 15px;
            font-size: 32px;
            color: gold;
            cursor: pointer;
            z-index: 10001;
            width: 40px;
            height: 40px;
            display: flex;
            align-items: center;
            justify-content: center;
            background: rgba(0,0,0,0.7);
            border-radius: 50%;
            border: 2px solid gold;
            font-family: Arial, sans-serif;
            line-height: 1;
        `;
        closeBtn.onclick = (e) => {
            e.stopPropagation();
            overlay.style.display = 'none';
        };
        overlay.appendChild(closeBtn);
    }

    function cleanup(scene) {
        if (clipmapGroup) {
            scene.remove(clipmapGroup);
            clipmapGroup.traverse(obj => {
                if (obj.geometry) obj.geometry.dispose();
                if (obj.material) {
                    if (Array.isArray(obj.material)) obj.material.forEach(m => m.dispose());
                    else obj.material.dispose();
                }
            });
            clipmapGroup = null;
        }

        // Dekorationen aufräumen
        decorationGroups.forEach(group => {
            scene.remove(group);
            group.traverse(obj => {
                if (obj.geometry) obj.geometry.dispose();
                if (obj.material) {
                    if (Array.isArray(obj.material)) obj.material.forEach(m => m.dispose());
                    else obj.material.dispose();
                }
            });
        });
        decorationGroups.clear();
        
        chunks.clear();
        villageBuildings = [];
        if (rainParticles) {
            scene.remove(rainParticles);
            rainParticles.geometry.dispose();
            rainParticles.material.dispose();
            rainParticles = null;
        }
    }

    window.FPGraphics = {
        get CLIPMAP_RADIUS() { return CLIPMAP_RADIUS; },
        get chunks() { return chunks; },
        get isInterior() { return isInterior; },
        get currentInterior() { return currentInterior; },
        get villageBuildings() { return villageBuildings; },
        get clipmapMesh() { return clipmapMesh; },
        initWorld,
        initMountains,
        initRiver,
        createPalisade,
        createWatchtower,
        createStreetLamp,
        createBench,
        spawnRoadStones,
        spawnVillage,
        addMarketNPC,
        createDetailedTree,
        spawnClutter,
        createDesertRuin,
        createDesertRock,
        createJunglePlant,
        simpleNoise,
        getTerrainHeight,
        getBiomeData,
        updateGPGPU,
        getGPUHeight,
        updateClipmap,
        initClipmap,
        initInteriors,
        enterHouse,
        createBuilding,
        createNameTag,
        createClouds,
        initRain,
        updateRain,
        updateRiver,
        updateFire,
        addOverlayCloseButton,
        createModularHouse,
        createMonsterModel,
        selectNearestHouse,
        updateCalibration,
        cleanup,
        PALETTE
    };
})();
