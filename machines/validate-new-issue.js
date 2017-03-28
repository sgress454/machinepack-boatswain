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
      defaultsTo: '@<%- issue.user.login %> Thanks for posting, we\'ll take a look as soon as possible.  In the meantime, if you haven’t already, please carefully read the [issue contribution guidelines](<%-contributionGuideUrl%>) and double-check for any missing information above.  In particular, please ensure that this issue is about a stability or performance bug with a  documented feature; and make sure you’ve included detailed instructions on how to reproduce the bug from a clean install.\n\nThank you!\n\n> For help with questions about Sails, [click here](http://sailsjs.com/support).  If you&rsquo;re interested in hiring @sailsbot and her minions in Austin, [click here](http://sailsjs.com/studio).',
    },
    welcomeMessageTemplate: {
      friendlyName: 'Welcome Message Template',
      description: 'Template of message to respond to new issues with when the poster successfully navigates the issue template',
      extendedDescription: 'Set to empty string to not send a default message',
      example: 'A comment written in _GitHub-flavored markdown syntax_ and optionally taking advantage of <%- lodash.template.notation %>.',
      defaultsTo: '@<%- issue.user.login %> Thanks for posting, we\'ll take a look as soon as possible.\n\n---\n\nFor help with questions about Sails, [click here](http://sailsjs.com/support).  If you&rsquo;re interested in hiring @sailsbot and her minions in Austin, [click here](http://sailsjs.com/studio).',
    },
    contributionGuideUrl: {
      description: 'The URL to pass in as a local variable for use via lodash template syntax in `commentTemplate`.',
      extendedDescription: 'If left unspecified, the URL will be built to automatically point at `CONTRIBUTING.md` in the top-level of the repo where the issue was posted.',
      example: 'https://github.com/balderdashy/sails/blob/master/CONTRIBUTING.md'
    }      
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
    
    var async = require('async');
    var _ = require('lodash');

    var Http = require('machinepack-http');
    var helpers = require('../helpers');
    // Get the repo
    var repo = inputs.repo;
    // Get the new issue
    var issue = inputs.issue;
    // Get the issue template
    var issueTemplateUrl = "https://raw.githubusercontent.com/"+repo.owner.login+"/"+repo.name+"/master/.github/ISSUE_TEMPLATE";

    Http.fetchWebpageHtml({url: issueTemplateUrl}).exec({
      // If there's no issue template, then there's no way to validate the issue, so let it pass
      notFound: function(err) {
        // If there's no default message template, we're done
        if (!inputs.defaultMessageTemplate) {
          return exits.success();
        }
        // Otherwise attempt to post a message on the new issue
        var comment;
        try {
          comment = _.template(inputs.defaultMessageTemplate)({
            repo: repo,
            issue: issue,
            contributionGuideUrl: inputs.contributionGuideUrl || 'https://github.com/'+repo.owner.login+'/'+repo.name+'/blob/master/CONTRIBUTING.md'
          });
        }
        catch (e) {
          return exits.error(e);
        }

        // Now post a comment on the issue explaining what's happening.
        require('machinepack-github').commentOnIssue({
          owner: repo.owner.login,
          repo: repo.name,
          issueNumber: issue.number,
          comment: comment,
          credentials: inputs.credentials,
        }).exec({
          error: function (err){
            // If an error was encountered, keep going, but log it to the console.
            return exits.errorUpdatingIssue(err);
          },
          success: function (newCommentId){
            return exits.success();
          }
        });//</Github.commentOnIssue>        
      },
      error: function(err) {return exits.errorFetchingTemplate(err);},
      success: function(issueTemplateStr) {
        var issueTemplate;
        try {
          issueTemplate = JSON.parse(issueTemplateStr);
        } catch (e) {
          return exits.error(e);
        }
        // Now that we have the issue template, extract the pledge
        var pledge = (function() {
          var match = issueTemplate.match(/### BEGIN PLEDGE ###([^]+)### END PLEDGE ###/);
          if (!match || !match[1]) {return null;}
          return match[1];
        })();
        // If there's no pledge in the issue template, there's no way to validate the issue,
        // so let it pass
        if (!pledge) {return exits.success();}

        // If the pledge blockis missing completely from the new issue comment, 
        // let the user know they need to put it back
        if (!(function(){
          var match = issue.body.match(/### BEGIN PLEDGE ###([^]+)### END PLEDGE ###/);
          if (!match || !match[1]) {return false;}
          return true;
        }())) {
          return helpers.handleBrokenIssueComment(inputs).exec(exits);
        }
        
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
        var versionInfo = (function() {
          var items = [];
          var match = issueTemplate.match(/### BEGIN VERSION INFO ###([^]+)### END VERSION INFO ###/);
          if (!match || !match[1]) {return [];}                      
          var regex = /\*\*(.+)\*\*/g;
          var item;
          while ((item = regex.exec(match[1]))) {
            items.push(item[1]);
          }
          return items;
        })();

        // If the version info block is missing completely from the new issue comment, 
        // let the user know they need to put it back        
        if (versionInfo.length && !(function(){
          var match = issue.body.match(/### BEGIN VERSION INFO ###([^]+)### END VERSION INFO ###/);
          if (!match || !match[1]) {return false;}
          return true;
        }())) {
          return helpers.handleBrokenIssueComment(inputs).exec(exits);
        }
        // Now, verify that we have all the version info
        versionInfo.forEach(function(version) {
          if (!(new RegExp('^\\*\\*'+version+'\\*\\*:[^\\S\\n]*(\\S+).*$','m')).exec(issue.body)) {
            missingVersionInfo.push(version);
          }
        });

        // If there's any missing items, post a comment with details, add the "cleanup" label
        // and close the issue
        if (missingVersionInfo.length || missingActionItems.length) {
          var comment;
          // If the issue is already labeled "needs cleanup", post a shorter, sweeter message
          if (_.find(issue.labels, {name: inputs.cleanupIssueLabel})) {
            comment = 'Sorry to be a hassle, but it looks like your issue is still missing some required info.  Please double-check your initial comment and try again.\n\n';
          }
          else {
            comment = 'Hi @' + issue.user.login+'!  It looks like you missed a step or two when you created your issue.  Please edit your comment (use the pencil icon at the top-right corner of the comment box) and fix the following:\n\n';
            missingVersionInfo.forEach(function(missingVersionItem) {
              comment += '* Provide your '+missingVersionItem+'\n';
            });
            missingActionItems.forEach(function(missingActionItem) {
              comment += '* Verify "'+missingActionItem.substr(6)+'"\n';
            });
            comment += "\nAs soon as those items are rectified, post a new comment (e.g. &ldquo;Ok, fixed!&rdquo;) below and we'll take a look.  Thanks!\n\n";
          }
          comment += '*If you feel this message is in error, or you want to debate the merits of my existence (sniffle), please contact inquiries@sailsjs.com';
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
              // If we're not closing issues, just return
              if (!inputs.closeDirtyIssues) {return cb();}
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
        } // </ if (missingVersionInfo.length || missingActionItems.length) >
 
        // Otherwise make sure the issue is opened and the "cleanup" label is removed,
        // and add a "welcome" comment.
        async.auto({
          removeLabel: function(cb) {
            // If there is no "clean up" label on the issue, skip this step.
            if (_.find(issue.labels, {name: inputs.cleanupIssueLabel})) {
              return cb();
            }
            require('machinepack-github').removeLabelFromIssue({
              owner: repo.owner.login,
              repo: repo.name,
              issueNumber: issue.number,
              label: inputs.cleanupIssueLabel,
              credentials: inputs.credentials
            }).exec(cb);
          },
          openIssue: function(cb) {
            // If there is no "clean up" label on the issue, skip this step.
            if (_.find(issue.labels, {name: inputs.cleanupIssueLabel})) {
              return cb();
            }
            require('machinepack-github').reopenIssue({
              owner: repo.owner.login,
              repo: repo.name,
              issueNumber: issue.number,
              credentials: inputs.credentials
            }).exec(cb);
          },
          addComment: function(cb) {

            // Otherwise attempt to post a message on the new issue
            var comment;
            try {
              comment = _.template(inputs.welcomeMessageTemplate)({
                repo: repo,
                issue: issue,
                contributionGuideUrl: inputs.contributionGuideUrl || 'https://github.com/'+repo.owner.login+'/'+repo.name+'/blob/master/CONTRIBUTING.md'
              });
            }
            catch (e) {
              return cb(e);
            }

            require('machinepack-github').commentOnIssue({
              comment: comment,
              owner: repo.owner.login,
              repo: repo.name,
              issueNumber: issue.number,
              credentials: inputs.credentials
            }).exec(cb);
          },

        }, function(err) {
          if (err) {return exits.errorUpdatingIssue(err);}
          return exits.success();
        });

      }
    });
    
    function escapeRegex(s) {
      return s.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
    }

  },



};