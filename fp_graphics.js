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

    const CLIPMAP_RADIUS = 2000; // Größere Sichtweite für 8000x8000 Map
    const AOI_RADIUS = 10;      // Aktiver Simulationsradius (Bubble)
    const DORMANT_RADIUS = 15;  // Radius, ab dem Assets komplett einfrieren
    const GRASS_LOD_DIST = 15;  // Grenze zwischen 3D und 2D Gras
    const GRASS_MAX_DIST = 1500; // Maximale Sichtweite für 2D Gras
    const GRASS_PNG_PATH = 'https://raw.githubusercontent.com/noverato/System/main/animation/baeume/Grass_large.png';
    const CLIPMAP_SEGMENTS = 128; // Reduziert für Stabilität
    
    const DECORATION_CELL_SIZE = 256; 
    const DECORATION_RANGE = 4; 
    const GRASS_CELL_SIZE = 64;   // Kleinere Zellen für Gras-Chunks (feineres Culling)
    const GRASS_RANGE = 6;        // Radius der geladenen Gras-Zellen

    // Globale Uniforms für das Culling-System (Bubble-Prinzip / Glocke)
    const worldCullingUniforms = {
        playerPos: { value: new THREE.Vector2(0, 0) },
        clipRadius: { value: CLIPMAP_RADIUS },
        time: { value: 0 }
    };

    /**
     * Wendet das radiale Culling (Glocken-Prinzip) auf ein Material an.
     * Dies stellt sicher, dass alle Objekte (auch InstancedMeshes) am Horizont verschwinden.
     */
    function applyWorldCulling(material, isTerrain = false) {
        if (!material || isTerrain) return; // Terrain Assets sind ausgenommen von AOI/Culling per TRAE Rules
        const mats = Array.isArray(material) ? material : [material];
        
        mats.forEach(mat => {
            mat.onBeforeCompile = (shader) => {
                shader.uniforms.playerPos = worldCullingUniforms.playerPos;
                shader.uniforms.clipRadius = worldCullingUniforms.clipRadius;
                shader.uniforms.aoiRadius = { value: AOI_RADIUS };
                
                shader.vertexShader = `
                    uniform vec2 playerPos;
                    uniform float clipRadius;
                    uniform float aoiRadius;
                    varying float vDist;
                    varying float vAOI;
                ` + shader.vertexShader;
                
                shader.vertexShader = shader.vertexShader.replace(
                    '#include <worldpos_vertex>',
                    `
                    #include <worldpos_vertex>
                    vDist = length(worldPosition.xz - playerPos);
                    vAOI = step(vDist, aoiRadius);
                    `
                );
                
                shader.vertexShader = shader.vertexShader.replace(
                    '#include <project_vertex>',
                    `
                    #include <project_vertex>
                    if (vDist > clipRadius + 150.0) {
                        gl_Position.z = gl_Position.w * 2.0;
                    }
                    `
                );
                
                shader.fragmentShader = `
                    uniform float clipRadius;
                    uniform float aoiRadius;
                    varying float vDist;
                    varying float vAOI;
                ` + shader.fragmentShader;
                
                shader.fragmentShader = shader.fragmentShader.replace(
                    '#include <dithering_fragment>',
                    `
                    #include <dithering_fragment>
                    // Visueller Hinweis auf die AOI-Grenze (Dormant-Zone)
                    if (vDist > aoiRadius) {
                        gl_FragColor.rgb *= 0.85; // Leicht abdunkeln
                    }
                    `
                );
            };
        });
    }

    /**
     * Spezialisierter Shader für das hybride Gras-System (3D/2D LOD).
     */
    function applyGrassShader(material, is3D) {
        if (!material) return;
        const mats = Array.isArray(material) ? material : [material];

        mats.forEach(mat => {
            mat.alphaTest = 0.5;
            mat.transparent = true;
            mat.side = THREE.DoubleSide;

            mat.onBeforeCompile = (shader) => {
                shader.uniforms.playerPos = worldCullingUniforms.playerPos;
                shader.uniforms.time = worldCullingUniforms.time;
                shader.uniforms.lodDist = { value: GRASS_LOD_DIST };
                shader.uniforms.maxDist = { value: GRASS_MAX_DIST };
                
                shader.vertexShader = `
                    uniform vec2 playerPos;
                    uniform float time;
                    uniform float lodDist;
                    uniform float maxDist;
                    varying float vDist;
                    varying vec2 vUV;
                ` + shader.vertexShader;

                // Wind-Animation für 3D-Gras
                if (is3D) {
                    shader.vertexShader = shader.vertexShader.replace(
                        '#include <begin_vertex>',
                        `
                        #include <begin_vertex>
                        // Wind-Animation (Vertex Displacement)
                        // Nutze die Instanz-Position für koordinierte Wellenbewegung
                        float windStrength = 0.4;
                        float windSpeed = 2.5;
                        
                        // Wir holen uns die Welt-Position der Instanz aus der instanceMatrix
                        vec3 wPos = (instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
                        
                        float wave = sin(time * windSpeed + wPos.x * 0.1 + wPos.z * 0.1) * (position.y * 0.3);
                        transformed.x += wave * windStrength;
                        transformed.z += wave * windStrength * 0.5;
                        `
                    );
                }

                shader.vertexShader = shader.vertexShader.replace(
                    '#include <worldpos_vertex>',
                    `
                    #include <worldpos_vertex>
                    vDist = length(worldPosition.xz - playerPos);
                    vUV = uv;
                    `
                );

                // LOD-Culling im Vertex Shader
                shader.vertexShader = shader.vertexShader.replace(
                    '#include <project_vertex>',
                    `
                    #include <project_vertex>
                    bool hide = false;
                    \${is3D ? 'if (vDist > lodDist) hide = true;' : 'if (vDist < lodDist || vDist > maxDist) hide = true;'}
                    if (hide) {
                        gl_Position.z = gl_Position.w * 2.0;
                    }
                    `
                );

                shader.fragmentShader = `
                    uniform float lodDist;
                    uniform float maxDist;
                    varying float vDist;
                    varying vec2 vUV;
                ` + shader.fragmentShader;

                // Chroma-Key für 2D-Gras
                if (!is3D) {
                    shader.fragmentShader = shader.fragmentShader.replace(
                        '#include <map_fragment>',
                        `
                        #include <map_fragment>
                        // Chroma-Key für violett-grauen Hintergrund
                        vec3 chromaKeyColor = vec3(0.486, 0.486, 0.486); // Ca. #7c7c7c
                        float threshold = 0.15;
                        float d = distance(diffuseColor.rgb, chromaKeyColor);
                        if (d < threshold) discard;
                        `
                    );
                }
            };
        });
    }
    
    // --- GPGPU TERRAIN SETTINGS ---
    const GPU_TERRAIN_SIZE = 512; 
    const GPU_WORLD_SIZE = 10000; // Erhöht auf 10km x 10km (100km²) für die 86km² Anforderung
    
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
    let globalWater;

    const NOISE_SHADER = \`
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
            vec2 uv = gl_FragCoord.xy / max(resolution.xy, vec2(1.0));
            vec2 pos = uv * worldSize + offset;
            
            // --- TERRAIN GENERATION 10000x10000 (100km²) ---
            
            // 1. Großräumige Kontinente/Ozeane (0 = Ozean, 1 = Land)
            float continent = snoise(pos * 0.00005) * 0.5 + 0.5;
            continent = smoothstep(0.3, 0.5, continent); // Schärfere Küstenlinien
            
            // 2. Basis-Höhe (FBM für Hügelketten)
            // Landmasse startet bei y=5.0 (über Wasser y=2.0)
            float h = 5.0 + fbm(pos * 0.0003) * 80.0;
            
            // Ozean-Absenkung
            h = mix(-80.0, h, continent);
            
            // 3. Biome-Parameter (Unabhängig von Kontinenten)
            float scale = 0.00012;
            float temp = snoise(pos * scale) * 0.5 + 0.5;
            float humidity = snoise(pos * scale + vec2(200.0, 300.0)) * 0.5 + 0.5;
            
            // 4. BERGE (Dramatischere Gipfel, nur auf Land)
            float mountNoise = pow(abs(snoise(pos * 0.0005)), 2.5);
            float h_mount = fbm(pos * 0.001) * 850.0;
            h += h_mount * smoothstep(0.2, 0.5, mountNoise) * continent;
            
            // 5. TÄLER & SCHLUCHTEN (Erosion-Look)
            // Wir erzeugen Täler, die bis unter den Meeresspiegel (y=2.0) reichen können
            float valleyNoise = snoise(pos * 0.0008 + vec2(1000.0));
            if (valleyNoise > 0.6) {
                float vFactor = smoothstep(0.6, 0.9, valleyNoise);
                h -= vFactor * 400.0;
                
                // Zusätzliche Flussbetten in den Tälern
                float riverBed = abs(snoise(pos * 0.0025 + vec2(500.0)));
                if (riverBed < 0.12) {
                    h -= (1.0 - smoothstep(0.0, 0.12, riverBed)) * 60.0;
                }
            }

            // 6. OZEAN / WASSER GLÄTTUNG
            float waterLevel = 2.0;
            if (h < waterLevel) {
                // Sanfter Übergang in die Tiefe für Seen und Ozeane
                float depthFactor = smoothstep(waterLevel, waterLevel - 20.0, h);
                h = mix(h, -100.0, depthFactor);
            }
            
            // 7. STARTPUNKT & DÖRFER (Ebene Flächen, immer über Wasser)
            float distToStart = length(pos);
            if (distToStart < 1500.0) {
                float startFactor = smoothstep(600.0, 1500.0, distToStart);
                h = mix(15.0, h, startFactor); 
            }

            // Dorf-Positionen (Grob-Check im Shader)
            vec2 v1 = vec2(1200.0, 0.0);
            vec2 v2 = vec2(-1200.0, 0.0);
            vec2 v3 = vec2(0.0, 1200.0);
            vec2 v4 = vec2(0.0, -1200.0);
            
            float d1 = length(pos - v1);
            float d2 = length(pos - v2);
            float d3 = length(pos - v3);
            float d4 = length(pos - v4);
            
            float minDist = min(min(d1, d2), min(d3, d4));
            if (minDist < 400.0) {
                float f = smoothstep(150.0, 400.0, minDist);
                h = mix(10.0, h, f);
            }
            
            // Schutz vor Extremen
            h = clamp(h, -250.0, 1500.0);

            gl_FragColor = vec4(h, 0.0, 0.0, 1.0);
        }
    \`;

    const SMOOTH_SHADER = \`
        void main() {
            vec2 uv = gl_FragCoord.xy / max(resolution.xy, vec2(1.0));
            vec2 texelSize = 1.0 / max(resolution.xy, vec2(1.0));
            
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
            gl_FragColor = vec4(h / max(weightSum, 0.0001), 0.0, 0.0, 1.0);
        }
    \`;

    function initGPGPU(renderer) {
        if (typeof THREE.GPUComputationRenderer === 'undefined') {
            console.error("GPUComputationRenderer not found!");
            return;
        }
        gpuCompute = new THREE.GPUComputationRenderer(GPU_TERRAIN_SIZE, GPU_TERRAIN_SIZE, renderer);
        
        // WICHTIG: FloatType für hohe Präzision der Höhenwerte (verhindert Wellen-Artefakte)
        if (renderer.capabilities.isWebGL2) {
            gpuCompute.setDataType(THREE.FloatType);
        } else {
            const extension = renderer.getContext().getExtension('OES_texture_float');
            if (extension) {
                gpuCompute.setDataType(THREE.FloatType);
            } else {
                gpuCompute.setDataType(THREE.HalfFloatType);
            }
        }
        
        const heightData = gpuCompute.createTexture();
        heightVariable = gpuCompute.addVariable("textureHeight", NOISE_SHADER, heightData);
        heightVariable.magFilter = THREE.LinearFilter;
        heightVariable.minFilter = THREE.LinearFilter;
        
        const smoothData = gpuCompute.createTexture();
        smoothVariable = gpuCompute.addVariable("textureSmooth", SMOOTH_SHADER, smoothData);
        smoothVariable.magFilter = THREE.LinearFilter;
        smoothVariable.minFilter = THREE.LinearFilter;
        
        gpuCompute.setVariableDependencies(smoothVariable, [heightVariable]);
        
        const error = gpuCompute.init();
        if (error !== null) {
            console.error("GPGPU Init Error:", error);
        } else {
            // Uniforms erst nach init() setzen, wenn die Materialien erstellt wurden
            heightVariable.material.uniforms.time = { value: 0 };
            heightVariable.material.uniforms.offset = { value: new THREE.Vector2(0, 0) };
            heightVariable.material.uniforms.worldSize = { value: GPU_WORLD_SIZE };
        }
    }

    function initClipmap(scene) {
        if (!scene) return;
        mainScene = scene;
        
        clipmapGroup = new THREE.Group();
        scene.add(clipmapGroup);

        // Quadratisches Gitter für gleichmäßige Vertex-Verteilung (verhindert Stretching)
        // CLIPMAP_RADIUS * 2 für die Größe, Segmente für Detaildichte
        const geo = new THREE.PlaneGeometry(CLIPMAP_RADIUS * 2, CLIPMAP_RADIUS * 2, 256, 256);
        
        // Wir verwenden einen Standard-Shader und passen ihn an
        clipmapMaterial = new THREE.MeshStandardMaterial({
            vertexColors: false,
            flatShading: false,
            roughness: 0.9,
            metalness: 0.0,
            transparent: false,
            side: THREE.FrontSide,
            depthWrite: true,
            depthTest: true,
            // polygonOffset deaktiviert, um Jitter-Verdacht zu prüfen
            polygonOffset: false
        });

        // Texturen laden (Nutze AssetsLibrary für korrekte Pfade)
        const texLoader = new THREE.TextureLoader();
        const loadTex = (url) => {
            const t = texLoader.load(url);
            t.wrapS = t.wrapT = THREE.RepeatWrapping;
            t.anisotropy = 16;
            t.encoding = THREE.sRGBEncoding; // Sicherstellen, dass Farben korrekt interpretiert werden
            return t;
        };

        const grassTex = loadTex(AssetsLibrary.get('TERRAIN', 'GRASS'));
        const stoneTex = loadTex(AssetsLibrary.get('TERRAIN', 'ROCKS'));
        const desertTex = loadTex(AssetsLibrary.get('TERRAIN', 'ROCKS_DESERT'));
        const leavesTex = loadTex(AssetsLibrary.get('TERRAIN', 'LEAVES')); 
        const flowersTex = loadTex(AssetsLibrary.get('TERRAIN', 'FLOWERS'));

        console.log("🎨 Terrain-Texturen geladen:", { grass: grassTex.image?.src, stone: stoneTex.image?.src });

        // Custom Shader Injection für Displacement und Biome-Farben
        clipmapMaterial.onBeforeCompile = (shader) => {
            shader.uniforms.heightMap = { value: null };
            shader.uniforms.grassTex = { value: grassTex };
            shader.uniforms.stoneTex = { value: stoneTex };
            shader.uniforms.desertTex = { value: desertTex };
            shader.uniforms.leavesTex = { value: leavesTex };
            shader.uniforms.flowersTex = { value: flowersTex };
            shader.uniforms.worldOffset = { value: new THREE.Vector2(0, 0) };
            shader.uniforms.meshOffset = { value: new THREE.Vector2(0, 0) };
            shader.uniforms.playerPos = { value: new THREE.Vector2(0, 0) }; // Actual player pos for vDist
            shader.uniforms.gpuWorldSize = { value: GPU_WORLD_SIZE };
            shader.uniforms.clipRadius = { value: CLIPMAP_RADIUS };
            shader.uniforms.aoiRadius = { value: AOI_RADIUS };
            shader.uniforms.plainsColor = { value: new THREE.Color(0x6ba15a) }; // Helleres Gras
            shader.uniforms.desertColor = { value: new THREE.Color(0xf4dcb3) };
            shader.uniforms.snowColor = { value: new THREE.Color(0xffffff) };
            shader.uniforms.jungleColor = { value: new THREE.Color(0x3d6629) };
            shader.uniforms.swampColor = { value: new THREE.Color(0x3e4521) };
            shader.uniforms.stoneColor = { value: new THREE.Color(0x999999) };
            shader.uniforms.pathColor = { value: new THREE.Color(0xb08d6a) };
            shader.uniforms.oceanColor = { value: new THREE.Color(0x1a4a8a) }; // Tiefblau
            shader.uniforms.forestColor = { value: new THREE.Color(0x2d5a27) }; // Waldgrün

            shader.vertexShader = \`
                uniform sampler2D heightMap;
                uniform vec2 worldOffset;
                uniform vec2 meshOffset;
                uniform vec2 playerPos;
                uniform float gpuWorldSize;
                uniform float clipRadius;
                uniform float aoiRadius;
                varying vec3 vWorldPos;
                varying float vHeight;
                varying float vDist;

                // Manuelle bilineare Filterung für den Vertex-Shader
                float getSmoothHeight(vec2 uv) {
                    float texSize = 512.0; // GPU_TERRAIN_SIZE
                    vec2 f = fract(uv * texSize);
                    vec2 t00 = floor(uv * texSize) / texSize;
                    vec2 t10 = (floor(uv * texSize) + vec2(1.0, 0.0)) / texSize;
                    vec2 t01 = (floor(uv * texSize) + vec2(0.0, 1.0)) / texSize;
                    vec2 t11 = (floor(uv * texSize) + vec2(1.0, 1.0)) / texSize;
                    
                    float h00 = texture2D(heightMap, t00).r;
                    float h10 = texture2D(heightMap, t10).r;
                    float h01 = texture2D(heightMap, t01).r;
                    float h11 = texture2D(heightMap, t11).r;
                    
                    return mix(mix(h00, h10, f.x), mix(h01, h11, f.x), f.y);
                }

                void main() {
                    // UV basierend auf Welt-Position für nahtloses Scrolling
                    vec2 uv = (position.xz + meshOffset - worldOffset) / gpuWorldSize + 0.5;
                    vHeight = getSmoothHeight(uv);
                    
                    vec3 transformed = position;
                    transformed.y = vHeight;
                    
                    vWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
                    vDist = length(vWorldPos.xz - playerPos);

                    gl_Position = projectionMatrix * modelViewMatrix * vec4(transformed, 1.0);
                }
            \`;

            shader.fragmentShader = \`
                uniform sampler2D grassTex;
                uniform sampler2D stoneTex;
                uniform sampler2D desertTex;
                uniform sampler2D leavesTex;
                uniform sampler2D flowersTex;
                uniform vec3 plainsColor;
                uniform vec3 desertColor;
                uniform vec3 snowColor;
                uniform vec3 jungleColor;
                uniform vec3 swampColor;
                uniform vec3 stoneColor;
                uniform vec3 pathColor;
                uniform vec3 oceanColor;
                uniform vec3 forestColor;
                uniform float clipRadius;
                uniform float aoiRadius;
                varying vec3 vWorldPos;
                varying float vHeight;
                varying float vDist;

                void main() {
                    // Biome basierend auf Höhe und Noise (vereinfacht im FS)
                    vec3 color = plainsColor;
                    
                    // Textur-Mapping (Welt-basiert für nahtlose Übergänge)
                    vec2 uv = vWorldPos.xz * 0.05;
                    vec3 tex = texture2D(grassTex, uv).rgb;
                    
                    if (vHeight > 400.0) {
                        color = snowColor;
                        tex = texture2D(stoneTex, uv).rgb;
                    } else if (vHeight > 200.0) {
                        color = stoneColor;
                        tex = texture2D(stoneTex, uv).rgb;
                    } else if (vHeight < 2.0) {
                        color = oceanColor;
                    }
                    
                    // Culling-Visualisierung
                    float alpha = 1.0 - smoothstep(clipRadius * 0.8, clipRadius, vDist);
                    if (vDist > clipRadius) discard;
                    
                    gl_FragColor = vec4(color * tex, alpha);
                }
            \`;
        };

        clipmapMesh = new THREE.Mesh(geo, clipmapMaterial);
        clipmapMesh.rotation.x = -Math.PI / 2;
        clipmapMesh.frustumCulled = false; // Wir handhaben Culling manuell im Shader
        clipmapGroup.add(clipmapMesh);
    }

    let decorationGroups = new Map(); // cellKey -> Group

    function updateClipmapDecorations(px, pz, scene) {
        if (!scene) return;
        
        const cx = Math.floor(px / DECORATION_CELL_SIZE);
        const cz = Math.floor(pz / DECORATION_CELL_SIZE);
        
        const activeKeys = new Set();
        
        for (let x = cx - DECORATION_RANGE; x <= cx + DECORATION_RANGE; x++) {
            for (let z = cz - DECORATION_RANGE; z <= cz + DECORATION_RANGE; z++) {
                const key = \`\${x}_\${z}\`;
                activeKeys.add(key);
                
                if (!decorationGroups.has(key)) {
                    const group = new THREE.Group();
                    decorationGroups.set(key, group);
                    scene.add(group);
                    spawnDecorationsInCell(x, z, group);
                }
            }
        }
        
        // Alte Zellen entfernen
        decorationGroups.forEach((group, key) => {
            if (!activeKeys.has(key)) {
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

    function updateClipmap(px, pz, renderer) {
        if (!clipmapMesh) return;
        
        // GPGPU updaten
        updateGPGPU(px, pz, renderer);
        
        // Clipmap an Spieler-Position ausrichten (Grid-Snapping für Stabilität)
        const snap = 10.0;
        const sx = Math.floor(px / snap) * snap;
        const sz = Math.floor(pz / snap) * snap;
        
        clipmapMesh.position.set(sx, 0, sz);
        
        if (clipmapMaterial.uniforms) {
            clipmapMaterial.uniforms.heightMap.value = gpuCompute.getCurrentRenderTarget(smoothVariable).texture;
            clipmapMaterial.uniforms.worldOffset.value.set(px, pz);
            clipmapMaterial.uniforms.meshOffset.value.set(sx, sz);
            clipmapMaterial.uniforms.playerPos.value.set(px, pz);
            worldCullingUniforms.playerPos.set(px, pz);
        }

        // Dekorationen aktualisieren
        updateClipmapDecorations(px, pz, mainScene);
    }

    function updateGPGPU(px, pz, renderer) {
        if (!gpuCompute || !heightVariable || !heightVariable.material) return;
        
        // Offset so setzen, dass der Spieler in der Mitte der Textur ist
        const ox = px - GPU_WORLD_SIZE / 2;
        const oz = pz - GPU_WORLD_SIZE / 2;
        
        if (heightVariable.material.uniforms.offset) {
            heightVariable.material.uniforms.offset.value.set(ox, oz);
        }
        gpuCompute.compute();
        
        const renderTarget = gpuCompute.getCurrentRenderTarget(smoothVariable);
        if (renderTarget) {
            renderer.readRenderTargetPixels(renderTarget, 0, 0, GPU_TERRAIN_SIZE, GPU_TERRAIN_SIZE, gpuHeightData);
        }
    }
    
    function getGPUHeight(x, z, noFallback = false) {
        if (!gpuCompute) return noFallback ? null : getCPUHeight(x, z);
        
        const ox = heightVariable.material.uniforms.offset.value.x;
        const oz = heightVariable.material.uniforms.offset.value.y;
        
        // Relative Position in UV umrechnen (0 bis 1)
        const u = (x - ox) / GPU_WORLD_SIZE;
        const v = (z - oz) / GPU_WORLD_SIZE;
        
        if (u < 0 || u > 1 || v < 0 || v > 1) {
            return noFallback ? null : getCPUHeight(x, z);
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
        
        // Fallback wenn GPGPU noch keine Daten hat oder noch initialisiert
        if (h === 0) {
            if (noFallback) return null;
            return getCPUHeight(x, z);
        }
        
        return h;
    }
    
    let chunks = new Map();
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
        
        chunks.forEach(chunk => {
            if (chunk.group) {
                chunk.group.children.forEach(obj => {
                    if (obj.isBuildingGroup) {
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
        localStorage.setItem('houseCalibrationParams', JSON.stringify(calibrationParams));
        
        const x = selectedHouse.position.x;
        const z = selectedHouse.position.z;
        const name = selectedHouse.userData.name;
        const parent = selectedHouse.parent;
        
        parent.remove(selectedHouse);
        
        let type = 'calibration';
        if (calibrationParams.houseModel === 'house1') {
            type = 'house1';
        }

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
            if (typeof THREE.DRACOLoader !== 'undefined') {
                const dracoLoader = new THREE.DRACOLoader();
                dracoLoader.setDecoderPath('https://www.gstatic.com/draco/v1/decoders/');
                loader.setDRACOLoader(dracoLoader);
            }
        }
    } catch (e) {
        console.error("Fehler beim Initialisieren des GLTFLoaders:", e);
    }

    const modelCache = new Map();

    async function loadModel(path) {
        if (modelCache.has(path)) return modelCache.get(path).clone();
        if (!loader) throw new Error("Loader not initialized");
        
        const encodedPath = (path.startsWith('http') || path.startsWith('animation/') || path.includes('%')) 
            ? path 
            : AssetsLibrary.encode(path);
        
        const tryLoad = (fullPath) => {
            return new Promise((resolve, reject) => {
                loader.load(fullPath, (gltf) => {
                    const isTerrain = fullPath.includes('/Terrain/') || fullPath.includes('Terrain_Grass') || fullPath.includes('ocean.glb');
                    gltf.scene.traverse(obj => {
                        if (obj.isMesh && obj.material) {
                            applyWorldCulling(obj.material, isTerrain);
                        }
                    });
                    modelCache.set(path, gltf.scene);
                    resolve(gltf.scene.clone());
                }, undefined, reject);
            });
        };

        try {
            return await tryLoad(encodedPath);
        } catch (e) {
            if (path.includes('/glTF/')) {
                const fallbackPath = path.replace('/glTF/', '/');
                return await tryLoad(fallbackPath);
            }
            throw e;
        }
    }

    async function createModularHouse(type = 'small', seedX = 0, seedZ = 0) {
        const group = new THREE.Group();
        
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
                    const rand = Math.random();
                    s = 8 + rand * 4;
                    group.rotation.y = Math.floor(rand * 4) * (Math.PI / 2);
                }
                model.scale.set(s, s, s);
                group.add(model);
                return group;
            } catch (e) {
                console.warn("Konnte House_1.glb nicht laden, wechsle zu modular:", e);
            }
        }

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

        return group;
    }

    function simpleNoise(x, z) {
        let n = Math.sin(x * 0.0123 + z * 0.0456) + Math.cos(x * 0.0789 - z * 0.0123);
        n += Math.sin(x * 0.0234 - z * 0.0567) * 0.5;
        return n * 0.5;
    }

    const VILLAGE_LOCATIONS = [
        { x: 0, z: 0, radius: 400 },
        { x: 1200, z: 0, radius: 300 },
        { x: -1200, z: 0, radius: 300 },
        { x: 0, z: 1200, radius: 300 },
        { x: 0, z: -1200, radius: 300 }
    ];

    function getTerrainHeight(x, z) {
        if (gpuCompute && gpuHeightData && gpuHeightData.length > 0) {
            const gh = getGPUHeight(x, z, true);
            if (gh !== null) return gh;
        }
        return getCPUHeight(x, z);
    }

    function getCPUHeight(x, z) {
        const distToCenter = Math.hypot(x, z);
        let villageFactor = 1.0;
        for (const loc of VILLAGE_LOCATIONS) {
            const d = Math.hypot(x - loc.x, z - loc.z);
            if (d < loc.radius) {
                const f = Math.max(0, (d - loc.radius * 0.4) / (loc.radius * 0.6));
                villageFactor = Math.min(villageFactor, Math.pow(f, 2));
            }
        }
        
        let h = 15.0; // Basis-Höhe am Startpunkt
        if (distToCenter > 1000.0) {
            h += simpleNoise(x * 0.01, z * 0.01) * 50.0;
        }
        return h * villageFactor;
    }

    async function spawnDecorationsInCell(cx, cz, group) {
        // Implementierung von Dekorationen (Bäume, Steine, etc.)
    }

    async function initWorld(scene, env, enterHouseCallback, renderer) {
        if (renderer) {
            initGPGPU(renderer);
            initClipmap(scene);
            updateClipmap(0, 0, renderer);
        }
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
    }

    window.FPGraphics = {
        CLIPMAP_RADIUS,
        chunks,
        isInterior,
        currentInterior,
        villageBuildings,
        initWorld,
        getTerrainHeight,
        updateGPGPU,
        getGPUHeight,
        updateClipmap,
        cleanup,
        createModularHouse,
        selectNearestHouse,
        updateCalibration,
        PALETTE
    };
})();
