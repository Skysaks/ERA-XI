import type { Metadata } from "next";
import { decodeChallenge } from "@/engine";
import { ClientGame } from "../../ClientGame";

type Params = Promise<{ token: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { token } = await params;
  const d = decodeChallenge(token);
  if (!d.ok) return { title: "ERA XI" };
  const who = d.challenge.creatorName ?? "A friend";
  const pts = d.challenge.creatorResult.points;
  const title = `${who} scored ${pts}/${d.challenge.creatorResult.maxPoints} on ERA XI`;
  const description = "Same 11 draws. Different decisions. Can you beat this XI?";
  return {
    title,
    description,
    openGraph: { title, description, type: "website" },
    twitter: { card: "summary_large_image", title, description },
    robots: { index: false },
  };
}

export default async function ChallengePage({ params }: { params: Params }) {
  const { token } = await params;
  return <ClientGame token={token} />;
}
