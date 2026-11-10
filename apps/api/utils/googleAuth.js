// Server-side Google ID-token verification (Phase 3a).
// Login used to trust whatever email/name/picture the client sent in the
// body; it now accepts only a Google ID token verified here against
// GOOGLE_CLIENT_ID. There is no bypass flag and no dev escape: if
// GOOGLE_CLIENT_ID is unset, or the token is forged / expired / for another
// audience, verification throws and the caller answers 401.
// Tests mock this module (vi.mock "../utils/googleAuth.js") — no test ever
// calls real Google.
import { OAuth2Client } from "google-auth-library";

/**
 * Verify a Google ID token and return the identity Google vouches for.
 * Never trust body-supplied email/name/picture — use only this result.
 */
export async function verifyGoogleIdToken(idToken) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) {
    throw new Error("GOOGLE_CLIENT_ID is not configured");
  }
  const client = new OAuth2Client(clientId);
  const ticket = await client.verifyIdToken({
    idToken,
    audience: clientId,
  });
  const payload = ticket.getPayload();
  if (!payload || !payload.email || payload.email_verified !== true) {
    throw new Error("Invalid Google ID token");
  }
  return {
    email: payload.email,
    name: payload.name,
    picture: payload.picture,
    sub: payload.sub,
  };
}
