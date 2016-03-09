module.exports = {


  friendlyName: 'Close some stale issues',


  description: 'Close some stale issues in the specified GitHub repos.',


  inputs: {

    repos: {
      description: 'A set of repos that will be processed.',
      example: [{ owner: 'balderdashy', repoName: 'sails' }],
      required: true
    },

    credentials: {
      description: 'The credentials that the bot will use to make authenticated requests to the GitHub API. This determines "who" the bot appears to be.',
      extendedDescription: 'Either `accessToken`, `clientId`+`clientSecret`, or `username`+`password` keys may be provided.',
      example: {},
      required: true
    },

    maxNumIssuesToClosePerRepo: {
      description: 'The maximum number of issues to close in any one repo as a result of running this script.',
      extendedDescription: 'Currently, this must be <= 100 (because the page size of issue search results from the GitHub API is 100, and we don\'t currently handle multiple pages of results in this module)',
      example: 1,
      defaultsTo: 1
    },

    commentTemplate: {
      description: 'The string template for the comment that will be posted when an issue is closed.',
      extendedDescription: 'This supports lodash template notation with a handful of locals.  `issue` is the raw issue dictionary from the GitHub API and `repo` is one of the dictionaries provided to this script (i.e. with `repo.repoName` and `repo.owner`)',
      example: 'A comment written in _GitHub-flavored markdown syntax_ and optionally taking advantage of <%- lodash.template.notation %>.',
      defaultsTo:
      'Thanks for posting, @<%- issue.user.login %>.  I\'m a repo bot-- nice to meet you!'+
      '\n'+
      '\n'+
      'It has been <%-shelfLifeInDays%> day<%-shelfLifeInDays>1?"s":""%> since there have been any updates or new comments on this page.  If this issue has been resolved, feel free to disregard the rest of this message and simply close the issue if possible.  '+
      'On the other hand, if you are still waiting on a patch, please:\n\n'+
      '  + review our [contribution guide](<%-contributionGuideUrl%>) to make sure this submission meets our criteria (only _verified bugs_ with documented features, please;  no questions, commentary, or bug reports about undocumented features or unofficial plugins)'+
      '\n'+
      '  + create a new issue with the latest information, including updated version details with error messages, failing tests, and a link back to [the original issue](<%-issue.html_url%>).  This allows GitHub to automatically create a back-reference for future visitors arriving from search engines.'+
      '\n\n'+
      'Thanks so much for your help!'
      // 'Thanks so much for your help!\n\n'+
      // '-<%- _.startCase(repo.repoName) %> bot'
    },

    contributionGuideUrl: {
      description: 'The URL to pass in as a local variable for use via lodash template syntax in `commentTemplate`.',
      extendedDescription: 'If left unspecified, the URL will be built to automatically point at `CONTRIBUTING.md` in the top-level of the repo where the issue was posted.',
      example: 'https://github.com/balderdashy/sails/blob/master/CONTRIBUTING.md'
    },

    shelfLifeInDays: {
      friendlyName: 'Shelf life',
      description: 'How many days of inactivity to allow before an issue is considered stale.',
      example: 30,
      defaultsTo: 30
    },

    labelsToExclude: {
      description: 'A set of issue labels.',
      extendedDescription: 'If an issue has _any_ of these labels, it will not be closed.',
      example: ['bug'],
      defaultsTo: ['bug', 'performance', 'inconsistency']
    },

    gracePeriodInDays: {
      friendlyName: 'Grace period',
      description: 'How many days of grace period to allow before closing a stale issue',
      example: 3,
      defaultsTo: 0
    },

    gracePeriodLabel: {
      friendlyName: 'Grace period label',
      description: 'Label to use to indicate that an issue is in its grace period and will be closed soon',
      example: 'Waiting to close',
      defaultsTo: 'Waiting to close'
    },

    gracePeriodComment: {
      friendlyName: 'Grace period comment',
      extendedDescription: 'This supports lodash template notation with a handful of locals.  `issue` is the raw issue dictionary from the GitHub API and `repo` is one of the dictionaries provided to this script (i.e. with `repo.repoName` and `repo.owner`)',
      example: 'A comment written in _GitHub-flavored markdown syntax_ and optionally taking advantage of <%- lodash.template.notation %>.',
      defaultsTo:
      '<%- issueUsers %>: Hello, I\'m a repo bot-- nice to meet you!'+
      '\n'+
      '\n'+
      'It has been <%-shelfLifeInDays%> day<%-shelfLifeInDays>1?"s":""%> since there have been any updates or new comments on this page.  If this issue has been resolved, feel free to disregard the rest of this message and simply close the issue if possible.  '+
      'On the other hand, if you are still waiting on a patch, please post a comment to keep the thread alive (with any new information you can provide).\n\n'+
      '\n\n'+
      'If no further activity occurs on this thread within the next <%-gracePeriodInDays%> day<%-gracePeriodInDays>1?"s":""%>, the issue will automatically be closed.' +
      '\n\n'+
      'Thanks so much for your help!'
    }

  },


  fn: function (inputs, exits) {
    var _ = require('lodash');
    var async = require('async');
    var Github = require('machinepack-github');

    // Validate shelfLifeInDays (ensure it is a positive integer)
    if (inputs.shelfLifeInDays !== Math.floor(inputs.shelfLifeInDays)) {
      return exits.error('Sorry, the GitHub Issue Search API does not support partial days. `shelfLifeInDays` must be a positive integer.');
    }
    else if (inputs.shelfLifeInDays < 1) {
      if (inputs.shelfLifeInDays === 0) {
        // what are you, some kind of open-source masochist?
        return exits.error('What?!  I can\'t just close _all_ the issues. `shelfLifeInDays` must be a positive integer.');
      }
      if (inputs.shelfLifeInDays < 0) {
        return exits.error('Can\'t read the future, sorry. `shelfLifeInDays` must be a positive integer.');
      }
    }

    // Validate gracePeriodInDays (ensure it is a non-negative integer)
    if (inputs.gracePeriodInDays !== Math.floor(inputs.gracePeriodInDays)) {
      return exits.error('Sorry, the GitHub Issue Search API does not support partial days. `gracePeriodInDays` must be a positive integer.');
    }
    else if (inputs.gracePeriodInDays > inputs.shelfLifeInDays) {
      return exits.error('The grace period must be shorter than the shelf life!');
    }
    else if (inputs.gracePeriodInDays < 0) {
      return exits.error('Can\'t change the past, sorry. `gracePeriodInDays` must be a non-negative integer.');
    }

    // If there's a grace period, add the grace period label to the labels to exclude in the search
    if (inputs.gracePeriodInDays) {
      inputs.labelsToExclude.push(inputs.gracePeriodLabel);
    }

    // Determine the event horizon for issue staleness (a JS timestamp)
    var lastUpdatedBefore = (new Date()).getTime() - inputs.shelfLifeInDays*86400000;
    var gracePeriodExpires = (new Date()).getTime() - inputs.gracePeriodInDays*86400000;
    if (inputs.gracePeriodInDays) {
     console.log('Warning issues that haven\'t seen an update in %d days.',inputs.shelfLifeInDays);
     console.log('Closing warned issues that haven\'t seen an update in %d days.',inputs.gracePeriodInDays);
    } else {
     console.log('Closing issues that haven\'t seen an update in %d days.',inputs.shelfLifeInDays);
    }

    // For each repo...
    async.eachSeries(inputs.repos, function (repo, nextRepo){

      async.auto({
        findStale: function(done) {
          // Fetch up to `inputs.maxNumIssuesToClosePerRepo` of the oldest
          // open issues in the repository.
          Github.searchIssues({
            owner: repo.owner,
            repo: repo.repoName,
            state: 'open',
            lastUpdatedBefore: lastUpdatedBefore,
            credentials: inputs.credentials,
            withNoneOfTheseLabels: inputs.labelsToExclude
          }).exec({
            error: function (err) {

              if (err.output && err.output.body && err.output.body.match(/API rate limit exceeded/)) {
                try {
                  var headers = JSON.parse(err.output.headers);
                  var reset = headers["x-ratelimit-reset"];
                  inputs.repos.push(repo);
                  var delay = (reset * 1000) - ((new Date()).getTime());
                  console.log("Hit rate limit; pausing until", new Date(reset * 1000), "(" + delay + ")");
                  return setTimeout(done, delay);
                } catch(e) {
                  console.log(e);
                  return done();
                }
              }              
              // If an error was encountered, keep going, but log it to the console.
              console.error('ERROR: Failed to search issues in "'+repo.owner+'/'+repo.repoName+'":\n',err);
              return done();
            },
            success: function (oldIssues){
              console.log('Located at least %d old, open issues in "'+repo.owner+'/'+repo.repoName+'"...',oldIssues.length);

              // Only use the first `inputs.maxNumIssuesToClosePerRepo` issues
              // (chop off any extras from the end of the array)
              oldIssues = oldIssues.slice(0, inputs.maxNumIssuesToClosePerRepo);
              console.log('...and ' + (inputs.gracePeriodInDays ? 'warning' : 'closing') + ' the %d oldest ones.',oldIssues.length);

              // For each old issue...
              async.each(oldIssues, function (oldIssue, nextOldIssue){

                // If there's no grace period, simply close the issue.
                if (!inputs.gracePeriodInDays) {
                  return Github.closeIssue({
                    owner: repo.owner,
                    repo: repo.repoName,
                    issueNumber: oldIssue.number,
                    credentials: inputs.credentials,
                  }).exec({
                    error: function (err){
                      // If an error was encountered, keep going, but log it to the console.
                      console.error('ERROR: Failed to comment+close issue #'+oldIssue.number+' in "'+repo.owner+'/'+repo.repoName+'":\n',err);
                      return nextOldIssue();
                    },
                    success: function (){

                      // Render the comment template.
                      var comment;
                      try {
                        comment = _.template(inputs.commentTemplate)({
                          repo: repo,
                          issue: oldIssue,
                          shelfLifeInDays: inputs.shelfLifeInDays,
                          contributionGuideUrl: inputs.contributionGuideUrl || 'https://github.com/'+repo.owner+'/'+repo.repoName+'/blob/master/CONTRIBUTING.md'
                        });
                      }
                      catch (e) {
                        console.error('ERROR: Failed to comment+close issue #'+oldIssue.number+' in "'+repo.owner+'/'+repo.repoName+'" because the comment template could not be rendered:\n',err);
                        return next();
                      }

                      // Now post a comment on the issue explaining what's happening.
                      Github.commentOnIssue({
                        owner: repo.owner,
                        repo: repo.repoName,
                        issueNumber: oldIssue.number,
                        comment: comment,
                        credentials: inputs.credentials,
                      }).exec({
                        error: function (err){
                          // If an error was encountered, keep going, but log it to the console.
                          console.error('ERROR: Failed to comment+close issue #'+oldIssue.number+' in "'+repo.owner+'/'+repo.repoName+'":\n',err);
                          return nextOldIssue();
                        },
                        success: function (newCommentId){
                          return nextOldIssue();
                        }
                      });//</Github.commentOnIssue>
                    }
                  }); // </Github.closeIssue>
                }

                // Otherwise add the grace period label and comment
                async.auto({
                  addLabel: function(cb) {
                    Github.addLabelsToIssue({
                      owner: repo.owner,
                      repo: repo.repoName,
                      issueNumber: oldIssue.number,
                      labels: [inputs.gracePeriodLabel],
                      credentials: inputs.credentials,
                    }).exec(cb);
                  },
                  getIssueUsers: function(cb) {
                    var issueUsers = ['@'+oldIssue.user.login];
                    Github.listIssueComments({
                      owner: repo.owner,
                      repo: repo.repoName,
                      issueNumber: oldIssue.number
                    }).exec({
                      error: function(err) {return cb(err);},
                      success: function(comments) {
                        // Get the usernames of all the commenters
                        var commentUsers = _.map(comments, function(comment) {
                          return '@' + comment.author.username;
                        });
                        issueUsers = _.uniq(issueUsers.concat(commentUsers));
                        return cb(null, issueUsers);
                      }
                    });
                  },
                  addComment: ['getIssueUsers', function(cb, results) {
                    var comment;
                    var issueUsers = results.getIssueUsers.join(",");
                    try {
                      comment = _.template(inputs.gracePeriodComment)({
                        repo: repo,
                        issue: oldIssue,
                        gracePeriodInDays: inputs.gracePeriodInDays,
                        shelfLifeInDays: inputs.shelfLifeInDays,
                        issueUsers: issueUsers,
                        contributionGuideUrl: inputs.contributionGuideUrl || 'https://github.com/'+repo.owner+'/'+repo.repoName+'/blob/master/CONTRIBUTING.md'
                      });
                    }
                    catch (e) {
                      console.error('ERROR: Failed to comment on issue #'+oldIssue.number+' in "'+repo.owner+'/'+repo.repoName+'" because the grace period comment template could not be rendered:\n',e);
                      return cb();
                    }
                    Github.commentOnIssue({
                      owner: repo.owner,
                      repo: repo.repoName,
                      issueNumber: oldIssue.number,
                      comment: comment,
                      credentials: inputs.credentials,
                    }).exec({
                      error: function (err){
                        // If an error was encountered, keep going, but log it to the console.
                        console.error('ERROR: Failed to comment+close issue #'+oldIssue.number+' in "'+repo.owner+'/'+repo.repoName+'":\n',err);
                        return cb();
                      },
                      success: function (newCommentId){
                        return cb();
                      }
                    });
                  }]
                }, nextOldIssue);


              }, function afterwards(err){
                // If a fatal error was encountered processing this repo, bail.
                // Otherwise, keep going.
                return done(err);
              }); //</async.each(oldIssues)>
            }
          }); // </Github.searchIssues>

        }, // </findStale>
        findGraceExpired: function(done) {
          if (!inputs.gracePeriodInDays) {
            return done();
          }
          Github.searchIssues({
            owner: repo.owner,
            repo: repo.repoName,
            state: 'open',
            lastUpdatedBefore: gracePeriodExpires,
            credentials: inputs.credentials,
            withAllOfTheseLabels: [inputs.gracePeriodLabel]
          }).exec({
            error: function (err) {
              if (err.output && err.output.body && err.output.body.match(/API rate limit exceeded/)) {
                try {
                  var headers = JSON.parse(err.output.headers);
                  var reset = headers["x-ratelimit-reset"];
                  inputs.repos.push(repo);
                  var delay = (reset * 1000) - ((new Date()).getTime());
                  console.log("Hit rate limit; pausing until", new Date(reset * 1000), "(" + delay + ")");
                  return setTimeout(done, delay);
                } catch(e) {
                  console.log(e);
                  return done();
                }
              }
              // If an error was encountered, keep going, but log it to the console.
              console.error('ERROR: Failed to search issues in "'+repo.owner+'/'+repo.repoName+'":\n',err);
              return done();
            },
            success: function (oldIssues){
              console.log('Located at least %d open issues in "'+repo.owner+'/'+repo.repoName+'" with expired grace periods...',oldIssues.length);

              // Only use the first `inputs.maxNumIssuesToClosePerRepo` issues
              // (chop off any extras from the end of the array)
              oldIssues = oldIssues.slice(0, inputs.maxNumIssuesToClosePerRepo);
              console.log('...and closing the %d oldest ones.',oldIssues.length);

              // For each old issue...
              async.each(oldIssues, function (oldIssue, nextOldIssue){
                async.parallel([
                  function removeLabel(cb) {
                    return Github.removeLabelFromIssue({
                      owner: repo.owner,
                      repo: repo.repoName,
                      issueNumber: oldIssue.number,
                      label: inputs.gracePeriodLabel,
                      credentials: inputs.credentials,
                    }).exec(cb);
                  },
                  function closeIssue(cb) {
                    return Github.closeIssue({
                      owner: repo.owner,
                      repo: repo.repoName,
                      issueNumber: oldIssue.number,
                      credentials: inputs.credentials,
                    }).exec({
                      error: function (err){
                        // If an error was encountered, keep going, but log it to the console.
                        console.error('ERROR: Failed to close issue #'+oldIssue.number+' in "'+repo.owner+'/'+repo.repoName+'":\n',err);
                        return cb();
                      },
                      success: function (){
                        return cb();
                      }
                    });
                  }
                ], nextOldIssue);
              }, done);
            }
          });

        } // </findGraceExpired>
      }, nextRepo); // </async.auto>

    }, function afterwards(err) {
      if (err) {
        return exits.error(err);
      }
      return exits.success();
    }); //</async.eachSeries(inputs.repos)>

  }
};
