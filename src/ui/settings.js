// Settings dialog: own accounts, investment accounts, category-by-account rules and currency
// rates, edited as plain text; rules file import, export and reset; the list of imported files.
// Saving hands a new rules JSON to the app, which stores it and re-classifies every stored row.

import { el, clear } from './dom.js';
import { saveText, pickTextFile } from './download.js';
import * as i18n from '../i18n/index.js';
import { Rules } from '../classifier/rules.js';
import {
  parseAccountLines, formatAccountLines, parseCategoryAccountLines, formatCategoryAccountLines,
  parseFxLines, formatFxLines, withSections, parseRulesJson,
} from '../settings-model.js';

const clone = (v) => JSON.parse(JSON.stringify(v));

function field(id, label, help, value, rows = 4) {
  const wrap = el('div', 'field');
  const l = el('label', null, label);
  l.htmlFor = id;
  wrap.appendChild(l);
  wrap.appendChild(el('p', 'hint', help));
  const ta = document.createElement('textarea');
  ta.id = id;
  ta.rows = rows;
  ta.spellcheck = false;
  ta.value = value;
  wrap.appendChild(ta);
  return wrap;
}

/**
 * @param {{
 *   getState: () => Promise<{rulesJson: object, defaults: object, imports: object[], remember?: boolean}>,
 *   onSave: (rulesJson: object) => Promise<void>,
 *   onForget?: () => Promise<void>,
 *   onRememberChange?: (remember: boolean) => Promise<boolean>,
 * }} deps
 */
export function setupSettings({ getState, onSave, onForget, onRememberChange }) {
  const dialog = document.getElementById('settings');

  async function render(message = '') {
    const { rulesJson, defaults, imports, remember } = await getState();
    const categories = Rules.from(rulesJson).categoryNames.filter((c) => c !== 'Other');
    const box = clear(dialog);

    const head = el('div', 'card-head');
    const title = el('h2', null, i18n.t('settings.title'));
    title.id = 'settingsTitle';
    head.appendChild(title);
    const x = el('button', 'btn', '×');
    x.type = 'button';
    x.setAttribute('aria-label', i18n.t('settings.close'));
    x.addEventListener('click', () => dialog.close());
    head.appendChild(x);
    box.appendChild(head);
    box.appendChild(el('p', 'hint privacy', i18n.t('settings.privacy')));

    const form = el('div', 'settings-form');
    form.appendChild(field('setOwn', i18n.t('settings.own'), i18n.t('settings.ownHelp'), formatAccountLines(rulesJson.own_accounts)));
    form.appendChild(field('setInvest', i18n.t('settings.invest'), i18n.t('settings.investHelp'), formatAccountLines(rulesJson.investment_accounts)));
    form.appendChild(field('setCatAcct', i18n.t('settings.catAcct'), i18n.t('settings.catAcctHelp', { categories: categories.join(', ') }), formatCategoryAccountLines(rulesJson.category_accounts)));
    form.appendChild(field('setFx', i18n.t('settings.fx'), i18n.t('settings.fxHelp'), formatFxLines(rulesJson.fx_rates_to_czk), 3));
    box.appendChild(form);

    const status = el('p', 'status', message);
    status.id = 'settingsStatus';
    status.setAttribute('role', 'status');
    const actions = el('div', 'actions');
    const save = el('button', 'btn primary', i18n.t('settings.save'));
    save.type = 'button';
    save.id = 'settingsSave';
    save.addEventListener('click', async () => {
      try {
        const next = withSections(rulesJson, {
          own_accounts: parseAccountLines(dialog.querySelector('#setOwn').value),
          investment_accounts: parseAccountLines(dialog.querySelector('#setInvest').value),
          category_accounts: parseCategoryAccountLines(dialog.querySelector('#setCatAcct').value, categories),
          fx_rates_to_czk: parseFxLines(dialog.querySelector('#setFx').value),
        });
        await onSave(next);
        await render(i18n.t('settings.saved'));
      } catch (e) {
        status.textContent = i18n.t('settings.notSaved', { error: e && e.message ? e.message : e });
        status.className = 'status warn';
      }
    });
    actions.appendChild(save);
    actions.appendChild(status);
    box.appendChild(actions);

    const rulesBox = el('div', 'settings-section');
    rulesBox.appendChild(el('h3', null, i18n.t('settings.rulesTitle')));
    rulesBox.appendChild(el('p', 'hint', i18n.t('settings.rulesHelp')));
    const ra = el('div', 'actions');
    const exp = el('button', 'btn', i18n.t('settings.export'));
    exp.type = 'button';
    exp.addEventListener('click', () => saveText('rules.json', JSON.stringify(rulesJson, null, 2) + '\n'));
    const imp = el('button', 'btn', i18n.t('settings.import'));
    imp.type = 'button';
    imp.addEventListener('click', async () => {
      const text = await pickTextFile();
      if (text === null) return;
      try { await onSave(parseRulesJson(text)); await render(i18n.t('settings.imported')); }
      catch (e) { await render(i18n.t('settings.importFailed', { error: e && e.message ? e.message : e })); }
    });
    const reset = el('button', 'btn', i18n.t('settings.reset'));
    reset.type = 'button';
    reset.addEventListener('click', async () => {
      if (!confirm(i18n.t('settings.resetConfirm'))) return;
      await onSave(clone(defaults));
      await render(i18n.t('settings.resetDone'));
    });
    ra.appendChild(exp); ra.appendChild(imp); ra.appendChild(reset);
    rulesBox.appendChild(ra);
    box.appendChild(rulesBox);

    const files = el('div', 'settings-section');
    files.appendChild(el('h3', null, i18n.t('settings.filesTitle')));
    if (!imports.length) files.appendChild(el('p', 'hint', i18n.t('settings.filesNone')));
    else {
      const ul = el('ul', 'imports');
      for (const i of imports) ul.appendChild(el('li', null, i18n.t('settings.fileLine', { file: i.file, bank: i.bank, added: i.added, rows: i.rows, date: String(i.at || '').slice(0, 10) })));
      files.appendChild(ul);
    }
    box.appendChild(files);

    if (onForget) {
      const danger = el('div', 'settings-section');
      danger.appendChild(el('h3', null, i18n.t('settings.dataTitle')));
      if (onRememberChange) {
        const label = el('label', 'switch');
        const box = document.createElement('input');
        box.type = 'checkbox';
        box.id = 'noRemember';
        box.checked = !remember;
        label.appendChild(box);
        label.appendChild(el('span', null, i18n.t('settings.remember')));
        box.addEventListener('change', async () => {
          if (box.checked && !confirm(i18n.t('settings.rememberOffConfirm'))) { box.checked = false; return; }
          box.disabled = true;
          if (!(await onRememberChange(!box.checked))) box.checked = !box.checked;
          await render();
        });
        danger.appendChild(label);
        danger.appendChild(el('p', 'hint', i18n.t('settings.rememberHelp')));
      }
      danger.appendChild(el('p', 'hint', i18n.t('settings.dataHelp')));
      const forget = el('button', 'btn danger', i18n.t('settings.forget'));
      forget.type = 'button';
      forget.id = 'forgetBtn';
      forget.addEventListener('click', async () => {
        if (!confirm(i18n.t('settings.forgetConfirm'))) return;
        await onForget();
        dialog.close();
      });
      danger.appendChild(forget);
      box.appendChild(danger);
    }
  }

  async function open() {
    await render();
    if (!dialog.open) dialog.showModal();
  }

  document.getElementById('settingsBtn').addEventListener('click', open);
  return { open, render };
}
