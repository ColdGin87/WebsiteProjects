(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.YardagesStore = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var STORAGE_KEY = 'coldgin_yardages_v1';

  var CLUBS = [
    { id: 'driver', name: 'Driver' },
    { id: 'wood5', name: '5-wood' },
    { id: 'hybrid19', name: '19° hybrid' },
    { id: 'hybrid22', name: '22° hybrid' },
    { id: 'iron6', name: '6-iron' },
    { id: 'iron7', name: '7-iron' },
    { id: 'iron8', name: '8-iron' },
    { id: 'iron9', name: '9-iron' },
    { id: 'pw', name: 'Pitching wedge' },
    { id: 'gw', name: 'Gap wedge' },
    { id: 'wedge52', name: '52°' },
    { id: 'wedge56', name: '56°' },
    { id: 'wedge60', name: '60°' },
  ];

  var FIELDS = ['fullCarry', 'fullTotal', 'threeQuarterCarry', 'threeQuarterTotal'];

  var FIELD_LABELS = {
    fullCarry: 'Full Carry',
    fullTotal: 'Full Total',
    threeQuarterCarry: '¾ Carry',
    threeQuarterTotal: '¾ Total',
  };

  function emptyClub() {
    return {
      fullCarry: '',
      fullTotal: '',
      threeQuarterCarry: '',
      threeQuarterTotal: '',
    };
  }

  function emptyState() {
    var clubs = {};
    for (var i = 0; i < CLUBS.length; i++) {
      clubs[CLUBS[i].id] = emptyClub();
    }
    return { version: 1, updatedAt: null, clubs: clubs };
  }

  function clone(state) {
    return JSON.parse(JSON.stringify(state));
  }

  function normalizeYards(value) {
    if (value === '' || value == null) return '';
    if (typeof value === 'string') {
      var trimmed = value.trim();
      if (trimmed === '') return '';
      value = trimmed;
    }
    var n = Number(value);
    if (!Number.isFinite(n)) return '';
    if (n < 0 || n > 999) return '';
    return String(Math.round(n));
  }

  function clubIsEmpty(club) {
    if (!club) return true;
    for (var i = 0; i < FIELDS.length; i++) {
      if (club[FIELDS[i]]) return false;
    }
    return true;
  }

  function mergeState(raw) {
    var next = emptyState();
    if (!raw || typeof raw !== 'object') return next;
    if (raw.updatedAt && typeof raw.updatedAt === 'string') {
      next.updatedAt = raw.updatedAt;
    }
    var src = raw.clubs && typeof raw.clubs === 'object' ? raw.clubs : raw;
    for (var i = 0; i < CLUBS.length; i++) {
      var id = CLUBS[i].id;
      var incoming = src[id];
      if (!incoming || typeof incoming !== 'object') continue;
      for (var f = 0; f < FIELDS.length; f++) {
        var field = FIELDS[f];
        next.clubs[id][field] = normalizeYards(incoming[field]);
      }
    }
    return next;
  }

  function load(storage) {
    var store = storage || (typeof localStorage !== 'undefined' ? localStorage : null);
    if (!store) return emptyState();
    try {
      var raw = store.getItem(STORAGE_KEY);
      if (!raw) return emptyState();
      return mergeState(JSON.parse(raw));
    } catch (err) {
      return emptyState();
    }
  }

  function persist(storage, state) {
    var store = storage || (typeof localStorage !== 'undefined' ? localStorage : null);
    if (!store) return state;
    store.setItem(STORAGE_KEY, JSON.stringify(state));
    return state;
  }

  function save(storage, state) {
    return persist(storage, state);
  }

  function touch(state, now) {
    var next = clone(state);
    var when = now || new Date();
    next.updatedAt = when instanceof Date ? when.toISOString() : String(when);
    return next;
  }

  function setField(state, clubId, field, rawValue, now) {
    if (!state || !state.clubs || !state.clubs[clubId]) return state;
    if (FIELDS.indexOf(field) < 0) return state;
    var next = clone(state);
    next.clubs[clubId][field] = normalizeYards(rawValue);
    var when = now || new Date();
    next.updatedAt = when instanceof Date ? when.toISOString() : String(when);
    return next;
  }

  function resetClub(state, clubId, now) {
    if (!state || !state.clubs || !state.clubs[clubId]) return state;
    var next = clone(state);
    next.clubs[clubId] = emptyClub();
    var when = now || new Date();
    next.updatedAt = when instanceof Date ? when.toISOString() : String(when);
    return next;
  }

  function clearAll(now) {
    return touch(emptyState(), now);
  }

  function formatUpdatedAt(iso, now) {
    if (!iso) return '';
    var d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  }

  function hasAnyYards(state) {
    if (!state || !state.clubs) return false;
    for (var i = 0; i < CLUBS.length; i++) {
      if (!clubIsEmpty(state.clubs[CLUBS[i].id])) return true;
    }
    return false;
  }

  return {
    STORAGE_KEY: STORAGE_KEY,
    CLUBS: CLUBS,
    FIELDS: FIELDS,
    FIELD_LABELS: FIELD_LABELS,
    emptyClub: emptyClub,
    emptyState: emptyState,
    normalizeYards: normalizeYards,
    clubIsEmpty: clubIsEmpty,
    mergeState: mergeState,
    load: load,
    save: save,
    persist: persist,
    setField: setField,
    resetClub: resetClub,
    clearAll: clearAll,
    formatUpdatedAt: formatUpdatedAt,
    hasAnyYards: hasAnyYards,
  };
});
