"use strict";
/* storage.js — salvataggio locale sul telefono (Capacitor Preferences).
   Interfaccia semplice (get/set/delete/list) pensata per essere sostituita
   da Firestore nella Fase 3 senza toccare il resto dell'app.
   Le scritture sono messe in coda (enqueue) perché l'app può salvare più
   collezioni quasi in contemporanea (es. un pasto + la cronologia): senza
   coda, due letture-modifiche-scritture dell'indice in parallelo si
   sovrascrivono a vicenda e si perdono le voci salvate per prime. */
(function () {
  const PREFS = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Preferences;
  const PREFIX = "gv:";
  const INDEX_KEY = "gv:index";

  let idsCache = null;
  let queue = Promise.resolve();
  function enqueue(fn) {
    const run = queue.then(fn, fn);
    queue = run.then(() => {}, () => {});
    return run;
  }

  async function loadIds() {
    if (idsCache) return idsCache;
    if (!PREFS) { idsCache = new Set(); return idsCache; }
    try {
      const { value } = await PREFS.get({ key: INDEX_KEY });
      idsCache = new Set(value ? JSON.parse(value) : []);
    } catch { idsCache = new Set(); }
    return idsCache;
  }
  async function saveIds() {
    if (!PREFS) return;
    await PREFS.set({ key: INDEX_KEY, value: JSON.stringify([...idsCache]) });
  }

  async function get(id) {
    if (!PREFS) return null;
    try {
      const { value } = await PREFS.get({ key: PREFIX + id });
      return value ? JSON.parse(value) : null;
    } catch { return null; }
  }
  function set(id, data) {
    return enqueue(async () => {
      if (!PREFS) return;
      await PREFS.set({ key: PREFIX + id, value: JSON.stringify(data) });
      const ids = await loadIds();
      if (!ids.has(id)) { ids.add(id); await saveIds(); }
    });
  }
  function del(id) {
    return enqueue(async () => {
      if (!PREFS) return;
      await PREFS.remove({ key: PREFIX + id });
      const ids = await loadIds();
      if (ids.has(id)) { ids.delete(id); await saveIds(); }
    });
  }
  async function list() {
    const ids = await loadIds();
    return [...ids];
  }
  async function loadAll() {
    const ids = await loadIds();
    const out = {};
    for (const id of ids) {
      const v = await get(id);
      if (v != null) out[id] = v;
    }
    return out;
  }

  window.Storage = { get, set, delete: del, list, loadAll, available: !!PREFS };
})();
