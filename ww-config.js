export default {
  editor: {
    label: { en: 'Vacation Account Widget', de: 'Ferienkonto-Widget' },
    icon:  'calendar',
  },
  triggerEvents: [
    { name: 'loaded', label: { en: 'On loaded', de: 'Geladen' }, event: { remaining: 0 } },
    { name: 'saved',  label: { en: 'On saved',  de: 'Gespeichert' }, event: { manually_used: 0 } },
    { name: 'error',  label: { en: 'On error',  de: 'Fehler'      }, event: { reason: '' } },
  ],
  properties: {
    authToken: {
      label: { en: 'Auth token (JWT)', de: 'Login-Token (JWT)' },
      type: 'Text', section: 'settings', bindable: true, defaultValue: '',
      /* wwEditor:start */
      bindingValidation: { type: 'string', tooltip: 'Access Token des eingeloggten Users.' },
      /* wwEditor:end */
    },
    apiKey: {
      label: { en: 'Anon / Publishable key', de: 'Anon-/Publishable-Key' },
      type: 'Text', section: 'settings', bindable: true, defaultValue: '',
      /* wwEditor:start */
      bindingValidation: { type: 'string', tooltip: 'Öffentlicher Anon-/Publishable-Key. NIE der service_role-Key.' },
      /* wwEditor:end */
    },
    supabaseUrl: {
      label: { en: 'Supabase URL', de: 'Supabase-URL' },
      type: 'Text', section: 'settings', bindable: true,
      defaultValue: 'https://ztvqsxdudzdyqgeylujr.supabase.co',
      /* wwEditor:start */
      bindingValidation: { type: 'string', tooltip: 'Projekt-URL. Default ist das Imploya-Projekt (Zürich).' },
      /* wwEditor:end */
    },
    employeeId: {
      label: { en: 'Employee UUID', de: 'Mitarbeiter-UUID' },
      type: 'Text', section: 'settings', bindable: true, defaultValue: '',
      /* wwEditor:start */
      bindingValidation: { type: 'string', tooltip: 'UUID des Mitarbeiters. Pflichtfeld.' },
      /* wwEditor:end */
    },
    year: {
      label: { en: 'Year (0 = current)', de: 'Jahr (0 = aktuell)' },
      type: 'Number', section: 'settings', bindable: true, defaultValue: 0,
      /* wwEditor:start */
      bindingValidation: { type: 'number', tooltip: '0 = aktuelles Jahr. Oder konkrete Jahreszahl z. B. 2026.' },
      /* wwEditor:end */
    },
    showEdit: {
      label: { en: 'Show edit button', de: 'Bearbeiten-Button anzeigen' },
      type: 'OnOff', section: 'settings', defaultValue: true,
    },
  },
};
