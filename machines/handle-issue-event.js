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
  },


  exits: {

    success: {
      variableName: 'result',
      description: 'Done.',
    },

  },


  fn: function(inputs, exits) {

    switch(inputs.event.action) {
      case 'opened':
        // Run new issues through the new issue validator
        require('../').validateNewIssue({
          repo: inputs.event.repository,
          issue: inputs.event.issue,
          credentials: inputs.credentials,
          cleanupIssueLabel: inputs.cleanupIssueLabel
        }).exec(exits);
        break;
      default:
        return exits.success();
    }

  },



};