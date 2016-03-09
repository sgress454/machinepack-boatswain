module.exports = {


  friendlyName: 'Handle pull request event',


  description: 'Handle a pull request event POSTed from Github',


  extendedDescription: 'This covers PRs being opened, closed, assigned or labeled.  Checks the "action" property to determine which of those occurred.',


  cacheable: false,


  sync: false,


  inputs: {
    event: {
      description: 'The event payload from Github',
      example: require('../payloads/issue.json'),
      required: true
    },
    credentials: {
      description: 'The credentials that the bot will use to make authenticated requests to the GitHub API. This determines "who" the bot appears to be.',
      extendedDescription: 'Either `accessToken`, `clientId`+`clientSecret`, or `username`+`password` keys may be provided.',
      example: {},
      required: true
    },
    cleanupPRLabel: {
      friendlyName: 'Cleanup pull request label',
      description: 'Label to use to indicate that a pull request needs to have its title cleaned up',
      extendedDescription: 'If this label is applied, then subsequent comments should trigger a webhook that will re-examine the title for compliance with the repo\'s guidelines',
      example: 'Needs cleanup',
      defaultsTo: 'Needs cleanup'
    },
    closeDirtyPRs: {
      friendlyName: 'Close dirty pull request',
      description: 'If `true`, pull requests not conforming to the instructions will be closed.',
      example: true,
      defaultsTo: false
    }
  },


  exits: {

    success: {
      variableName: 'result',
      description: 'Done.',
    },

  },


  fn: function(inputs, exits) {

    var async = require('async');
    var _ = require('lodash');

    switch(inputs.event.action) {
      case 'opened':
        // Run new issues through the new issue validator
        require('../').validateNewPullRequest({
          repo: inputs.event.repository,
          pr: _.extend(inputs.event.pull_request, {labels: []}),
          credentials: inputs.credentials,
          cleanupPRLabel: inputs.cleanupPRLabel,
          closeDirtyPRs: inputs.closeDirtyPRs
        }).exec(exits);
        break;
      default:
        return exits.success();
    }

  },



};
