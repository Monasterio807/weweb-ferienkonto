<template>
  <div class="hrk-root">
    <div class="fk-widget hrk-card">

      <!-- Header -->
      <div class="fk-header">
        <span class="fk-icon" aria-hidden="true">🏖️</span>
        <div>
          <h2 class="fk-title">Ferienkonto {{ displayYear }}</h2>
          <p v-if="data" class="hrk-small hrk-muted fk-subtitle">
            {{ data.employee_name }}
          </p>
        </div>
        <button
          v-if="showEdit && data && !editMode"
          type="button"
          class="hrk-btn hrk-btn--ghost fk-edit-btn"
          @click="startEdit"
        >Bearbeiten</button>
      </div>

      <!-- Laden -->
      <div v-if="loading" class="hrk-state hrk-state--mini">
        <div class="hrk-spinner" aria-hidden="true"></div>
        <p class="hrk-muted">Ferienkonto wird geladen …</p>
      </div>

      <!-- Auth-Fehler -->
      <div v-else-if="authError" class="hrk-note hrk-note--danger fk-note" role="alert">
        Bitte neu anmelden.
      </div>

      <!-- Noch kein Ferienkonto -->
      <div v-else-if="!data && !editMode" class="hrk-state hrk-state--mini">
        <p class="hrk-muted">Für diesen Mitarbeiter / dieses Jahr ist noch kein Ferienkonto angelegt.</p>
        <button
          v-if="showEdit"
          type="button"
          class="hrk-btn hrk-btn--secondary"
          @click="startCreate"
        >Ferienkonto anlegen</button>
      </div>

      <!-- Anzeige-Modus -->
      <template v-else-if="data && !editMode">
        <dl class="hrk-dl fk-dl">
          <div class="hrk-dl__row">
            <dt>Anspruch</dt>
            <dd>{{ fmt(data.total_entitlement) }} {{ unit }}</dd>
          </div>
          <div v-if="data.vacation_rate_percent" class="hrk-dl__row">
            <dt>Auto-angespart</dt>
            <dd>{{ fmt(data.auto_accrued) }} {{ unit }}</dd>
          </div>
          <div class="hrk-dl__row">
            <dt>Bezogen</dt>
            <dd>{{ fmt(data.manually_used) }} {{ unit }}</dd>
          </div>
          <div class="hrk-dl__row fk-row--remaining">
            <dt>Verbleibend</dt>
            <dd :class="remainingClass">{{ fmt(data.remaining) }} {{ unit }}</dd>
          </div>
        </dl>

        <!-- Fortschrittsbalken -->
        <div class="fk-progress-wrap" :title="progressPercent + '% bezogen'">
          <div class="fk-progress-bar">
            <div
              class="fk-progress-fill"
              :style="{ width: progressPercent + '%' }"
              :class="progressClass"
            ></div>
          </div>
          <span class="fk-progress-label hrk-small hrk-muted">{{ progressPercent }}% bezogen</span>
        </div>

        <!-- Notiz -->
        <p v-if="data.notes" class="hrk-small hrk-muted fk-notes">{{ data.notes }}</p>
      </template>

      <!-- Bearbeiten-Modus -->
      <form v-else-if="editMode" class="fk-edit-form" @submit.prevent="save" novalidate>
        <div class="hrk-field">
          <label class="hrk-label" for="fk-type">Typ</label>
          <select id="fk-type" class="hrk-select" v-model="form.balance_type">
            <option value="days">Tage</option>
            <option value="hours">Stunden</option>
          </select>
        </div>

        <div class="hrk-field">
          <label class="hrk-label" for="fk-entitlement">Anspruch ({{ form.balance_type === 'days' ? 'Tage' : 'Stunden' }})</label>
          <input id="fk-entitlement" class="hrk-input" type="number" min="0" max="999" step="0.5"
            v-model.number="form.total_entitlement" required />
        </div>

        <div class="hrk-field">
          <label class="hrk-label" for="fk-used">Bezogen / verbraucht</label>
          <input id="fk-used" class="hrk-input" type="number" min="0" max="999" step="0.5"
            v-model.number="form.manually_used" />
          <p class="hrk-hint">Manuell erfasste Ferientage oder -stunden.</p>
        </div>

        <div class="hrk-field">
          <label class="hrk-label" for="fk-rate">Ferienlohn-Anteil % (optional, nur Stundenlöhner)</label>
          <input id="fk-rate" class="hrk-input" type="number" min="0" max="30" step="0.01"
            placeholder="z.B. 8.33"
            v-model="form.vacation_rate_percent" />
          <p class="hrk-hint">Leer lassen für Monatslöhner.</p>
        </div>

        <div class="hrk-field">
          <label class="hrk-label" for="fk-notes">Notiz (optional)</label>
          <input id="fk-notes" class="hrk-input" type="text" maxlength="300" v-model="form.notes" />
        </div>

        <div v-if="saveError" class="hrk-note hrk-note--danger fk-note" role="alert">{{ saveError }}</div>

        <div class="fk-edit-actions hrk-actions">
          <button type="submit" class="hrk-btn hrk-btn--primary" :disabled="saving">
            {{ saving ? 'Speichern …' : 'Speichern' }}
          </button>
          <button type="button" class="hrk-btn hrk-btn--secondary" @click="cancelEdit" :disabled="saving">
            Abbrechen
          </button>
        </div>
      </form>

    </div>
  </div>
