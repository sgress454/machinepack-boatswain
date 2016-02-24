module.exports = {


  friendlyName: 'Validate new pull request',


  description: 'Validate that a new Github pull request conforms to the repo\'s guidelines',


  extendedDescription: 'Parses the initial pull request title and checks that it contains a valid prefix.  If not, closes the issue with a comment and adds the "Needs cleanup" label.  If so, adds a comment saying we\'ll get to it ASAP.',


  cacheable: false,


  sync: false,


  inputs: {
    "repo": {
      description: "The repo to validate a pull request for",
      example: {
        "name": "github-api-tester-uno",
        "owner": {
          "login": "sgress454"
        }
      },
    },
    "pr": {
      description: "The pull request to validate",
      example: {
        "number": 123,
        "title": "my requedzt",
        "state": "open",
        "user": {
          "login": "sgress454"
        },
        "labels": [{}],
        "body": "some problemz"
      },
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
  },


  exits: {

    success: {
      description: 'Done.',
    },
    errorUpdatingPR: {
      description: 'An error occurred updating the pull request',
      example: '==='
    }

  },


  fn: function(inputs, exits) {
    var Http = require('machinepack-http');
    // Get the repo
    var repo = inputs.repo;
    // Get the new PR
    var pr = inputs.pr;

    // If the title doesn't contain a valid prefix, comment and close
    if (!pr.title.match(/^\[(proposal|patch|implements #\d+|fixes #\d+)\]/)) {

      var comment = 'Hi @' + pr.user.login+'!  It looks like you didn&rsquo;t follow the instructions fully when you created your pull request.  Please edit your title so that it starts with [proposal], [patch], [fixes #<issue number>],  or [implements #<other PR number>].  Once you\'ve fixed title, post a comment below (e.g. "ok, fixed!") and we\'ll re-open the PR!';
      return async.auto({
        addLabel: function(cb) {
          require('machinepack-github').addLabelsToIssue({
            owner: repo.owner.login,
            repo: repo.name,
            issueNumber: pr.number,
            labels: [inputs.cleanupPRLabel],
            credentials: inputs.credentials
          }).exec(cb);
        },
        addComment: function(cb) {
          require('machinepack-github').commentOnIssue({
            comment: comment,
            owner: repo.owner.login,
            repo: repo.name,
            issueNumber: pr.number,
            credentials: inputs.credentials
          }).exec(cb);
        },
        closeIssue: ['addLabel', 'addComment', function(cb) {
          require('machinepack-github').closeIssue({
            owner: repo.owner.login,
            repo: repo.name,
            issueNumber: pr.number,
            credentials: inputs.credentials
          }).exec(cb);
        }]
      }, function(err) {
        if (err) {return exits.errorUpdatingPR(err);}
        return exits.success();
      });
    }

    if (pr.state == 'closed' && _.find(pr.labels, {name: inputs.cleanupPRLabel})) {
      // Otherwise make sure the issue is opened and the "cleanup" label is removed
      return async.auto({
        removeLabel: function(cb) {
          require('machinepack-github').removeLabelFromIssue({
            owner: repo.owner.login,
            repo: repo.name,
            issueNumber: pr.number,
            label: inputs.cleanupPRLabel,
            credentials: inputs.credentials
          }).exec(cb);
        },
        openIssue: function(cb) {
          require('machinepack-github').reopenIssue({
            owner: repo.owner.login,
            repo: repo.name,
            issueNumber: pr.number,
            credentials: inputs.credentials
          }).exec(cb);
        }
      }, function(err) {
        if (err) {return exits.errorUpdatingPR(err);}
        return exits.success();
      });
    }

    require('machinepack-github').commentOnIssue({
      comment: "Thanks for posting, @"+pr.user.login+"!  We\'ll look into this ASAP.",
      owner: repo.owner.login,
      repo: repo.name,
      issueNumber: pr.number,
      credentials: inputs.credentials
    }).exec({
      success: exits.success,
      error: exits.errorUpdatingPR
    });


  },

};