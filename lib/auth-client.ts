import { anonymousClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient({ plugins: [anonymousClient()] });

let guest: Promise<void> | undefined;

/** Signs in as a guest if nobody is signed in. Shared so parallel callers don't create two guests. */
export function ensureSession() {
  return (guest ??= (async () => {
    const { data } = await authClient.getSession();
    if (!data) await authClient.signIn.anonymous();
  })().catch((e) => {
    guest = undefined;
    throw e;
  }));
}

export async function signOut() {
  await authClient.signOut();
  guest = undefined;
}