</template>

<script>
/**
 * WeWeb Coded Component — Ferienkonto-Widget (Imploya)
 *
 * Zeigt pro Mitarbeiter/Jahr: Anspruch, bezogene Tage/Stunden,
 * Verbleibendes und einen Fortschrittsbalken. Unterstützt Edit-Modus
 * für manuelle Erfassung. Liest aus vacation_summary-View und
 * schreibt in vacation_balances-Tabelle.
 *
 * Backend: vacation_balances + vacation_summary (Migration 2026-06-22).
 * Nur Anon-Key + User-JWT — RLS schützt die Daten.
 */
export default {
  props: {
    content: { type: Object, required: true },
    uid:     { type: String, required: false, default: '' },
    /* wwEditor:start */
    wwEditorState: { type: Object, required: false, default: () => ({}) },
    /* wwEditor:end */
  },
  emits: ['trigger-event'],

  data() {
    return {
      loading:   false,
      authError: false,
      data:      null,       // Zeile aus vacation_summary
      editMode:  false,
      creating:  false,      // true wenn neues Konto angelegt wird
      saving:    false,
      saveError: '',
      form: {
        balance_type:          'days',
        total_entitlement:     0,
        manually_used:         0,
        vacation_rate_percent: '',
        notes:                 '',
      },
    };
  },

  computed: {
    baseUrl() {
      let __sbBase = String((this.content && this.content.supabaseUrl) || '').replace(/\/+$/, '');
      if (/nemxnflngcfrpamkuesm/.test(String(__sbBase))) __sbBase = '';
      return __sbBase;
    },
    authHeaders() {
      const key   = (this.content && this.content.apiKey) || '';
      const token = String((this.content && this.content.authToken) || '');
      const bearer = token.startsWith('Bearer ') ? token : `Bearer ${token}`;
      return { apikey: key, Authorization: bearer };
    },
    displayYear() {
      const y = this.content && this.content.year;
      return (y && y > 2000) ? y : new Date().getFullYear();
    },
    showEdit() {
      return !!(this.content && this.content.showEdit !== false);
    },
    unit() {
      return (this.data && this.data.balance_type === 'hours') ? 'Std.' : 'Tage';
    },
    usedValue() {
      if (!this.data) return 0;
      if (this.data.vacation_rate_percent) {
        // Stundenlöhner: auto-angespart
        return Number(this.data.auto_accrued) || 0;
      }
      return Number(this.data.manually_used) || 0;
    },
    totalValue() {
      return Number((this.data && this.data.total_entitlement) || 0);
    },
    progressPercent() {
      if (!this.totalValue) return 0;
      return Math.min(100, Math.round((this.usedValue / this.totalValue) * 100));
    },
    progressClass() {
      const p = this.progressPercent;
      if (p >= 90) return 'fk-fill--danger';
      if (p >= 70) return 'fk-fill--warning';
      return 'fk-fill--ok';
    },
    remainingClass() {
      const rem = Number((this.data && this.data.remaining) || 0);
      if (rem < 0) return 'fk-remaining--danger';
      if (rem <= 5 && this.data && this.data.balance_type === 'days') return 'fk-remaining--warning';
      return '';
    },
  },

  watch: {
    'content.authToken'()   { this.load(); },
    'content.employeeId'()  { this.load(); },
    'content.year'()        { this.load(); },
  },

  mounted() { this.load(); },

  methods: {
    async fetchWithTimeout(url, options, ms) {
      const timeout = ms || 10000;
      const ac = typeof AbortController !== 'undefined' ? new AbortController() : null;
      const timer = ac ? setTimeout(() => ac.abort(), timeout) : null;
      try { return await fetch(url, ac ? { ...options, signal: ac.signal } : options); }
      finally { if (timer) clearTimeout(timer); }
    },
    emit(name, payload) { this.$emit('trigger-event', { name, event: payload || {} }); },

    fmt(val) {
      const n = Number(val);
      if (!isFinite(n)) return '—';
      return n % 1 === 0 ? String(n) : n.toFixed(1);
    },

    // ── Laden ────────────────────────────────────────────────────
    async load() {
      this.authError = false;
      const empId = String((this.content && this.content.employeeId) || '').trim();
      if (!empId) { this.data = null; return; }
      if (!(this.content && this.content.apiKey) || !(this.content && this.content.authToken)) {
        this.authError = true; return;
      }

      this.loading = true;
      this.data = null;
      try {
        const url = `${this.baseUrl}/rest/v1/vacation_summary`
          + `?employee_id=eq.${encodeURIComponent(empId)}`
          + `&year=eq.${this.displayYear}`
          + `&limit=1`;
        const res = await this.fetchWithTimeout(url, { headers: { ...this.authHeaders, Accept: 'application/json' } });
        if (res.status === 401 || res.status === 403) { this.authError = true; return; }
        if (!res.ok) {
          // View existiert eventuell noch nicht — graceful degradation
          this.emit('error', { reason: 'load' });
          return;
        }
        const rows = await res.json().catch(() => []);
        this.data = (Array.isArray(rows) && rows.length) ? rows[0] : null;
        if (this.data) this.emit('loaded', { remaining: Number(this.data.remaining) || 0 });
      } catch (e) {
        this.emit('error', { reason: 'network' });
      } finally {
        this.loading = false;
      }
    },

    // ── Bearbeiten ───────────────────────────────────────────────
    startEdit() {
      if (!this.data) return;
      this.form = {
        balance_type:          this.data.balance_type          || 'days',
        total_entitlement:     this.data.total_entitlement      || 0,
        manually_used:         this.data.manually_used          || 0,
        vacation_rate_percent: this.data.vacation_rate_percent  != null
          ? String(this.data.vacation_rate_percent)
          : '',
        notes:                 this.data.notes || '',
      };
      this.creating  = false;
      this.saveError = '';
      this.editMode  = true;
    },
    startCreate() {
      this.form = {
        balance_type: 'days', total_entitlement: 25,
        manually_used: 0, vacation_rate_percent: '', notes: '',
      };
      this.creating  = true;
      this.saveError = '';
      this.editMode  = true;
    },
    cancelEdit() {
      this.editMode  = false;
      this.creating  = false;
      this.saveError = '';
    },

    async save() {
      const empId = String((this.content && this.content.employeeId) || '').trim();
      if (!empId) { this.saveError = 'Kein Mitarbeiter ausgewählt.'; return; }

      this.saving    = true;
      this.saveError = '';

      const payload = {
        employee_id:           empId,
        year:                  this.displayYear,
        balance_type:          this.form.balance_type,
        total_entitlement:     Number(this.form.total_entitlement) || 0,
        manually_used:         Number(this.form.manually_used)     || 0,
        vacation_rate_percent: this.form.vacation_rate_percent !== ''
          ? Number(this.form.vacation_rate_percent)
          : null,
        notes: this.form.notes || null,
      };

      try {
        let res;
        if (this.creating || !this.data) {
          // Neu anlegen
          res = await this.fetchWithTimeout(
            `${this.baseUrl}/rest/v1/vacation_balances`,
            {
              method: 'POST',
              headers: { ...this.authHeaders, 'Content-Type': 'application/json', Prefer: 'return=representation' },
              body: JSON.stringify(payload),
            }
          );
        } else {
          // Aktualisieren
          res = await this.fetchWithTimeout(
            `${this.baseUrl}/rest/v1/vacation_balances?employee_id=eq.${encodeURIComponent(empId)}&year=eq.${this.displayYear}`,
            {
              method: 'PATCH',
              headers: { ...this.authHeaders, 'Content-Type': 'application/json', Prefer: 'return=representation' },
              body: JSON.stringify(payload),
            }
          );
        }

        if (res.status === 401 || res.status === 403) { this.authError = true; return; }
        if (!res.ok) {
          this.saveError = 'Speichern fehlgeschlagen. Bitte nochmal versuchen.';
          this.emit('error', { reason: 'save' });
          return;
        }

        this.editMode = false;
        this.creating = false;
        this.emit('saved', { manually_used: payload.manually_used });
        await this.load(); // Ansicht aktualisieren
      } catch (e) {
        this.saveError = 'Netzwerkfehler. Versuch es gleich nochmal.';
      } finally {
        this.saving = false;
      }
    },
  },
};
</script>

