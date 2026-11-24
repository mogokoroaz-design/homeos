import { NextResponse, type NextRequest } from "next/server";

// Passes the requested path to server components so the lock screen can return people to where
// they were going (e.g. a recipe shared from the iPhone share sheet) after unlocking.
export function middleware(req: NextRequest) {
  const headers = new Headers(req.headers);
  headers.set("x-homeos-path", req.nextUrl.pathname + req.nextUrl.search);
  return NextResponse.next({ request: { headers } });
}

export const config = { matcher: ["/((?!api|_next/static|_next/image|favicon|icon|apple-touch-icon|manifest|sw.js).*)"] };
