import { constantTimeCompare } from "./utils";

export function isAuthorized(request: Request, token: string): boolean {
  if (!token) return false;
  const authHeader = request.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return false;
  return constantTimeCompare(authHeader.slice(7), token);
}
