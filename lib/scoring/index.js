const parse = require('./parse');
const handicap = require('./handicap');
const team = require('./team');

module.exports = {
  ...parse,
  ...handicap,
  ...team,
};
