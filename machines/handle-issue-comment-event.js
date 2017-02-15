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
    autoRemovableLabelColor: {
      friendlyName: 'Auto-removable label color',
      description: 'The hex color for labels which should be removed automatically whenever an issue gets a new comment',
      example: '009800',
      defaultsTo: '009800'
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

    // Coerce hex color to not have #
    var autoRemovableLabelColor = inputs.autoRemovableLabelColor.replace(/^#(.*)$/,'$1');

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
      var labelNames = _.pluck(inputs.event.issue.labels, 'name');
      var labelColors = _.pluck(inputs.event.issue.labels, 'color');
      // If the issue is open and has the "Waiting to close" label,
      // or a label with the "auto-remove" color, then remove that label
      if (inputs.event.issue.state == 'open' && (_.contains(labelNames, inputs.gracePeriodLabel) || _.contains(labelColors, autoRemovableLabelColor)) ) {
        async.each(inputs.event.issue.labels, function(label, nextLabel) {
          if (label.name === inputs.gracePeriodLabel || label.color === autoRemovableLabelColor) {
            return require('machinepack-github').removeLabelFromIssue({
              owner: inputs.event.repository.owner.login,
              repo: inputs.event.repository.name,
              issueNumber: inputs.event.issue.number,
              label: label.name,
              credentials: inputs.credentials
            }).exec({
              error: function(err) {
                return nextLabel(err);
              },
              success: function(err) {
                nextLabel();
              }
            });            
          }
          return nextLabel();
        }, function(err) {
          if (err) {return exits.error(err);}
          return exits.success();
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
