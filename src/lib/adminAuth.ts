import { cookies } from "next/headers";

export async function requireAdminOr401() {
  const cookieStore = await cookies();
  const isAdmin = cookieStore.get("admin")?.value === "1";
  return isAdmin;
}