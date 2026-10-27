// Derive attribution from GitHub's authenticated identity, never a generic email
// that could belong to an unrelated account.
export function releaseIdentity(account, expectedOwner) {
  if (!account || typeof account.login !== 'string' ||
      account.login.toLowerCase() !== expectedOwner.toLowerCase() ||
      !Number.isSafeInteger(account.id) || account.id <= 0) {
    throw new Error('Release attribution requires the authenticated repository owner.');
  }
  return {
    name: account.login,
    email: `${account.id}+${account.login}@users.noreply.github.com`,
  };
}

export function releaseEnvironment(environment, identity) {
  return {
    ...environment,
    GIT_AUTHOR_NAME: identity.name,
    GIT_AUTHOR_EMAIL: identity.email,
    GIT_COMMITTER_NAME: identity.name,
    GIT_COMMITTER_EMAIL: identity.email,
  };
}
