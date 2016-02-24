module.exports = {


  friendlyName: 'Validate new issue',


  description: 'Validate that a new Github issue conforms to the repo\'s guidelines',


  extendedDescription: 'Parses the initial issue comment and checks it against the .github/ISSUE_TEMPLATE.md file, if any.  If the issue does not conform, it will be commented on, closed and labeled.  If it does conform, it will be reopened (if closed) and any labels matching cleanupIssueLabel will be removed.',


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
    errorFetchingTemplate: {
      description: 'An error occurred fetching the repo\'s issue template',
      example: '==='
    },
    errorUpdatingIssue: {
      description: 'An error occurred updating the issue',
      example: '==='
    }

  },


  fn: function(inputs, exits) {
    var Http = require('machinepack-http');
    // Get the repo
    var repo = inputs.repo;
    // Get the new issue
    var issue = inputs.issue;
    // Get the issue template
    var issueTemplateUrl = "https://raw.githubusercontent.com/"+repo.owner.login+"/"+repo.name+"/master/.github/ISSUE_TEMPLATE.md";

    Http.fetchWebpageHtml({url: issueTemplateUrl}).exec({
      // If there's no issue template, then there's no way to validate the issue, so let it pass
      notFound: function(err) {return exits.success();},
      error: function(err) {return exits.errorFetchingTemplate(err);},
      success: function(issueTemplateStr) {
        var issueTemplate = JSON.parse(issueTemplateStr);
        // Now that we have the issue template, extract the pledge
        var pledge = (function() {
          var match = issueTemplate.match(/### BEGIN PLEDGE ###([^]+)### END PLEDGE ###/);
          if (!match || !match[1]) {return null;}
          return match[1];
        })();
        // If there's no pledge in the issue template, there's no way to validate the issue,
        // so let it pass
        if (!pledge) {return exits.success();}
        
        var missingActionItems = [];
        // Split the pledge up into action items
        var actionItems = pledge.match(/^-[ ].*$/mg);
        // Now, make sure each action item exists in the new issue comment (with an X between the brackets)
        actionItems.forEach(function(actionItem) {
          var regexStr = escapeRegex(actionItem);
          regexStr = '^'+regexStr.substr(0,5) + '\\s*[xX]\\s*' + regexStr.substr(6)+'$';
          var regex = new RegExp(regexStr,'m');
          if (!regex.exec(issue.body)) {
            missingActionItems.push(actionItem);
          }
        });

        var missingVersionInfo = [];
        // Now, verify that we have all the version info
        ['Sails version', 'Node version', 'NPM version', 'Operating system'].forEach(function(version) {
          if (!(new RegExp('^\\*\\*'+version+'\\*\\*:[^\\S\\n]*(\\S+).*$','m')).exec(issue.body)) {
            missingVersionInfo.push(version);
          }
        });

        // If there's any missing items, post a comment with details, add the "cleanup" label
        // and close the issue
        if (missingVersionInfo.length || missingActionItems.length) {
          var comment = 'Hi @' + issue.user.login+'!  It looks like you didn&rsquo;t follow the instructions fully when you created your issue.  Please edit your comment (use the pencil icon at the top-right corner of the comment box) and fix the following issues:\n\n';
          missingVersionInfo.forEach(function(missingVersionItem) {
            comment += '* Provide your '+missingVersionItem+'\n';
          });
          missingActionItems.forEach(function(missingActionItem) {
            comment += '* Verify "'+missingActionItem.substr(6)+'"\n';
          });
          comment += "\nAs soon as those items are rectified, post a new comment (e.g. &ldquo;Ok, fixed!&rdquo;) below and we'll re-open this issue.  Thanks!";
          return async.auto({
            addLabel: function(cb) {
              require('machinepack-github').addLabelsToIssue({
                owner: repo.owner.login,
                repo: repo.name,
                issueNumber: issue.number,
                labels: [inputs.cleanupIssueLabel],
                credentials: {"accessToken":"49728f283a1f56ce8365a7422c39176677e4140c"}
              }).exec(cb);
            },
            addComment: function(cb) {
              require('machinepack-github').commentOnIssue({
                comment: comment,
                owner: repo.owner.login,
                repo: repo.name,
                issueNumber: issue.number,
                credentials: {"accessToken":"49728f283a1f56ce8365a7422c39176677e4140c"}
              }).exec(cb);
            },
            closeIssue: ['addLabel', 'addComment', function(cb) {
              require('machinepack-github').closeIssue({
                owner: repo.owner.login,
                repo: repo.name,
                issueNumber: issue.number,
                credentials: {"accessToken":"49728f283a1f56ce8365a7422c39176677e4140c"}
              }).exec(cb);
            }]
          }, function(err) {
            if (err) {return exits.errorUpdatingIssue(err);}
            return exits.success();
          });
        }

        if (issue.state == 'closed' && _.find(issue.labels, {name: inputs.cleanupIssueLabel})) {
          // Otherwise make sure the issue is opened and the "cleanup" label is removed
          async.auto({
            removeLabel: function(cb) {
              require('machinepack-github').removeLabelFromIssue({
                owner: repo.owner.login,
                repo: repo.name,
                issueNumber: issue.number,
                label: inputs.cleanupIssueLabel,
                credentials: {"accessToken":"49728f283a1f56ce8365a7422c39176677e4140c"}
              }).exec(cb);
            },
            openIssue: function(cb) {
              require('machinepack-github').reopenIssue({
                owner: repo.owner.login,
                repo: repo.name,
                issueNumber: issue.number,
                credentials: {"accessToken":"49728f283a1f56ce8365a7422c39176677e4140c"}
              }).exec(cb);
            }
          }, function(err) {
            if (err) {return exits.errorUpdatingIssue(err);}
            return exits.success();
          });
        }

      }
    });
    
    function escapeRegex(s) {
      return s.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
    }

  },



};