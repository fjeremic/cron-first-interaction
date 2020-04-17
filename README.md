# Cron First Interaction

Cron first interaction is an extension of [actions/first-interaction](https://github.com/actions/first-interaction) which automatically comments on pull requests from first-time contributors using a rate limit aware cron job.

The [actions/first-interaction](https://github.com/actions/first-interaction) GitHub Action runs into the following issue (further described in [actions/first-interaction#10](https://github.com/actions/first-interaction/issues/10)) when the check runs on a pull request originating from a _forked_ repository:

```
##[error] HttpError: Resource not accessible by integration
##[error] Resource not accessible by integration
##[error] Node run failed with exit code 1
```

This is a fairly restrictive limitation in the GitHub Pull Request Workflow which many open source projects follow.

This project circumvents this limitation by running the GitHub Action as a cron job on the target repository. The cron job continuously monitors the pull requests of the target repository and posts comments on pull requests from first time contributors in a rate limiting aware manner with pagination support. The idea is that if this action is run often enough it will keep monitoring the most recently updated pull requests, and eventually all pull requests will have been processed.

To prevent a duplicate comment being posted on subsequent scheduled jobs, this action adds a label once the comment is posted which will be checked for on subsequent runs. It is up to the repository owner to ensure the label exists.

## Usage

### Create Workflow

Create a workflow (eg: `.github/workflows/first-interaction.yml` see [Creating a Workflow file](https://help.github.com/en/articles/configuring-a-workflow#creating-a-workflow-file)) to utilize the first-interaction action running every 10 minutes:

```
name: "First Time Contributor"
on:
  schedule:
  - cron: "*/10 * * * *"

jobs:
  triage:
    runs-on: ubuntu-latest
    steps:
    - uses: fjeremic/cron-first-interaction@0.1.0
      with:
        repo-token: ${{ secrets.GITHUB_TOKEN }}
        pr-message: |-
          Thank you for supporting the project $GITHUB_ACTOR, and congratulations on your
          first contribution! A project committer will shortly review your contribution. 
          In the mean time, if you haven't had a chance please skim over the 
          [contribution guidelines](https://example.com/) which all pull requests must adhere to.

          We hope to see you around!
        pr-label:
          - first contribution
```

_Note: This grants access to the `GITHUB_TOKEN` so the action can make calls to GitHub's rest API._
