module.exports = {


  friendlyName: 'Handle issue event',


  description: 'Handle an issue event POSTed from Github',


  extendedDescription: 'This covers issues being opened, closed, assigned or labeled.  Checks the "action" property to determine which of those occurred.',


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
    cleanupIssueLabel: {
      friendlyName: 'Cleanup issue label',
      description: 'Label to use to indicate that an issue needs to have its initial comment cleaned up',
      extendedDescription: 'If this label is applied, then subsequent comments should trigger a webhook that will re-examine the initial comment for compliance with the repo\'s issue template (if any)',
      example: 'Needs cleanup',
      defaultsTo: 'Needs cleanup'
    },
    closeDirtyIssues: {
      friendlyName: 'Close dirty issues',
      description: 'If `true`, issues not conforming to the template will be closed.',
      example: true,
      defaultsTo: false
    },
    defaultMessageTemplate: {
      friendlyName: 'Default Message Template',
      description: 'Template of message to respond to new issues with if there is no issue template',
      extendedDescription: 'Set to empty string to not send a default message',
      example: 'A comment written in _GitHub-flavored markdown syntax_ and optionally taking advantage of <%- lodash.template.notation %>.',
      defaultsTo: '@<%- issue.user.login %> Thanks for posting, we\'ll take a look as soon as possible.  In the meantime, if you haven’t already, please carefully read the [issue contribution guidelines](<%-contributionGuideUrl%>) and double-check for any missing information above.  In particular, please ensure that this issue is about a stability or performance bug with a  documented feature; and make sure you’ve included detailed instructions on how to reproduce the bug from a clean install.\n\nThank you!',
    },
    contributionGuideUrl: {
      description: 'The URL to pass in as a local variable for use via lodash template syntax in `commentTemplate`.',
      extendedDescription: 'If left unspecified, the URL will be built to automatically point at `CONTRIBUTING.md` in the top-level of the repo where the issue was posted.',
      example: 'https://github.com/balderdashy/sails/blob/master/CONTRIBUTING.md'
    },
    ignoreUsers: {
      friendlyName: 'Ignore users',
      description: 'List of users to ignore issues from',
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

    switch(inputs.event.action) {
      case 'opened':
        // Run new issues through the new issue validator
        require('../').validateNewIssue({
          repo: inputs.event.repository,
          issue: inputs.event.issue,
          credentials: inputs.credentials,
          cleanupIssueLabel: inputs.cleanupIssueLabel,
          closeDirtyIssues: inputs.closeDirtyIssues,
          defaultMessageTemplate: inputs.defaultMessageTemplate,
          contributionGuideUrl: inputs.contributionGuideUrl
        }).exec(exits);
        break;
      default:
        return exits.success();
    }

  },



};
