module.exports = {


  friendlyName: 'Handle broken issue comment',


  description: 'Handle an issue whose initial comment is broken',


  extendedDescription: 'For issues whose initial comment no longer contains the required template elements (e.g the pledge and/or version info tags), so that it will never pass Sailsbot inspection, send a comment to the user with instructions on how to fix it.',


  cacheable: false,


  sync: false,


  inputs: {
    "repo": {
      description: "The repo to validate an issue for",
      example: {
        "name": "github-api-tester-uno",
        "owner": {
          "login": "sgress454"
        }
      },
    },
    "issue": {
      description: "The issue to validate",
      example: {
        "number": 123,
        "labels": [{}],
        "state": "open",
        "user": {
          "login": "sgress454"
        },
        "body": "some problemz"
      },
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
      description: 'Done.',
    },

    errorUpdatingIssue: {
      description: 'An error occurred updating the issue',
      example: '==='
    }    

  },

  fn: function(inputs, exits) {
    var issue = inputs.issue;
    var repo = inputs.repo;
    var comment = 'Hi @' + issue.user.login+'!  It looks like you may have removed some required elements from the initial comment template, without which I can\'t verify that this post meets our [contribution guidelines](http://bit.ly/sails-issue-guide). ';
    comment += 'To re-open this issue, please copy the template from [here](https://raw.githubusercontent.com/'+repo.owner.login+'/'+repo.name+'/master/.github/ISSUE_TEMPLATE), paste it at the beginning of your initial comment, and follow the instructions in the text. ';
    comment += 'Then post a new comment (e.g. "ok, fixed!") so that I know to go back and check.\n\n';
    comment += 'Sorry to be a hassle, but following these instructions ensures that we can help you in the best way possible and keep the Sails project running smoothly.\n\n';
    comment += '*If you feel this message is in error, or you want to debate the merits of my existence (sniffle), please contact inquiries@treeline.io.*';
    return async.auto({
      addLabel: function(cb) {
        require('machinepack-github').addLabelsToIssue({
          owner: repo.owner.login,
          repo: repo.name,
          issueNumber: issue.number,
          labels: [inputs.cleanupIssueLabel],
          credentials: inputs.credentials
        }).exec(cb);
      },
      addComment: function(cb) {
        require('machinepack-github').commentOnIssue({
          comment: comment,
          owner: repo.owner.login,
          repo: repo.name,
          issueNumber: issue.number,
          credentials: inputs.credentials
        }).exec(cb);
      },
      closeIssue: ['addLabel', 'addComment', function(cb) {
        require('machinepack-github').closeIssue({
          owner: repo.owner.login,
          repo: repo.name,
          issueNumber: issue.number,
          credentials: inputs.credentials
        }).exec(cb);
      }]
    }, function(err) {
      if (err) {return exits.errorUpdatingIssue(err);}
      return exits.success();
    });
  }

};