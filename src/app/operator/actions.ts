"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

export async function setOperatorAction(formData: FormData) {
  const name = formData.get("name") as string;
  const next = (formData.get("next") as string) || "/";
  if (!name) return;

  const cookieStore = await cookies();
  cookieStore.set("keloid_operator", name, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 12,
  });

  redirect(next);
}
