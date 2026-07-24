import { cookies } from "next/headers";

export async function getCurrentOperator(): Promise<string | null> {
  const cookieStore = await cookies();
  return cookieStore.get("keloid_operator")?.value ?? null;
}
