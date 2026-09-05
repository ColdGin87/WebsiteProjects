const parse = require('./parse');
const handicap = require('./handicap');
const team = require('./team');
const formats = require('./formats');

module.exports = {
  ...parse,
  ...handicap,
  ...team,
  ...formats,
};
