// Obrazovky před vstupem do appky: přihlášení, "Nemáte přístup" a nabídka
// nahrát položky, které na telefonu byly před sdílením.
// Není to trasa routeru, vykresluje je js/app.js podle stavu z js/auth.js.

import * as auth from '../auth.js';
import { escapeHtml, itemsCount } from '../ui.js';

export const TITLES = {
  loading: 'Domácnost',
  signedOut: 'Přihlášení',
  unverified: 'Domácnost',
  denied: 'Nemáte přístup',
  import: 'Společný seznam',
};

export function render(el, state) {
  const root = document.createElement('div');
  el.append(root);
  ({ signedOut: login, unverified, denied, import: importOffer }[state.status] ?? loading)(root, state);
}

function loading(root) {
  root.innerHTML = '<p class="hint">Načítám…</p>';
}

function login(root) {
  // Registrace tu záměrně není, účty se zakládají ručně v Supabase
  root.innerHTML = `
    <form class="card login-form">
      <label class="field"><span>E-mail</span>
        <input class="input" type="email" name="email" autocomplete="username" inputmode="email"
          autocapitalize="none" autocorrect="off" spellcheck="false" required>
      </label>
      <label class="field"><span>Heslo</span>
        <input class="input" type="password" name="password" autocomplete="current-password" required>
      </label>
      <p class="form-error" role="alert" hidden></p>
      <button type="submit" class="btn btn-primary btn-block">Přihlásit</button>
    </form>
    <p class="hint">Přihlášení na tomto telefonu vydrží, dokud se sami neodhlásíte.</p>`;

  const form = root.querySelector('form');
  const errorEl = root.querySelector('.form-error');
  const button = form.querySelector('button');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorEl.hidden = true;
    button.disabled = true;
    button.textContent = 'Přihlašuji…';
    try {
      await auth.signIn(form.elements.email.value, form.elements.password.value);
    } catch (err) {
      errorEl.textContent = err.message;
      errorEl.hidden = false;
      button.disabled = false;
      button.textContent = 'Přihlásit';
    }
  });
}

function actions(root, onRetry) {
  root.addEventListener('click', async (e) => {
    const action = e.target.closest('[data-action]')?.dataset.action;
    if (!action) return;
    e.target.closest('button').disabled = true;
    if (action === 'retry') await onRetry();
    if (action === 'signout') await auth.signOut({ force: true });
    root.querySelectorAll('button').forEach((b) => { b.disabled = false; });
  });
}

function denied(root, state) {
  root.innerHTML = `
    <section class="card">
      <h2 class="card-title">Nemáte přístup</h2>
      <p class="card-meta">Účet ${escapeHtml(state.email ?? '')} není členem této domácnosti.</p>
      <div class="btn-row">
        <button type="button" class="btn" data-action="retry">Zkusit znovu</button>
        <button type="button" class="btn" data-action="signout">Odhlásit</button>
      </div>
    </section>`;
  actions(root, () => auth.verify());
}

function unverified(root) {
  root.innerHTML = `
    <section class="card">
      <h2 class="card-title">Nejde ověřit přístup</h2>
      <p class="card-meta">Při prvním přihlášení je potřeba připojení k internetu. Zkontrolujte ho a zkuste to znovu.</p>
      <div class="btn-row">
        <button type="button" class="btn btn-primary" data-action="retry">Zkusit znovu</button>
        <button type="button" class="btn" data-action="signout">Odhlásit</button>
      </div>
    </section>`;
  actions(root, () => auth.verify());
}

function importOffer(root, state) {
  const what = state.localCount
    ? `${itemsCount(state.localCount)} nákupu a zapamatované často kupované věci`
    : 'zapamatované často kupované věci';
  root.innerHTML = `
    <section class="card">
      <h2 class="card-title">Nahrát věci z tohoto telefonu?</h2>
      <p class="card-meta">Na telefonu zůstalo z doby před sdílením: ${what}.
        Můžete je přidat do společného seznamu, uvidí je pak oba.</p>
      <p class="form-error" role="alert" hidden></p>
      <div class="btn-row">
        <button type="button" class="btn btn-primary" data-import="yes">Nahrát do společného</button>
        <button type="button" class="btn" data-import="no">Nenahrávat</button>
      </div>
      <p class="card-meta small">Nenahrávat znamená, že se z tohoto telefonu smažou. Ptáme se jen jednou.</p>
    </section>`;

  const errorEl = root.querySelector('.form-error');
  root.addEventListener('click', async (e) => {
    const choice = e.target.closest('[data-import]')?.dataset.import;
    if (!choice) return;
    const buttons = root.querySelectorAll('button');
    buttons.forEach((b) => { b.disabled = true; });
    errorEl.hidden = true;
    try {
      await auth.resolveImport(choice === 'yes');
    } catch (err) {
      console.error(err);
      errorEl.textContent = 'Nahrání se nepovedlo. Zkontrolujte připojení a zkuste to znovu.';
      errorEl.hidden = false;
      buttons.forEach((b) => { b.disabled = false; });
    }
  });
}
