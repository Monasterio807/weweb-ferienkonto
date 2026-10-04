// =============================================================================
// wwElement.test.mjs — Ladefehler und Speicherweg (ferienkonto)
//
// Eingebauter Node-Test-Runner, keine neuen Abhaengigkeiten:  npm test
// Der <script>-Block des SFC wird als ESM geladen, die Optionen laufen mit
// einem Fake-`this` (Aufbau wie coded-component-dokument-anzeigen).
//
// Cloud-Funde A1-03-010 (Ladefehler sah aus wie «kein Konto») und
// A1-03-011 (PATCH mit 0 Zeilen meldete Erfolg, 403 verwarf das Formular).
// =============================================================================
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const sfc = readFileSync(join(here, "..", "src", "wwElement.vue"), "utf8");

const scriptStart = sfc.indexOf("<script>");
const scriptEnd = sfc.indexOf("\n</script>");
assert.ok(scriptStart > -1 && scriptEnd > scriptStart, "Script-Block im SFC nicht gefunden");
const scriptSrc = sfc.slice(scriptStart + "<script>".length, scriptEnd);
const templateSrc = sfc.slice(sfc.indexOf("<template>"), scriptStart);

const dir = mkdtempSync(join(tmpdir(), "fk-test-"));
const modPath = join(dir, "wwElement.options.mjs");
writeFileSync(modPath, scriptSrc, "utf8");
const options = (await import(pathToFileURL(modPath).href)).default;

function makeVm(responder) {
  const vm = {
    ...options.data(),
    content: { authToken: "jwt-123", apiKey: "anon-key", supabaseUrl: "https://db.example.co", employeeId: "e1", year: 2026 },
    uid: "test",
    emitted: [],
    calls: [],
    $emit(name, payload) { this.emitted.push({ name, payload }); },
  };
  for (const [name, fn] of Object.entries(options.computed)) {
    Object.defineProperty(vm, name, { get: () => fn.call(vm), configurable: true });
  }
  for (const [name, fn] of Object.entries(options.methods)) {
    vm[name] = fn.bind(vm);
  }
  // Netzwerk ersetzen
  vm.authedFetch = async (url, opts) => { vm.calls.push({ url, opts }); return responder(url, opts); };
  return vm;
}

const resp = (status, body) => ({
  status,
  ok: status >= 200 && status < 300,
  json: async () => body,
});

// ─── A1-03-010: Ladefehler ───────────────────────────────────────────────────

test("Ladefehler: HTTP 500 setzt loadError, data bleibt null", async () => {
  const vm = makeVm(() => resp(500, { message: "boom" }));
  await vm.load();
  assert.equal(vm.loadError, true);
  assert.equal(vm.data, null);
  assert.equal(vm.loading, false);
});

test("Ladefehler: Netzfehler setzt loadError", async () => {
  const vm = makeVm(() => { throw new Error("offline"); });
  await vm.load();
  assert.equal(vm.loadError, true);
});

test("Ladefehler: leere Liste ist KEIN Fehler (echter Leerzustand)", async () => {
  const vm = makeVm(() => resp(200, []));
  await vm.load();
  assert.equal(vm.loadError, false);
  assert.equal(vm.data, null);
});

test("Ladefehler: erneutes Laden mit Erfolg raeumt den Fehler", async () => {
  let fail = true;
  const vm = makeVm(() => (fail ? resp(503, null) : resp(200, [{ remaining: 3, total_entitlement: 25 }])));
  await vm.load();
  assert.equal(vm.loadError, true);
  fail = false;
  await vm.load();
  assert.equal(vm.loadError, false);
  assert.equal(vm.data.remaining, 3);
});

test("Ladefehler: Template zeigt Fehlerblock vor dem Leerzustand, mit «Erneut versuchen»", () => {
  const iErr = templateSrc.indexOf('v-else-if="loadError"');
  const iEmpty = templateSrc.indexOf('v-else-if="!data && !editMode"');
  assert.ok(iErr > -1, "Fehlerblock fehlt");
  assert.ok(iErr < iEmpty, "Fehlerblock muss vor dem Leerzustand stehen");
  assert.match(templateSrc, /@click="load"[^>]*>Erneut versuchen</);
});

// ─── A1-03-011: Speichern ────────────────────────────────────────────────────

function editVm(responder) {
  const vm = makeVm(responder);
  vm.data = { balance_type: "days", total_entitlement: 25, manually_used: 2 };
  vm.startEdit();
  vm.form.manually_used = 9;
  return vm;
}

test("Speichern: PATCH mit 200 und [] meldet Fehler, kein 'saved', Formular bleibt offen", async () => {
  const vm = editVm(() => resp(200, []));
  await vm.save();
  assert.match(vm.saveError, /nicht gespeichert/);
  assert.equal(vm.editMode, true);
  assert.equal(vm.form.manually_used, 9);
  assert.equal(vm.emitted.some((e) => e.payload.name === "saved"), false);
});

test("Speichern: PATCH mit Zeile meldet Erfolg und laedt neu", async () => {
  const vm = editVm((url, opts) => (opts.method === "PATCH" ? resp(200, [{ id: 1 }]) : resp(200, [{ remaining: 1 }])));
  await vm.save();
  assert.equal(vm.saveError, "");
  assert.equal(vm.editMode, false);
  assert.equal(vm.emitted.some((e) => e.payload.name === "saved"), true);
});

test("Speichern: 403 ist kein Abmelde-Fall, Eingaben bleiben", async () => {
  const vm = editVm(() => resp(403, { message: "rls" }));
  await vm.save();
  assert.equal(vm.authError, false);
  assert.equal(vm.editMode, true);
  assert.equal(vm.form.manually_used, 9);
  assert.match(vm.saveError, /Berechtigung/);
});

test("Speichern: 401 bleibt Abmelde-Fall", async () => {
  const vm = editVm(() => resp(401, {}));
  await vm.save();
  assert.equal(vm.authError, true);
});

test("Speichern: Neu anlegen (POST) mit Zeile klappt weiter", async () => {
  const vm = makeVm((url, opts) => (opts.method === "POST" ? resp(201, [{ id: 7 }]) : resp(200, [])));
  vm.startCreate();
  await vm.save();
  assert.equal(vm.saveError, "");
  assert.equal(vm.editMode, false);
});
