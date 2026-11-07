"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { loadAgencyFixture } from "../../../lib/evidence/agency-fixture";
import { buildReviewSnapshot } from "../../../lib/evidence/review-snapshot";
import { agencyReviewCookie, writeReviewDecision } from "../../../lib/evidence/review-state";

export async function saveDemoDecision(data: FormData) {
  const id = data.get("proposal");
  const decision = data.get("decision");
  if (typeof id !== "string" || (decision !== "accepted" && decision !== "rejected")) {
    redirect("/demo/review?review=invalid");
  }
  const review = buildReviewSnapshot(await loadAgencyFixture());
  if (data.get("version") !== review.version) redirect("/demo/review?review=changed");

  const jar = await cookies();
  const saved = writeReviewDecision(jar.get(agencyReviewCookie)?.value ?? null, review, id, decision);
  if (!saved) redirect("/demo/review?review=invalid");

  jar.set(agencyReviewCookie, saved, {
    httpOnly: true,
    sameSite: "lax",
    secure: (await headers()).get("x-forwarded-proto") === "https",
    path: "/demo/review",
    maxAge: 60 * 60 * 24 * 7,
  });
  redirect("/demo/review?review=saved");
}