<style scoped>
/* ── Design-Tokens ── */
:root, .hrk-root {
  --hrk-bordeaux:       #7B2D3B;
  --hrk-bordeaux-dark:  #5E2129;
  --hrk-bordeaux-soft:  #F3E7E9;
  --hrk-creme:          #FBF8F3;
  --hrk-anthrazit:      #2B2B2B;
  --hrk-surface:        #FFFFFF;
  --hrk-surface-muted:  #F5F1EB;
  --hrk-border:         #ECE5D9;
  --hrk-border-strong:  #DAD2C6;
  --hrk-text:           #2B2B2B;
  --hrk-text-muted:     #6B6357;
  --hrk-success:        #2E7D5B; --hrk-success-bg: #E5F1EB;
  --hrk-warning:        #B7791F; --hrk-warning-bg: #FBF1DD;
  --hrk-danger:         #B23A48; --hrk-danger-bg:  #F8E7E9;
  --hrk-info:           #2F6F9F; --hrk-info-bg:    #E6F0F7;
  --hrk-font-body: "Inter", "Source Sans 3", system-ui, sans-serif;
  --hrk-font-head: "Fraunces", "Lora", Georgia, serif;
  --hrk-fs-h1: 1.9375rem;
  --hrk-fs-h2: 1.375rem;
  --hrk-fs-h3: 1.125rem;
  --hrk-fs-body:  1.0625rem;
  --hrk-fs-small: 0.9375rem;
  --hrk-lh-body: 1.55;
  --hrk-fw-regular: 400; --hrk-fw-medium: 500; --hrk-fw-semibold: 600;
  --hrk-space-1: 4px;  --hrk-space-2: 8px;  --hrk-space-3: 12px;
  --hrk-space-4: 16px; --hrk-space-5: 24px; --hrk-space-6: 32px;
  --hrk-space-7: 48px;
  --hrk-radius-sm: 8px; --hrk-radius-md: 12px; --hrk-radius-lg: 14px;
  --hrk-radius-pill: 999px;
  --hrk-shadow-card: 0 1px 2px rgba(40,35,30,.05);
  --hrk-focus-ring: 0 0 0 3px rgba(123,45,59,.30);
  --hrk-tap-min: 44px;
}

