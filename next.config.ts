const isGitHubPages = process.env.GITHUB_ACTIONS === 'true';

export default {
  output: isGitHubPages ? 'export' : undefined,
};
