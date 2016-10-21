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
    cleanupPRLabel: {
      friendlyName: 'Cleanup pull request label',
      description: 'Label to use to indicate that a pull request needs to have its title cleaned up',
      extendedDescription: 'If this label is applied, then subsequent comments should trigger a webhook that will re-examine the title for compliance with the repo\'s guidelines',
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
    },
    closeDirtyIssues: {
      friendlyName: 'Close dirty issues',
      description: 'If `true`, issues not conforming to the template will be closed.',
      example: true,
      defaultsTo: false
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

    if (inputs.ignoreUsers.indexOf(inputs.event.sender.login) > -1) {
      return exits.success();
    }

    if (inputs.event.issue.pull_request) {
      // If the PR has the "Needs cleanup" label,
      // then re-validate the initial comment
      if (_.find(inputs.event.issue.labels, {name: inputs.cleanupPRLabel}) && inputs.event.issue.user.login == inputs.event.comment.user.login) {
        return require('../').validateNewPullRequest({
          repo: inputs.event.repository,
          pr: inputs.event.issue,
          credentials: inputs.credentials,
          cleanupPRLabel: inputs.cleanupPRLabel,
          closeDirtyPRs: inputs.closeDirtyPRs
        }).exec(exits);
      }//-•
      
      return exits.success();
    }//</if pull request>
    //
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
      // If the issue has the "Needs cleanup" label,
      // and the comment is from the author, then re-validate the initial comment
      if (_.find(inputs.event.issue.labels, {name: inputs.cleanupIssueLabel}) && inputs.event.issue.user.login == inputs.event.comment.user.login) {
        return require('../').validateNewIssue({
          repo: inputs.event.repository,
          issue: inputs.event.issue,
          credentials: inputs.credentials,
          cleanupIssueLabel: inputs.cleanupIssueLabel,
          closeDirtyIssues: inputs.closeDirtyIssues
        }).exec(exits);
      }
      return exits.success();
    }//</else>

  },

};