/* ── Basis ── */
.hrk-root, .hrk-root * { box-sizing: border-box; }
.hrk-root {
  font-family: var(--hrk-font-body); font-size: var(--hrk-fs-body);
  line-height: var(--hrk-lh-body); color: var(--hrk-text);
  background: transparent; -webkit-font-smoothing: antialiased;
}
.hrk-card {
  background: var(--hrk-surface); border: 1px solid var(--hrk-border);
  border-radius: var(--hrk-radius-lg); box-shadow: var(--hrk-shadow-card);
  padding: var(--hrk-space-5);
}
.hrk-state { display: flex; flex-direction: column; align-items: center; gap: var(--hrk-space-3); padding: var(--hrk-space-5) var(--hrk-space-4); color: var(--hrk-text-muted); text-align: center; }
.hrk-state--mini { padding: var(--hrk-space-4) var(--hrk-space-3); }
.hrk-spinner { width: 24px; height: 24px; border: 3px solid var(--hrk-border); border-top-color: var(--hrk-bordeaux); border-radius: 50%; animation: hrk-spin .8s linear infinite; }
@keyframes hrk-spin { to { transform: rotate(360deg); } }
.hrk-muted  { color: var(--hrk-text-muted); }
.hrk-small  { font-size: var(--hrk-fs-small); }
.hrk-btn {
  display: inline-flex; align-items: center; justify-content: center; gap: var(--hrk-space-2);
  min-height: var(--hrk-tap-min); padding: 0 var(--hrk-space-5);
  font: inherit; font-weight: var(--hrk-fw-semibold);
  border-radius: var(--hrk-radius-md); border: 1px solid transparent;
  cursor: pointer; text-decoration: none; transition: background .15s;
}
.hrk-btn:focus-visible { outline: none; box-shadow: var(--hrk-focus-ring); }
.hrk-btn--primary   { background: var(--hrk-bordeaux); color: var(--hrk-on-primary, #fff); }
.hrk-btn--primary:hover { background: var(--hrk-bordeaux-dark); }
.hrk-btn--secondary { background: var(--hrk-surface); color: var(--hrk-bordeaux); border-color: var(--hrk-border-strong); }
.hrk-btn--secondary:hover { background: var(--hrk-bordeaux-soft); }
.hrk-btn--ghost    { background: transparent; color: var(--hrk-bordeaux); }
.hrk-btn--ghost:hover { background: var(--hrk-bordeaux-soft); }
.hrk-btn[disabled] { opacity: .5; cursor: not-allowed; }
.hrk-field { display: block; margin-bottom: var(--hrk-space-4); }
.hrk-label { display: block; font-weight: var(--hrk-fw-medium); margin-bottom: var(--hrk-space-1); }
.hrk-hint  { color: var(--hrk-text-muted); font-size: var(--hrk-fs-small); margin-top: var(--hrk-space-1); }
.hrk-input, .hrk-select {
  width: 100%; min-height: var(--hrk-tap-min); padding: var(--hrk-space-3);
  font: inherit; color: var(--hrk-text); background: var(--hrk-surface);
  border: 1px solid var(--hrk-border); border-radius: var(--hrk-radius-sm);
}
.hrk-input:focus, .hrk-select:focus { outline: none; border-color: var(--hrk-bordeaux); box-shadow: var(--hrk-focus-ring); }
.hrk-dl { margin: 0; }
.hrk-dl__row { display: flex; align-items: baseline; justify-content: space-between; gap: var(--hrk-space-4); padding: var(--hrk-space-2) 0; border-bottom: 1px solid var(--hrk-border); }
.hrk-dl__row:last-child { border-bottom: 0; }
.hrk-dl dt { color: var(--hrk-text-muted); }
.hrk-dl dd { margin: 0; font-weight: var(--hrk-fw-semibold); font-variant-numeric: tabular-nums; }
.hrk-actions { display: flex; flex-wrap: wrap; gap: var(--hrk-space-3); }
.hrk-note { border-left: 4px solid var(--hrk-info); background: var(--hrk-info-bg); padding: var(--hrk-space-3) var(--hrk-space-4); border-radius: var(--hrk-radius-sm); }
.hrk-note--danger { border-left-color: var(--hrk-danger); background: var(--hrk-danger-bg); }

/* ── Ferienkonto spezifisch ── */
.fk-widget { /* kein Extra-Padding — hrk-card liefert alles */ }

.fk-header {
  display: flex;
  align-items: flex-start;
  gap: var(--hrk-space-3);
  margin-bottom: var(--hrk-space-4);
}
.fk-icon    { font-size: 1.5rem; flex: none; margin-top: 2px; }
.fk-title   {
  font-family: var(--hrk-font-head);
  font-size: var(--hrk-fs-h3);
  font-weight: var(--hrk-fw-semibold);
  color: var(--hrk-bordeaux);
  margin: 0;
  flex: 1;
}
.fk-subtitle { margin: 2px 0 0; }
.fk-edit-btn {
  flex: none;
  min-height: var(--hrk-tap-min);
  padding: 0 var(--hrk-space-3);
  font-size: var(--hrk-fs-small);
}

.fk-dl { margin-bottom: var(--hrk-space-4); }

.fk-row--remaining dd { font-size: var(--hrk-fs-h3); }
.fk-remaining--warning { color: var(--hrk-warning); }
.fk-remaining--danger  { color: var(--hrk-danger);  }

/* Fortschrittsbalken */
.fk-progress-wrap {
  display: flex;
  align-items: center;
  gap: var(--hrk-space-3);
  margin-bottom: var(--hrk-space-3);
}
.fk-progress-bar {
  flex: 1;
  height: 10px;
  background: var(--hrk-surface-muted);
  border-radius: var(--hrk-radius-pill);
  overflow: hidden;
}
.fk-progress-fill {
  height: 100%;
  border-radius: var(--hrk-radius-pill);
  transition: width .4s ease;
}
.fk-fill--ok      { background: var(--hrk-success); }
.fk-fill--warning { background: var(--hrk-warning); }
.fk-fill--danger  { background: var(--hrk-danger);  }
.fk-progress-label { white-space: nowrap; }

.fk-notes { margin-top: var(--hrk-space-2); font-style: italic; }

.fk-note   { margin-top: var(--hrk-space-3); }
.fk-edit-form { margin-top: var(--hrk-space-2); }
.fk-edit-actions { margin-top: var(--hrk-space-2); }

/* ── Responsive ── */
@media (max-width: 400px) {
  .fk-progress-wrap { flex-direction: column; align-items: flex-start; }
  .fk-progress-bar  { width: 100%; }
}
</style>
