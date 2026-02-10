---
name: asset-anchor
description: Garantiert die physikalisch korrekte Platzierung von Objekten auf unebenem Gelände.
---

1. Führe vor jeder Objekt-Platzierung ein Raycasting von oben (Y=1000) nach unten durch. 2. Setze die Objekt-Position exakt auf den Schnittpunkt mit dem Terrain-Mesh. 3. Ignoriere die Wasser-Ebene beim Feststellen der Bodenhöhe.