# Summ!

Ein kleines Browser-Spiel: Flieg die Biene durch die Lücken zwischen den Honigwaben-Säulen.

**Steuerung:** Klicken / Tippen / Leertaste / Pfeil hoch = flattern · `M` = Ton an/aus

**Welten:** Die Säulen sind aus Pixel-Blöcken gebaut (Stein, Holz, Ziegel, Erde …). Oberwelt, Feuerwelt (Boss), Sternenleere und Wasserwelt.

**Musik:** Ruhige Klaviermusik in der Oberwelt, die sich immer wieder verändert; beim Boss läuft Endboss-Musik.

**Spielfigur:** Ein kleiner Zombie-Knirps, der auf einem Huhn reitet. Beim Springen stöhnt der Zombie oder das Huhn gackert.

**Viktor auf dem Roller:** Ab und zu düst Viktor in der Oberwelt auf seinem E-Roller (mit „JOYOR“-Schriftzug) an dir vorbei.

**Bosskampf (bei 100, 200, 300 …):** Bei 99 kommt ein Portal in die Feuerwelt, dort wartet **Viktor**, ein dürres Gruselwesen mit Tierschädel, Geweih und viel zu langen Krallenarmen.
1. **Laser:** Viktor schwebt rechts und schickt Laser, denen du ausweichen musst.
2. **Verfolgung:** Danach krabbelt Viktor dir auf allen Vieren hinterher und kommt immer näher.
3. **Flucht:** Der einzige Ausweg ist ein **Blockloch** im Boden (gelber Pfeil) – lass dich hineinfallen!
4. Du stürzt durch die **Leere**, bis unten ein neues Portal kommt – es bringt dich in die **Wasserwelt**.

Mit jedem Boss wird Viktor verrückter, länger und sein Geweih wächst. Seine Stufe bleibt auch nach einem Neustart erhalten.

**Testmodus:** `index.html?start=97` startet direkt mit 97 Punkten (kurz vor dem Boss) (der Rekord wird dann nicht gespeichert).

Reines HTML + CSS + JavaScript – kein Build, keine Abhängigkeiten.

## Lokal spielen

`index.html` einfach im Browser öffnen.

## Auf GitHub Pages veröffentlichen

### Variante A: ohne Git (nur Browser)

1. Auf GitHub ein neues, **öffentliches** Repository anlegen (z. B. `summ-game`).
2. Im Repo auf **„uploading an existing file“** klicken und `index.html`, `style.css`, `game.js` und `README.md` hineinziehen → **Commit changes**.
3. **Settings → Pages → Source: „Deploy from a branch“**, Branch `main`, Ordner `/ (root)` → **Save**.
4. Nach ca. 1 Minute läuft das Spiel unter `https://<DEIN-NAME>.github.io/summ-game/`.

### Variante B: mit Git

1. Auf GitHub ein neues Repository anlegen (z. B. `summ-game`).
2. In diesem Ordner:
   ```
   git init
   git add .
   git commit -m "Summ! – erstes Release"
   git branch -M main
   git remote add origin https://github.com/<DEIN-NAME>/summ-game.git
   git push -u origin main
   ```
3. Im Repository auf GitHub: **Settings → Pages → Source: „Deploy from a branch“**, Branch `main`, Ordner `/ (root)` → **Save**.
4. Nach ca. 1 Minute läuft das Spiel unter `https://<DEIN-NAME>.github.io/summ-game/`.
