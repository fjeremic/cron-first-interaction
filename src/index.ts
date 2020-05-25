import * as core from "@actions/core";
import * as github from "@actions/github";
import { Octokit } from "@octokit/rest";

type Pull = Octokit.PullsListResponseItem;
type PullLabel = Octokit.PullsListResponseItemLabelsItem;

interface Args {
  repoToken: string;
  prMessage: string;
  prLabel: string;
  operationsPerRun: number;
}

async function run(): Promise<void> {
  try {
    const args = getAndValidateArgs();

    const client = new github.GitHub(args.repoToken);

    await processPrs(client, args, args.operationsPerRun);
  } catch (error) {
    console.log(error.message);
    console.log(error.stack);

    core.setFailed(error.message);
  }
}

async function processPrs(
  client: github.GitHub,
  args: Args,
  operationsLeft: number,
  page: number = 1
): Promise<number> {
  const prs = await client.pulls.list({
    owner: github.context.repo.owner,
    repo: github.context.repo.repo,
    state: "open",
    sort: "updated",
    direction: "desc",
    per_page: 100,
    page
  });

  operationsLeft -= 1;

  if (prs.data.length === 0 || operationsLeft === 0) {
    return operationsLeft;
  }

  for (const pr of prs.data.values()) {
    console.log(`found pr #${pr.number}: ${pr.title}`);

    if (isLabeled(pr, args.prLabel)) {
      console.log(`skipping pr #${pr.number} due to label ${args.prLabel}`);
      continue;
    }

    if (await isFirstPull(client, pr.user.login, pr.number)) {
      console.log(`adding comment to pr #${pr.number}`);

      await client.pulls.createReview({
        owner: github.context.repo.owner,
        repo: github.context.repo.repo,
        pull_number: pr.number,
        body: args.prMessage,
        event: "COMMENT"
      });

      console.log(`marking pr #${pr.number} with ${args.prLabel} label`);

      await client.issues.addLabels({
        owner: github.context.repo.owner,
        repo: github.context.repo.repo,
        issue_number: pr.number,
        labels: [args.prLabel]
      });

      operationsLeft -= 2;
    }

    // For the isFirstPull call
    operationsLeft -= 1;

    if (operationsLeft < 3) {
      core.warning(
        `performed ${args.operationsPerRun} operations, exiting to avoid rate limit`
      );
      return 0;
    }
  }

  return await processPrs(client, args, operationsLeft, page + 1);
}

function isLabeled(pr: Pull, label: string): boolean {
  const labelComparer: (l: PullLabel) => boolean = l =>
    label.localeCompare(l.name, undefined, { sensitivity: "accent" }) === 0;
  return pr.labels.filter(labelComparer).length > 0;
}

async function isFirstPull(
  client: github.GitHub,
  sender: string,
  prlNumber: number
): Promise<boolean> {
  const { status, data: issues } = await client.issues.listForRepo({
    owner: github.context.repo.owner,
    repo: github.context.repo.repo,
    creator: sender,
    state: "all",
    sort: "created",
    direction: "asc",
    per_page: 100,
    page: 1
  });

  if (status !== 200) {
    throw new Error(`Received unexpected API status code ${status}`);
  }

  for (const issue of issues) {
    if (issue.number < prlNumber && issue.pull_request) {
      console.log(
        `skipping pr #${prlNumber} because author ${sender} has created pr #${issue.number} in the past`
      );
      return false;
    }
  }

  // This is more of a safety guard because we don't want to support pagination within this function. There could be
  // a case where some user has opened over 100 issues before opening up their first PR. Because the above fetches
  // the first 100 issues or PRs sorted by date of creation in ascending order we may not be able to see this PR as
  // it may be on the second page. We stay conserviative and in the case that a user has opened at least 10 issues or
  // PRs we just bail out and assume they have contributed in the past.
  if (issues.length > 10) {
    console.log(
      `skipping pr #${prlNumber} because author ${sender} has at least 10 issues or prs created so we are being conservative`
    );
    return false;
  }

  return true;
}

function getAndValidateArgs(): Args {
  const args = {
    repoToken: core.getInput("repo-token", { required: true }),
    prMessage: core.getInput("pr-message", { required: true }),
    prLabel: core.getInput("pr-label", { required: true }),
    operationsPerRun: parseInt(
      core.getInput("operations-per-run", { required: true })
    )
  };

  for (const numberInput of ["operations-per-run"]) {
    if (isNaN(parseInt(core.getInput(numberInput)))) {
      throw Error(`input ${numberInput} did not parse to a valid integer`);
    }
  }

  return args;
}

run();
