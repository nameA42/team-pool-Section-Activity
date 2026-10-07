// Helpers shared by every toy: ids, ball colors, initials, fake students.
(function () {
  const NAMES = ["Ava", "Ben", "Cleo", "Dev", "Eli", "Fatima", "Gus", "Hana", "Isa", "Jonah", "Kai", "Lena",
    "Milo", "Nia", "Omar", "Priya", "Quinn", "Rosa", "Sam", "Tariq", "Uma", "Vic", "Wren", "Xavi", "Yara",
    "Zeke", "Aria", "Bodhi", "Cyrus", "Dina", "Ezra", "Faye", "Gia", "Hugo", "Ivy", "Jude", "Kira", "Leo"];

  // Small seeded RNG so the same seed always gives the same class.
  function rng(seed) {
    let s = seed >>> 0 || 1;
    return () => {
      s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0;
      return s / 4294967296;
    };
  }

  function hash(str) {
    let h = 2166136261;
    for (const c of str) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
    return h >>> 0;
  }

  window.Fake = {
    rng,
    id: () => Math.random().toString(36).slice(2, 10),
    color: (id) => `hsl(${hash(id) % 360} 75% 58%)`,
    initials(name) {
      const parts = name.trim().split(/\s+/);
      return ((parts[0]?.[0] || "?") + (parts[1]?.[0] || parts[0]?.[1] || "")).toUpperCase();
    },
    // Students are drawn from a few "personality" archetypes plus noise, so the
    // class has real clusters the way an actual class would.
    students(n, seed = 1, noise = 0.22, archetypes = 4) {
      const r = rng(seed);
      const types = Array.from({ length: archetypes }, () => Array.from({ length: 10 }, () => (r() < 0.5 ? 0 : 1)));
      const used = new Set();
      return Array.from({ length: n }, (_, i) => {
        const t = types[Math.floor(r() * archetypes)];
        let name = NAMES[i % NAMES.length];
        if (used.has(name)) name += " " + String.fromCharCode(65 + Math.floor(i / NAMES.length));
        used.add(name);
        return { id: "fake-" + seed + "-" + i, name, answers: t.map((a) => (r() < noise ? 1 - a : a)), at: Date.now() + i };
      });
    },
    oneStudent(existing) {
      const taken = new Set(existing.map((s) => s.name));
      const free = NAMES.filter((n) => !taken.has(n));
      const name = free.length ? free[Math.floor(Math.random() * free.length)] : "Student " + (existing.length + 1);
      // Lean toward an existing student's answers half the time so clusters form.
      const base = existing.length && Math.random() < 0.6 ? existing[Math.floor(Math.random() * existing.length)].answers : null;
      const answers = Array.from({ length: 10 }, (_, k) => (base ? (Math.random() < 0.25 ? 1 - base[k] : base[k]) : Math.random() < 0.5 ? 0 : 1));
      return { id: "fake-" + Math.random().toString(36).slice(2, 8), name, answers, at: Date.now() };
    },
  };
})();
