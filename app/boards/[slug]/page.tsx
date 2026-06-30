import { PublicBoard } from "@/features/recruitment/components/public-board"

export default async function BoardPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  return <PublicBoard slug={slug} />
}
