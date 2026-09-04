const isGitHubPages = process.env.GITHUB_ACTIONS === 'true';

export default {
  output: isGitHubPages ? 'export' : undefined,
  basePath: isGitHubPages ? '/ring-reversal-tactics' : undefined,
};
