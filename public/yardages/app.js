(function () {
  'use strict';

  var Store = window.YardagesStore;
  var root = document.getElementById('app');
  var state = Store.load();

  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    attrs = attrs || {};
    Object.keys(attrs).forEach(function (key) {
      if (key === 'className') node.className = attrs[key];
      else if (key === 'text') node.textContent = attrs[key];
      else if (key.indexOf('on') === 0 && typeof attrs[key] === 'function') {
        node.addEventListener(key.slice(2).toLowerCase(), attrs[key]);
      } else if (attrs[key] != null) {
        node.setAttribute(key, attrs[key]);
      }
    });
    (children || []).forEach(function (child) {
      if (child) node.appendChild(child);
    });
    return node;
  }

  function persist(next) {
    state = next;
    Store.save(null, state);
    paintMeta();
    flashSaved();
  }

  function flashSaved() {
    var status = document.getElementById('save-status');
    if (!status) return;
    status.textContent = 'Saved on this phone';
    window.clearTimeout(flashSaved.tid);
    flashSaved.tid = window.setTimeout(function () {
      status.textContent = '';
    }, 1400);
  }

  function paintMeta() {
    var updated = document.getElementById('updated');
    if (!updated) return;
    if (!state.updatedAt || !Store.hasAnyYards(state)) {
      updated.textContent = 'Nothing saved yet — numbers stay on this phone.';
      return;
    }
    updated.textContent = 'Updated ' + Store.formatUpdatedAt(state.updatedAt);
  }

  function inputFor(club, field, label) {
    var value = state.clubs[club.id][field];
    var input = el('input', {
      type: 'number',
      inputmode: 'numeric',
      min: '0',
      max: '999',
      step: '1',
      autocomplete: 'off',
      enterkeyhint: 'next',
      id: club.id + '-' + field,
      name: club.id + '-' + field,
      'aria-label': club.name + ' ' + label,
      value: value,
    });
    if (!value) input.value = '';
    input.addEventListener('input', function () {
      persist(Store.setField(state, club.id, field, input.value));
    });
    input.addEventListener('change', function () {
      var next = Store.setField(state, club.id, field, input.value);
      persist(next);
      input.value = next.clubs[club.id][field];
    });
    return input;
  }

  function field(club, fieldName, shortLabel) {
    var labelText = Store.FIELD_LABELS[fieldName];
    return el('div', { className: 'field' }, [
      el('label', { for: club.id + '-' + fieldName, text: shortLabel }),
      inputFor(club, fieldName, labelText),
    ]);
  }

  function clubCard(club) {
    return el('article', { className: 'club', 'data-club': club.id }, [
      el('div', { className: 'club-head' }, [
        el('div', { className: 'club-name', text: club.name }),
        el('button', {
          type: 'button',
          className: 'btn btn-reset',
          text: 'Reset club',
          'aria-label': 'Reset ' + club.name,
          onclick: function () {
            if (!window.confirm('Clear ' + club.name + ' distances?')) return;
            persist(Store.resetClub(state, club.id));
            var card = root.querySelector('[data-club="' + club.id + '"]');
            if (!card) return;
            card.querySelectorAll('input').forEach(function (input) {
              input.value = '';
            });
          },
        }),
      ]),
      el('div', { className: 'grid' }, [
        el('div', { className: 'swing' }, [
          el('span', { className: 'swing-label', text: 'Full' }),
          field(club, 'fullCarry', 'Carry'),
          field(club, 'fullTotal', 'Total'),
        ]),
        el('div', { className: 'swing' }, [
          el('span', { className: 'swing-label', text: '¾' }),
          field(club, 'threeQuarterCarry', 'Carry'),
          field(club, 'threeQuarterTotal', 'Total'),
        ]),
      ]),
    ]);
  }

  function render() {
    root.replaceChildren();
    root.appendChild(el('header', { className: 'top' }, [
      el('div', { className: 'brand' }, [
        el('h1', { text: 'ColdGin’s Yardages' }),
      ]),
      el('p', { className: 'sub', text: 'Carry and total · Full and ¾' }),
      el('div', { className: 'meta' }, [
        el('p', { className: 'updated', id: 'updated' }),
        el('button', {
          type: 'button',
          className: 'btn btn-ghost',
          id: 'clear-all',
          text: 'Clear all',
          onclick: function () {
            if (!window.confirm('Clear every club? This cannot be undone.')) return;
            persist(Store.clearAll());
            render();
          },
        }),
      ]),
    ]));

    root.appendChild(el('p', {
      className: 'note',
      text: 'Club · Full Carry · Full Total · ¾ Carry · ¾ Total. Autosaves as you type.',
    }));
    root.appendChild(el('p', { className: 'status', id: 'save-status' }));

    Store.CLUBS.forEach(function (club) {
      root.appendChild(clubCard(club));
    });

    paintMeta();
  }

  render();
})();
