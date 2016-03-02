module.exports = {


  friendlyName: 'Handle issue comment event',


  description: 'Handle a new issue comment event POSTed from Github',


  cacheable: false,


  sync: false,


 inputs: {
    event: {
      description: 'The event payload from Github',
      example: require('../payloads/issue-comment.json'),
      required: true
    },
    credentials: {
      description: 'The credentials that the bot will use to make authenticated requests to the GitHub API. This determines "who" the bot appears to be.',
      extendedDescription: 'Either `accessToken`, `clientId`+`clientSecret`, or `username`+`password` keys may be provided.',
      example: {},
      required: true
    },
    cleanupIssueLabel: {
      friendlyName: 'Cleanup issue label',
      description: 'Label to use to indicate that an issue needs to have its initial comment cleaned up',
      extendedDescription: 'If this label is applied, then subsequent comments should trigger a webhook that will re-examine the initial comment for compliance with the repo\'s issue template (if any)',
      example: 'Needs cleanup',
      defaultsTo: 'Needs cleanup'      
    },        
    gracePeriodLabel: {
      friendlyName: 'Grace period label',
      description: 'Label to use to indicate that an issue is in its grace period and will be closed soon',
      example: 'Waiting to close',
      defaultsTo: 'Waiting to close'      
    },
    ignoreUsers: {
      friendlyName: 'Ignore users',
      description: 'List of users to ignore comments from',
      example: ['sailsbot'],
      defaultsTo: []
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

    if (inputs.ignoreUsers.indexOf(inputs.event.sender.login) > -1) {
      return exits.success();
    }

    if (inputs.event.issue.pull_request) {
      // If the PR is closed and has the "Needs cleanup" label,
      // then re-validate the initial comment
      if (inputs.event.issue.state == 'closed' && _.find(inputs.event.issue.labels, {name: inputs.cleanupIssueLabel})) {
        return require('../').validateNewPullRequest({
          repo: inputs.event.repository,
          pr: inputs.event.issue,
          credentials: inputs.credentials,
          cleanupIssueLabel: inputs.cleanupIssueLabel
        }).exec(exits);
      }
    }

    else {
      // If the issue is open and has the "Waiting to close" label,
      // then remove that label
      if (inputs.event.issue.state == 'open' && _.find(inputs.event.issue.labels, {name: inputs.gracePeriodLabel})) {
        return require('machinepack-github').removeLabelFromIssue({
          owner: inputs.event.repository.owner.login,
          repo: inputs.event.repository.name,
          issueNumber: inputs.event.issue.number,
          label: inputs.gracePeriodLabel,
          credentials: inputs.credentials
        }).exec({
          error: function(err) {
            return exits.error(err);
          },
          success: function(err) {
            exits.success();
          }
        });
      }
      // If the issue is closed and has the "Needs cleanup" label,
      // then re-validate the initial comment
      if (inputs.event.issue.state == 'closed' && _.find(inputs.event.issue.labels, {name: inputs.cleanupIssueLabel})) {
        return require('../').validateNewIssue({
          repo: inputs.event.repository,
          issue: inputs.event.issue,
          credentials: inputs.credentials,
          cleanupIssueLabel: inputs.cleanupIssueLabel
        }).exec(exits);
      }
      return exits.success();
    }

  },

};