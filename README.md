# 🏊 Team Pool

A one-off classroom game that sorts students into teams of 2–4 by how alike their answers are.

1. Students open the site on their phones, type their name and answer the questions.
2. Each finished student cannonballs into a **pool** on the big screen and floats around on a floatie, with fish and a rubber duck. Click the duck and it quacks.
3. The teacher picks a **presentation mode** and presses Start. The matcher builds the teams, and the mode shows it happening. Anywhere the algorithm had to override someone's answers to keep teams at 2–4, you see a 👉 **nudge**.
4. When their ball lands, each phone shows that student's team, their teammates, and how much they were adjusted.

| Page | Who | What |
|---|---|---|
| `index.html` (the site root) | students, on phones | the survey, then your result |
| `present.html` | teacher, on the projector | pool lobby, mode picker, the show, team list |
| `lab.html` | teacher (🔬 button) | the matcher's working: every team, answer strips, who got split from their best match |

**Presentation modes**
- 🧲 **Magnets**: questions are revealed one at a time and charge every ball. Alike balls attract and opposites repel. Repulsion then ramps up until natural groups form, and then the 2–4 rule is enforced.
- 🛤️ **Marble sorter**: each question is a fork in a track. Strays get flicked to their team's bin.
- 🎰 **Plinko**: the original drop. Each path is real physics, computed backwards from the team bin. It takes a few seconds to compute.

---

## Setup (about 15 minutes, free)

You need a Google account (for Firebase) and a GitHub account (for hosting).

### 1. Create the Firebase project and database
1. Go to <https://console.firebase.google.com> → **Create a project** (any name, e.g. `team-pool`). Google Analytics can be turned off.
2. In the left menu: **Build → Firestore Database → Create database**.
   - Location: anything near you (e.g. `us-central`).
   - Choose **Start in test mode** → Create.
3. Open the **Rules** tab and replace everything with the contents of [`firestore.rules`](firestore.rules), then **Publish**.
   These rules let anyone with the link read and write, which is fine for a one-off game. They lock themselves on 31 Dec 2026; change that date if you reuse the game.

### 2. Connect the site to Firebase
1. In Firebase: ⚙️ **Project settings → General → Your apps → `</>` (Web)**. Give it a nickname, leave Hosting **unchecked**, and click Register.
2. It shows a `firebaseConfig = { ... }` block. Copy the `{ ... }` part.
3. Open [`firebase-config.js`](firebase-config.js) and replace `window.FIREBASE_CONFIG = null;` with
   ```js
   window.FIREBASE_CONFIG = { apiKey: "…", authDomain: "…", projectId: "…", storageBucket: "…", messagingSenderId: "…", appId: "…" };
   ```
   These values are meant to be public. Firebase web config isn't a secret.

### 3. Put it on GitHub Pages
1. Create a new **public** repository on GitHub, e.g. `team-pool`.
2. Upload the *contents* of this `team-pool` folder (not the folder itself) to the repo. Either drag the files into the repo's **Add file → Upload files** page, or from this folder run:
   ```bash
   git init && git add . && git commit -m "Team Pool" && git branch -M main
   git remote add origin https://github.com/<you>/team-pool.git && git push -u origin main
   ```
3. In the repo: **Settings → Pages → Build and deployment → Source: Deploy from a branch → `main` / `(root)` → Save**.
4. After a minute or two the site is live at `https://<you>.github.io/team-pool/`:
   - Students: `https://<you>.github.io/team-pool/`
   - You: `https://<you>.github.io/team-pool/present.html`

### 4. Check it works
1. Open `present.html` on your computer. The top bar should say **🟢 Live**.
   - 🟡 *Demo mode* means `firebase-config.js` is still `null`, or GitHub Pages hasn't picked up the new file yet. Wait a minute and hard-refresh.
   - 🔴 means Firebase was reached but refused. Usually the rules weren't published, or Firestore wasn't created. Hover the pill to see the error.
2. Scan the QR code with your phone, answer the questions, and watch your floatie splash into the pool.
3. Practice without touching the real room: use `present.html?room=practice`. The QR code updates to match.

---

## On the day
1. Open `present.html`, click **⛶ Fullscreen** (Esc to leave), and turn the sound on. The duck needs one click somewhere before the browser allows audio.
2. Students scan the QR code (also shown in the pool's corner) or type the address.
3. Watch the pool fill up. If a name is a joke or a duplicate, remove it with **×** in *Who's in*.
4. Pick a mode, press **Start**. When the show finishes, the team list is on the right and each phone shows its result.
5. **Back to the pool** returns everyone to the water so you can run a different mode with the same answers. **Replay** reruns the current mode.
6. Before next class: open **Test & admin tools → Reset room** to clear everyone out.

**Rehearse** with *Test & admin tools → Fill to 25 fakes*, and use *Remove fakes* afterwards. Fakes behave exactly like students.

---

## Customising
- **Questions**: edit [`questions.js`](questions.js). Each needs two options. 3–10 questions work. Reset the room after changing them, because answers with a different question count are ignored.
- **Team sizes**: `MIN`/`MAX` at the top of [`js/matcher.js`](js/matcher.js) (currently 2 and 4).
- **Rooms**: any `?room=name` keeps a separate set of students. That's handy for two classes or a practice run.

## Files
```
index.html  present.html  lab.html      the three pages
questions.js  firebase-config.js        the two files you edit
firestore.rules                          paste into Firebase
css/style.css
js/backend.js     Firebase / demo-mode data layer (rooms/{room}/students|results)
js/matcher.js     team-making algorithm (simulated annealing, teams of 2–4)
js/engine.js      runs a presentation mode on the canvas, shared drawing helpers
js/pool.js        the lobby pool: floaties, fish, duck, quack + splash sounds
js/modes/         magnets.js, sorter.js, plinko.js
js/reverse.js + solver-worker.js   Plinko's backwards-physics path planner
js/physics.js  js/fake.js           tiny physics engine; ids, colours, fake students
```

**Without Firebase** (no config, or opening the files locally) the site runs in **demo mode**. Everything works between tabs of the same browser, but phones can't connect. To try it locally, run this from the folder and open <http://localhost:8000/present.html>:
```bash
python -m http.server 8000
```
Plinko's workers need a web server, so it won't work if you open the file directly.
