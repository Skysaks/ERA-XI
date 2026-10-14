import type { Metadata } from "next";
import { ClientGame } from "../../ClientGame";

type Params = Promise<{ code: string }>;

export const metadata: Metadata = {
  title: "Live Duel · ERA XI",
  description: "Same draft. Picks at once. Better XI wins.",
  openGraph: { title: "You're invited to a Live Duel on ERA XI", description: "Same 11 draws. Picks at the same time. Better XI wins.", type: "website" },
  robots: { index: false },
};

export default async function RoomPage({ params }: { params: Params }) {
  const { code } = await params;
  return <ClientGame room={code.toLowerCase()} />;
}
