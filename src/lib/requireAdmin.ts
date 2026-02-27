import { cookies } from "next/headers";

export async function requireAdmin() {
  const cookieStore = await cookies();
  const c = cookieStore.get("admin")?.value;
  if (c !== "1") throw new Error("NOT_ADMIN");
}