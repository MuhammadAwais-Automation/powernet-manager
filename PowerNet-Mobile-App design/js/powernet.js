(function () {
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

  function showToast(message) {
    const toast = $('[data-toast]');
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add('is-visible');
    window.clearTimeout(showToast.timer);
    showToast.timer = window.setTimeout(() => toast.classList.remove('is-visible'), 2400);
  }

  $$('[data-toggle]').forEach((button) => {
    button.addEventListener('click', () => {
      const next = button.getAttribute('aria-pressed') !== 'true';
      button.setAttribute('aria-pressed', String(next));
      showToast(next ? 'Saved for this device' : 'Turned off');
    });
  });

  $$('[data-open-sheet]').forEach((button) => {
    button.addEventListener('click', () => {
      const sheet = document.getElementById(button.dataset.openSheet);
      if (sheet) sheet.classList.add('is-open');
    });
  });

  $$('[data-close-sheet]').forEach((button) => {
    button.addEventListener('click', () => {
      const sheet = button.closest('.sheet-backdrop');
      if (sheet) sheet.classList.remove('is-open');
    });
  });

  $$('.sheet-backdrop').forEach((backdrop) => {
    backdrop.addEventListener('click', (event) => {
      if (event.target === backdrop) backdrop.classList.remove('is-open');
    });
  });

  $$('[data-tabs]').forEach((tabs) => {
    const buttons = $$('[data-tab]', tabs);
    const panels = buttons.map((button) => document.getElementById(button.dataset.tab)).filter(Boolean);
    buttons.forEach((button) => {
      button.addEventListener('click', () => {
        buttons.forEach((item) => item.classList.toggle('is-active', item === button));
        panels.forEach((panel) => panel.classList.toggle('is-active', panel.id === button.dataset.tab));
      });
    });
  });

  $$('[data-stepper]').forEach((stepper) => {
    const scope = stepper.closest('[data-flow]') || document;
    const buttons = $$('[data-step]', stepper);
    const panels = $$('[data-step-panel]', scope);
    buttons.forEach((button) => {
      button.addEventListener('click', () => {
        buttons.forEach((item) => item.classList.toggle('is-active', item === button));
        panels.forEach((panel) => panel.classList.toggle('is-active', panel.dataset.stepPanel === button.dataset.step));
      });
    });
  });

  $$('[data-next-step]').forEach((button) => {
    button.addEventListener('click', () => {
      const flow = button.closest('[data-flow]');
      if (!flow) return;
      const active = $('[data-stepper] .is-active', flow);
      const buttons = $$('[data-stepper] [data-step]', flow);
      const index = buttons.indexOf(active);
      const next = buttons[Math.min(index + 1, buttons.length - 1)];
      if (next) next.click();
    });
  });

  $$('[data-submit]').forEach((button) => {
    button.addEventListener('click', () => {
      const message = button.dataset.submit || 'Saved';
      const target = button.dataset.show;
      if (target) {
        const targetNode = document.getElementById(target);
        if (targetNode) targetNode.classList.add('is-visible');
      }
      const sheet = button.closest('.sheet-backdrop');
      if (sheet && !target) sheet.classList.remove('is-open');
      showToast(message);
    });
  });

  $$('[data-login-error]').forEach((button) => {
    button.addEventListener('click', () => {
      const alert = $('[data-error-card]');
      if (alert) alert.classList.add('is-visible');
      showToast('Check username and password');
    });
  });

  $$('[data-package]').forEach((card) => {
    card.addEventListener('click', () => {
      $$('[data-package]').forEach((item) => item.classList.toggle('is-selected', item === card));
      showToast(`${card.dataset.package} selected`);
    });
  });

  const search = $('[data-search]');
  if (search) {
    search.addEventListener('input', () => {
      const value = search.value.trim().toLowerCase();
      $$('[data-filter-item]').forEach((item) => {
        item.hidden = value && !item.textContent.toLowerCase().includes(value);
      });
    });
  }

  $$('[data-state]').forEach((button) => {
    button.addEventListener('click', () => {
      const target = document.getElementById(button.dataset.state);
      if (!target) return;
      const status = button.dataset.status || 'Updated';
      target.textContent = status;
      target.className = button.dataset.class || target.className;
      showToast(status);
    });
  });
})();
