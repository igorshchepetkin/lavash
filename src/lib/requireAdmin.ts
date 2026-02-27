import { cookies } from "next/headers";

export function requireAdmin() {
  const c = cookies().get("admin")?.value;
  if (c !== "1") throw new Error("NOT_ADMIN");
}