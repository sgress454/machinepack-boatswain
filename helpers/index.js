// This is a little helper pack with some private machines.
var _ = require('lodash');
var Machine = require('machine');

module.exports = {
  handleBrokenIssueComment: Machine.build(_.extend({identity: 'handle-broken-issue-comment' }, require('./machines/handle-broken-issue-comment')))
};
