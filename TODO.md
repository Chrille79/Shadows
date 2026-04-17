# Shadows — TODO

Genomgång av projektet 2026-04-14. Grupperat efter allvarlighetsgrad.

## 🔴 Kritiska buggar

- [x] **`main.ts:49-50` — `loadStageTextures` och `loadCharacterTextures` awaitas inte.** ✅ Wrappade i `await Promise.all([...])` inne i try-blocket.
- [x] **`character.ts:201-207` — fallback-spriten flushas aldrig.** ✅ `sprites.flush(pass)` anropas före texturswitch och efter fallback-draw (med default white bindgroup).
- [x] **`spriteRenderer.ts` — sprites tappas tyst vid MAX_SPRITES-överskridning.** ✅ `console.warn` en gång per frame, återställs i `beginFrame`.

## 🟠 Höga — resursläckor & robusthet

- [x] **Event listeners städas aldrig.** ✅ `renderer.dispose()` tar bort resize-listener; `installInput`/`disposeInput` hanterar keydown/keyup. Kopplat till `import.meta.hot.dispose` i `main.ts`.
- [x] **WebGPU-resurser förstörs aldrig (delvis).** ✅ Renderer's `projectionBuffer` och parallax-texturer destrueras vid HMR-dispose. Kvar: stage-texturer, character-texturer och spriteRenderer's interna buffers/whiteTexture behöver också dispose-vägar.
- [x] **`textureLoader.ts` — ingen felhantering.** ✅ Try/catch runt både `loadTextureBitmap` och `loadTexture`; magenta 1×1 fallback-textur så missade assets blir synliga.
- [x] **`renderer.ts:28` / `editor.ts:34` — non-null assertion på `getContext`.** ✅ Explicit null-check med meningsfulla fel.
- [x] **`main.ts:98` — `${err}` visar `[object Object]`.** ✅ Använder `err instanceof Error ? err.message : String(err)` + `console.error(err)`.
- [ ] **`animation.ts` — `play('okänt')` fastnar på gammal frame.** Validera animation-namn i `play()` eller logga varning.

## 🟡 Gameplay / saknade kärnfeatures (plattformare)

- [ ] **Kollision bara uppifrån.** `character.ts:132-150` hanterar bara landning — inga väggar eller tak. Karaktären kan gå rakt igenom plattformar från sidan. **Högsta prio för en plattformare.**
- [ ] **Ingen state-maskin för karaktären.** `idle | run | jump | fall` — grunden för animation-switching och framtida mekaniker (dubbel-hopp, wall-jump, dash).
- [ ] **Mål/målzon + nivåslut.** Vad är "vinstvillkoret" för en bana? Fanion, dörr, trigger-rect i editorn.
- [ ] **Faror / instadöd-zoner.** Spikar, vatten, fall-off-bottom (redan finns respawn vid y>3000, men ingen visuell feedback).
- [ ] **Collectibles** (mynt, stjärnor, etc.) — enkel entity + hitbox-check mot spelaren.
- [ ] **Ingen ljudmotor.** Web Audio-wrapper för SFX (hopp, landning, pickup) + bakgrundsmusik.
- [ ] **Ingen gamepad-input.** `input.ts` stödjer bara tangentbord. Lägg till GamepadAPI.
- [ ] **Ingen pause/meny/game state machine.** Lägg till en scenhanterare (`MenuScene`, `GameScene`, `EditorScene`).
- [ ] **Bara en hårdkodad bana.** Nivåval / nivåprogression saknas. Editorn kan redan spara, men runtime läser bara `localStorage['shadows:level']`.
- [ ] **Ingen partikel-/VFX-motor.** Landing-dust, pickup-sparks, dust-puff vid wall-slide osv.
- [ ] **Ingen animation-blending.** Abrupta klipp mellan states.
- [ ] **Rörliga plattformar / switchar / dörrar.** Kräver att stage får entity-delar utöver statiska rects.

## 🟢 Kodkvalitet

- [ ] **Magiska tal utspridda.** `GRAVITY=1800`, `MOVE_SPEED=400`, `JUMP_FORCE=-650` (`character.ts:49-52`), `TILE_HEIGHT=50` (`stage.ts:33`), kollisions-epsilon 4px, parallax-speeds i `main.ts:36`. Samla i `config.ts` eller per-system konstantfil.
- [ ] **`CharacterInternal`-hacket (`character.ts:99-101`)** för att smyga in `_bindGroups` — flytta in `bindGroups: Map<string, GPUBindGroup>` som ett legitimt fält på `Character`.
- [ ] **Global input-state (`input.ts:14-15`).** Modul-globala `keys`/`justPressed` gör det svårt att testa och omöjligt att ha lokal multiplayer med två inputkällor. Wrappa i `class InputManager`.
- [ ] **Character blandar fysik och rendering.** `textureBindGroup`, `spriteSize`, `spriteSet` ligger på samma objekt som velX/velY. Splitta i `Character` + `CharacterRenderer`.
- [ ] **Platform-loop är O(n) per frame (`character.ts:135`).** Inte akut, men med 500+ tiles blir det kännbart. Spatial grid (1 cell = 1 TILE) räcker långt.
- [ ] **UV-beräkning i `stage.ts:151-154` görs per frame.** Cacha i `typeResources` en gång vid texturladdning.
- [ ] **Editor: `redraw()` på varje mousemove (`editor.ts:231`).** Sätt en `dirty`-flagga och rita i `requestAnimationFrame`.
- [ ] **Editor: `JSON.parse` utan schema-validering (`editor.ts:286`).** Validera `version`, `worldWidth`, `platforms`-shape innan användning.
- [ ] **Kameran klampar mot `WORLD_W - GAME_W`** — om någon nån gång gör en bana smalare än skärmen blir det negativt klamp-intervall. Lägg in Math.max(0, ...).

## 🔵 Arkitektur (senare)

- [ ] Scene/State-manager som äger laddning & städning av GPU-resurser.
- [ ] Event bus (`"character:landed"`, `"character:hit"`) så VFX/ljud kan reagera utan tight coupling.
- [ ] Entity-abstraktion — just nu finns bara `player`; en fighter behöver ≥2 spelare + projektiler + pickups.
- [ ] Tile-atlas-packing istället för en GPU-textur per atlas-URL.

## ⚙️ Server

- [ ] `Shadows.Server/Program.cs` är placeholder (WebSocket-eko). Med ren plattformare finns inget hårt krav på server i nuläget — behövs bara om vi vill ha nivå-delning, leaderboards, konton eller level-browser.
- [ ] Ingen persistens (nivåer, konton, stats). EF Core + SQLite om/när det behövs.

## ✅ Det som är bra (behåll)

- Sprite-batchern med `bufferOffset` över flera flushes fungerar korrekt.
- Fixed-timestep gameloop med interpolation (`gameLoop.ts`).
- Rena WGSL-shaders.
- Editor är funktionell och spar/laddar `localStorage` + JSON-export.
- Tile-extractorn som tightar bounds är en riktigt bra detalj.
