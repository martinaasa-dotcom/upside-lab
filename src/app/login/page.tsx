import { LOGIN_METADATA } from "@/lib/site-metadata";

export const metadata = LOGIN_METADATA;

/**
 * `/login` renders nothing of its own, and that is not an oversight.
 *
 * It is one of `BOOK_ROOM_PATHS`, so `WorkspaceShell` answers this address
 * with the book room and never with this file's return value. A page
 * component written here is simply never drawn, which cost an hour to
 * work out once, so it is written down.
 *
 * What a signed-out reader sees is decided by `SignInGate`, which draws
 * the compact sign-in on this path rather than the whole product page:
 * this is where the Google callback sends a handshake that broke, and
 * answering a person whose sign-in just failed with nine screens of
 * marketing, the red sentence buried a hundred and forty pixels under the
 * button, is the wrong screen for the one reader this URL is certain to
 * get.
 *
 * The metadata above is the reason the file exists at all: the title, the
 * description and the canonical for this URL.
 */
export default function LoginPage() {
  return null;
}
