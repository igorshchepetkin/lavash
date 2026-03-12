import { redirect } from "next/navigation";

export default async function TournamentIndexPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/admin/t/${id}/registrations`);
}
