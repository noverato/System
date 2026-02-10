# Project Rules: The Nest (Ultimate Full-System Logic)

## 1. Zugriff & Sicherheit (Twitch, Bot & Handy)
* ** Twitch Auto-Identifikation:** Zwingender Login-Check via Twitch-API für jeden Zuschauer.
* ** streamer.bot Abhängigkeit:** Die Welt ist NUR betretbar, wenn der Stream aktiv ist und streamer.bot das Signal "Online" gibt. Kein Offline-Zugriff für Spieler möglich.
* ** Handy-Validierung:** Device-Aware UI: Das System muss aktiv zwischen Desktop- und Mobile-Usern unterscheiden (User-Agent Sniffing oder Viewport-Check).
* ** Handy-Modus: Automatische Aktivierung der Touch-Steuerung, größere Buttons und ein kompaktes HUD, das den kleinen Bildschirm nicht verdeckt.
* ** Desktop-Modus: Volle Tastatur/Maus-Unterstützung und detaillierteres Interface.
* ** Validierung: Verhindere, dass Mobile-Elemente (wie ein virtueller Joystick) auf dem Desktop erscheinen, es sei denn, ein Touch-Monitor wird erkannt.


## 2. System-Architektur & Firebase
* **Firebase Core:** Firestore speichert alle Profile (LXP, EP, Klasse, Pfad, PvP, Inventar).
* **Realtime-Sync:** Alle Aktionen (Sammeln, Handeln, Evolution) müssen sofort in Firebase gespiegelt werden.

## 3. Wirtschaft & Marktdynamik
* **LXP Währung:** Basis für alle Transaktionen.
* **Inflation/Deflation:** Preise für Crafting und Schmiede passen sich dynamisch an die Gesamtmenge der im Umlauf befindlichen LXP an.
* **Handel:** Sicherer Spieler-zu-Spieler Handel mit LXP, validiert durch Firebase-Transaktionen.

## 4. Evolution & Subscriber-Power
* **Follower-Weg:** 1. Ei -> 2. Sprössling (Ermöglicht Klassenwahl).
* **Subscriber-Entwicklung:** Spezielle Titel und massive Power-Boosts (Stufe 1: Drachen-Küken bis Stufe 7: Göttlicher Avatar mit +200% Power).

## 5. Gameplay: Loot, Sammeln & Crafting
* **Sammel-System:** Ressourcen-Spawn auf der 86 km² Map basierend auf Biomen.
* **Beute (Loot):** Zufallsgenerierter Loot nach Kämpfen/Events, direkt verknüpft mit dem Firebase-Inventar.
* **Crafting & Schmiede:** Herstellung von klassenspezifischer Ausrüstung (Licht/Dunkel) gegen LXP und gesammelte Ressourcen.

## 6. Class Register (Ab Stufe Sprössling)
* **Klassen:** Waldläufer, Natur-Krieger, Druide, Hüter, Sucher, Einsiedler, Wächter.
* **Pfad-Wahl:** Jede Klasse muss sich für Licht oder Dunkel entscheiden (beeinflusst Skills & 3D-Modelle).

## 7. Welt-Simulation & AOI-System (Master Rule):
* **AOI-Radius: Alle Assets nutzen das Per-Player Simulation Bubble System (AOI).
* **Simulation State: Nur innerhalb des AOI-Radius sind AI, Physik und Ticks aktiv.
* **Dormant State: Assets außerhalb des Radius bleiben sichtbar, werden aber in den Dormant-Modus versetzt (0% CPU-Last, keine Logik).
* **Raycasting-Pflicht: Bleibt bestehen für das initiale Placement, aber erst nach Height-Validation im AOI-Radius (Fix für Unter-der-Erde-Spawn).**
* ** Spieler können nur im AOI-Radius interagieren.