// Settings dialog: own accounts, investment accounts, category-by-account rules and currency
// rates, edited as plain text; rules file import, export and reset; the list of imported files.
// Saving hands a new rules JSON to the app, which stores it and re-classifies every stored row.

import { el, clear } from './dom.js';
import { saveText, pickTextFile } from './download.js';
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
 *   getState: () => Promise<{rulesJson: object, defaults: object, imports: object[]}>,
 *   onSave: (rulesJson: object) => Promise<void>,
 *   onForget?: () => Promise<void>,
 * }} deps
 */
export function setupSettings({ getState, onSave, onForget }) {
  const dialog = document.getElementById('settings');

  async function render(message = '') {
    const { rulesJson, defaults, imports } = await getState();
    const categories = Rules.from(rulesJson).categoryNames.filter((c) => c !== 'Other');
    const box = clear(dialog);

    const head = el('div', 'card-head');
    const title = el('h2', null, 'Settings');
    title.id = 'settingsTitle';
    head.appendChild(title);
    const x = el('button', 'btn', '×');
    x.type = 'button';
    x.setAttribute('aria-label', 'Close settings');
    x.addEventListener('click', () => dialog.close());
    head.appendChild(x);
    box.appendChild(head);
    box.appendChild(el('p', 'hint privacy', 'Everything on this page stays in this browser. Statements are read locally and nothing is uploaded anywhere.'));

    const form = el('div', 'settings-form');
    form.appendChild(field('setOwn', 'Your own accounts', 'One per line, optionally with a label, e.g. "FIO main: 2900000001/2010". Money moved between these is not spending.', formatAccountLines(rulesJson.own_accounts)));
    form.appendChild(field('setInvest', 'Investment accounts', 'Brokers, bond issuers, savings products. Payments to them count as investments, shown only when "Include investments" is on.', formatAccountLines(rulesJson.investment_accounts)));
    form.appendChild(field('setCatAcct', 'Category by counterparty account', `One category per line: "Housing & utilities: 4000000001/0100, 4000000002/0800". Wins over keywords. Categories: ${categories.join(', ')}.`, formatCategoryAccountLines(rulesJson.category_accounts)));
    form.appendChild(field('setFx', 'Currency rates to CZK', 'One per line, e.g. "EUR = 25". Foreign amounts are converted at these fixed rates.', formatFxLines(rulesJson.fx_rates_to_czk), 3));
    box.appendChild(form);

    const status = el('p', 'status', message);
    status.id = 'settingsStatus';
    status.setAttribute('role', 'status');
    const actions = el('div', 'actions');
    const save = el('button', 'btn primary', 'Save and re-classify');
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
        await render('Saved. All transactions were re-classified.');
      } catch (e) {
        status.textContent = 'Not saved: ' + (e && e.message ? e.message : e);
        status.className = 'status warn';
      }
    });
    actions.appendChild(save);
    actions.appendChild(status);
    box.appendChild(actions);

    const rulesBox = el('div', 'settings-section');
    rulesBox.appendChild(el('h3', null, 'Rules file'));
    rulesBox.appendChild(el('p', 'hint', 'Keywords per category, accounts and rates in one JSON file. Export it as a backup or to edit the keywords, import it on another computer.'));
    const ra = el('div', 'actions');
    const exp = el('button', 'btn', 'Export rules');
    exp.type = 'button';
    exp.addEventListener('click', () => saveText('rules.json', JSON.stringify(rulesJson, null, 2) + '\n'));
    const imp = el('button', 'btn', 'Import rules');
    imp.type = 'button';
    imp.addEventListener('click', async () => {
      const text = await pickTextFile();
      if (text === null) return;
      try { await onSave(parseRulesJson(text)); await render('Rules imported. All transactions were re-classified.'); }
      catch (e) { await render('Could not import: ' + (e && e.message ? e.message : e)); }
    });
    const reset = el('button', 'btn', 'Reset to defaults');
    reset.type = 'button';
    reset.addEventListener('click', async () => {
      if (!confirm('Replace your rules with the defaults? Your accounts and rates are removed too.')) return;
      await onSave(clone(defaults));
      await render('Rules reset to the defaults.');
    });
    ra.appendChild(exp); ra.appendChild(imp); ra.appendChild(reset);
    rulesBox.appendChild(ra);
    box.appendChild(rulesBox);

    const files = el('div', 'settings-section');
    files.appendChild(el('h3', null, 'Imported files'));
    if (!imports.length) files.appendChild(el('p', 'hint', 'Nothing imported yet.'));
    else {
      const ul = el('ul', 'imports');
      for (const i of imports) ul.appendChild(el('li', null, `${i.file} · ${i.bank} · ${i.added} new of ${i.rows} · ${String(i.at || '').slice(0, 10)}`));
      files.appendChild(ul);
    }
    box.appendChild(files);

    if (onForget) {
      const danger = el('div', 'settings-section');
      danger.appendChild(el('h3', null, 'Your data'));
      danger.appendChild(el('p', 'hint', 'Removes every imported transaction, your rules and your category choices from this browser. Theme and language stay.'));
      const forget = el('button', 'btn danger', 'Forget my data');
      forget.type = 'button';
      forget.id = 'forgetBtn';
      forget.addEventListener('click', async () => {
        if (!confirm('Remove all imported transactions, rules and category choices from this browser? This cannot be undone.')) return;
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
