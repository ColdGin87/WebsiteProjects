const parse = require('./parse');
const handicap = require('./handicap');
const team = require('./team');
const formats = require('./formats');
const lowMan = require('./lowMan');
const skins = require('./skins');
const vegas = require('./vegas');
const nassau = require('./nassau');
const wolf = require('./wolf');
const nines = require('./nines');
const sideGames = require('./sideGames');
const birdieSlots = require('./birdieSlots');

module.exports = {
  ...parse,
  ...handicap,
  ...team,
  ...formats,
  ...lowMan,
  ...skins,
  ...vegas,
  ...nassau,
  ...wolf,
  ...nines,
  ...sideGames,
  ...birdieSlots,
};
