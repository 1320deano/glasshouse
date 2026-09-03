import { notFound } from "next/navigation";
import { Room } from "@/components/Room";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";

export default async function RoomPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const store = getStore();
  const initial = await store.getRoom(projectId);
  if (!initial) notFound();
  return <Room initial={initial} mode={store.mode} />;
}
