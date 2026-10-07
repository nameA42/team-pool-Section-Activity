// Backend: Firebase Firestore when firebase-config.js is filled in, otherwise a
// local "demo mode" (localStorage + BroadcastChannel) that only connects tabs
// in the same browser. Both expose the same small API.
//
// Firestore layout (all under one room so classes / test runs stay separate):
//   rooms/{room}                    { phase: "lobby" | "running" | "done", mode, at }
//   rooms/{room}/students/{id}      { name, answers: [0|1...], at }
//   rooms/{room}/results/{id}       { team, mates, nudged, ... }  (written by the presenter)
const SDK = "https://www.gstatic.com/firebasejs/10.12.2/";

export const room = (new URLSearchParams(location.search).get("room") || "class").toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 24) || "class";

export async function connect() {
  const cfg = window.FIREBASE_CONFIG;
  if (!cfg || !cfg.projectId) return localBackend(room);
  try {
    return await firebaseBackend(room, cfg);
  } catch (e) {
    console.error("Firebase failed to start, using demo mode", e);
    return localBackend(room, e);
  }
}

async function firebaseBackend(room, cfg) {
  const { initializeApp } = await import(SDK + "firebase-app.js");
  const fs = await import(SDK + "firebase-firestore.js");
  const db = fs.getFirestore(initializeApp(cfg));
  const roomRef = fs.doc(db, "rooms", room);
  const students = fs.collection(roomRef, "students");
  const results = fs.collection(roomRef, "results");
  const api = { kind: "firebase", room, onError: null };
  const fail = (e) => { console.error(e); api.onError && api.onError(e); };
  const wipe = async (col) => {
    const snap = await fs.getDocs(col);
    for (let i = 0; i < snap.docs.length; i += 400) {
      const b = fs.writeBatch(db);
      snap.docs.slice(i, i + 400).forEach((d) => b.delete(d.ref));
      await b.commit();
    }
  };
  Object.assign(api, {
    onStudents(cb) {
      return fs.onSnapshot(students, (snap) => cb(snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => a.at - b.at)), fail);
    },
    submit: (s) => fs.setDoc(fs.doc(students, s.id), { name: s.name, answers: s.answers, at: s.at || Date.now() }),
    async remove(id) { await fs.deleteDoc(fs.doc(students, id)); await fs.deleteDoc(fs.doc(results, id)); },
    onRoom(cb) { return fs.onSnapshot(roomRef, (d) => cb(d.exists() ? d.data() : { phase: "lobby" }), fail); },
    setRoom: (data) => fs.setDoc(roomRef, { ...data, at: Date.now() }, { merge: true }),
    publishResult: (id, r) => fs.setDoc(fs.doc(results, id), r),
    onResult(id, cb) { return fs.onSnapshot(fs.doc(results, id), (d) => cb(d.exists() ? d.data() : null), fail); },
    clearResults: () => wipe(results),
    async reset() { await wipe(results); await wipe(students); await api.setRoom({ phase: "lobby", mode: null }); },
  });
  // fail fast if the database isn't reachable or the rules block us
  await Promise.race([
    fs.getDoc(roomRef),
    new Promise((_, rej) => setTimeout(() => rej(new Error("Firestore didn't answer in 8s")), 8000)),
  ]);
  return api;
}

function localBackend(room, error) {
  const key = (k) => `teampool:${room}:${k}`;
  const read = (k, d) => { try { return JSON.parse(localStorage.getItem(key(k))) ?? d; } catch { return d; } };
  const write = (k, v) => { try { localStorage.setItem(key(k), JSON.stringify(v)); } catch {} };
  const ch = "BroadcastChannel" in window ? new BroadcastChannel("teampool:" + room) : null;
  const subs = { students: new Set(), room: new Set(), results: new Set() };
  const emit = (what) => {
    if (what === "students") { const l = read("students", []).sort((a, b) => a.at - b.at); subs.students.forEach((cb) => cb(l)); }
    if (what === "room") { const r = read("room", { phase: "lobby" }); subs.room.forEach((cb) => cb(r)); }
    if (what === "results") { const r = read("results", {}); subs.results.forEach((x) => x.cb(r[x.id] || null)); }
  };
  const changed = (what) => { emit(what); ch && ch.postMessage(what); };
  if (ch) ch.onmessage = (e) => emit(e.data);
  const on = (set, item, first) => { set.add(item); first(); return () => set.delete(item); };
  return {
    kind: "local", room, error, onError: null,
    onStudents: (cb) => on(subs.students, cb, () => cb(read("students", []).sort((a, b) => a.at - b.at))),
    async submit(s) { write("students", read("students", []).filter((x) => x.id !== s.id).concat([{ id: s.id, name: s.name, answers: s.answers, at: s.at || Date.now() }])); changed("students"); },
    async remove(id) {
      write("students", read("students", []).filter((x) => x.id !== id));
      const r = read("results", {}); delete r[id]; write("results", r);
      changed("students"); changed("results");
    },
    onRoom: (cb) => on(subs.room, cb, () => cb(read("room", { phase: "lobby" }))),
    async setRoom(d) { write("room", { ...read("room", {}), ...d, at: Date.now() }); changed("room"); },
    async publishResult(id, r) { const all = read("results", {}); all[id] = r; write("results", all); changed("results"); },
    onResult(id, cb) { const x = { id, cb }; return on(subs.results, x, () => cb(read("results", {})[id] || null)); },
    async clearResults() { write("results", {}); changed("results"); },
    async reset() { write("students", []); write("results", {}); write("room", { phase: "lobby" }); changed("students"); changed("results"); changed("room"); },
  };
}
