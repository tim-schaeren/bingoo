const INVITE_BASE_URL = 'https://tim-schaeren.github.io/bingoo/join/';

export function buildInviteDeepLink(code: string): string {
  return `bingoo://join/${code.trim().toUpperCase()}`;
}

export function buildInviteWebLink(code: string): string {
  return `${INVITE_BASE_URL}?code=${encodeURIComponent(
    code.trim().toUpperCase(),
  )}`;
}

export function buildInviteMessage(code: string, gameName?: string): string {
  const normalizedCode = code.trim().toUpperCase();
  const heading = gameName?.trim()
    ? `Join "${gameName.trim()}" on bingoo!`
    : 'Join my bingoo!';

  return `${heading}\nCode: ${normalizedCode}\nOpen invite: ${buildInviteWebLink(
    normalizedCode,
  )}`;
}
