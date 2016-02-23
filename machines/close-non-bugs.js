module.exports = {

  friendlyName: 'Close by label',


  description: 'Close issues which have been labeled as a non-issue in the specified GitHub repos; e.g. "question", "wontfix", "enhancement", "help wanted", "invalid" (customizable).',


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
      '\n\n'+
      'The issue queue in this repo is for verified bugs with documented features.  Unfortunately, we can\'t leave some other types of issues marked as "open".  This includes bug reports about undocumented features or unofficial plugins, as well as feature requests, questions, and commentary about the core framework. Please review our [contribution guide](<%-contributionGuideUrl%>) for details.'+
      '\n\n'+
      'If you\'re here looking for help and can\'t find it, visit [StackOverflow](http://stackoverflow.com), our [Google Group](https://groups.google.com/forum/#!forum/sailsjs) or our [chat room](https://gitter.im/balderdashy/sails?utm_source=badge&utm_medium=badge&utm_campaign=pr-badge&utm_content=badge).  But please do not let this disrupt future conversation in this issue! I am only marking it as "closed" to keep organized.'+
      '\n\n'+
      'Thanks so much for your help!'+
      '\n\n'+
      '> If I am mistaken, and this issue is about a _critical bug with a documented feature_, please accept my sincerest apologies-- I am but a humble bot working to make GitHub a better place.  If you open a new issue, a member of the core team will take a look ASAP.'
    },

    contributionGuideUrl: {
      description: 'The URL to pass in as a local variable for use via lodash template syntax in `commentTemplate`.',
      extendedDescription: 'If left unspecified, the URL will be built to automatically point at `CONTRIBUTING.md` in the top-level of the repo where the issue was posted.',
      example: 'https://github.com/balderdashy/sails/blob/master/CONTRIBUTING.md'
    },

    nonIssueLabels: {
      friendlyName: 'Labels to close',
      description: 'The names of issue labels.',
      extendedDescription: 'If any issues have any of these labels, they will be closed. Note that the label name comparison is case-insensitive.',
      example: ['question','feature'],
      required: true
    }

  },


  fn: function (inputs, exits) {
    var _ = require('lodash');
    var async = require('async');
    var Github = require('machinepack-github');

    // Determine the event horizon for issue staleness (a JS timestamp)
    console.log('Cleaning up issues that have any of the following labels: ',inputs.nonIssueLabels);

    // For each label...
    async.each(inputs.nonIssueLabels, function(nonIssueLabel, nextLabel) {

      // For each repo...
      async.each(inputs.repos, function (repo, nextRepo){

        // Fetch up to `inputs.maxNumIssuesToClosePerRepo` of the oldest
        // open issues in the repository.
        Github.searchIssues({
          owner: repo.owner,
          repo: repo.repoName,
          state: 'open',
          withAllOfTheseLabels: [ nonIssueLabel ],
          credentials: inputs.credentials,
        }).exec({
          error: function (err) {
            // If an error was encountered, keep going, but log it to the console.
            console.error('ERROR: Failed to search issues in "'+repo.owner+'/'+repo.repoName+'":\n',err);
            return nextRepo();
          },
          success: function (oldIssues){
            console.log('Located at least %d old, open issues in "'+repo.owner+'/'+repo.repoName+'"...',oldIssues.length);

            // Only use the first `inputs.maxNumIssuesToClosePerRepo` issues
            // (chop off any extras from the end of the array)
            oldIssues = oldIssues.slice(0, inputs.maxNumIssuesToClosePerRepo);
            console.log('...and closing the %d oldest ones.',oldIssues.length);

            // For each old issue...
            async.each(oldIssues, function (oldIssue, nextIssue){

              // Render the comment template.
              var comment;
              try {
                comment = _.template(inputs.commentTemplate)({
                  repo: repo,
                  issue: oldIssue,
                  contributionGuideUrl: inputs.contributionGuideUrl || 'https://github.com/'+repo.owner+'/'+repo.repoName+'/blob/master/CONTRIBUTING.md'
                });
              }
              catch (e) {
                console.error('ERROR: Failed to comment+close issue #'+oldIssue.number+' in "'+repo.owner+'/'+repo.repoName+'" because the comment template could not be rendered:\n',err);
                return nextIssue();
              }

              // Close the issue.
              Github.closeIssue({
                owner: repo.owner,
                repo: repo.repoName,
                issueNumber: oldIssue.number,
                credentials: inputs.credentials,
              }).exec({
                error: function (err){
                  // If an error was encountered, keep going, but log it to the console.
                  console.error('ERROR: Failed to comment+close issue #'+oldIssue.number+' in "'+repo.owner+'/'+repo.repoName+'":\n',err);
                  return nextIssue();
                },
                success: function (){

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
                      return nextIssue();
                    },
                    success: function (newCommentId){
                      return nextIssue();
                    }
                  });//</Github.commentOnIssue>
                }
              }); // </Github.closeIssue>

            }, function afterwards(err){
              // If a fatal error was encountered processing this repo, bail.
              // Otherwise, keep going.
              return nextRepo(err);
            }); //</async.each(oldIssues) >
          }
        }); // </Github.searchIssues>

      }, nextLabel); //</async.each(inputs.repos)>


    }, function afterwards(err) {
      if (err) {
        return exits.error(err);
      }
      return exits.success();
    }); //</async.each(inputs.nonIssueLabels)>

  }
};
