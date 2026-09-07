import { notFound } from 'next/navigation';
import { prisma } from '@/db/client';
import { EditForm } from './edit-form';

// ---------------------------------------------------------------------------
// Server component: loads item data, passes to client form
// ---------------------------------------------------------------------------

export default async function EditPage(props: {
  params: Promise<{ itemId: string }>;
}) {
  const { itemId } = await props.params;

  const item = await prisma.item.findUnique({
    where: { id: itemId },
    include: { card: true },
  });

  if (!item) notFound();

  // Serialize the data for the client component
  const card = item.card;
  const initialData = {
    itemId: item.id,
    // Card identity
    year: card?.year ?? null,
    manufacturer: card?.manufacturer ?? null,
    setName: card?.setName ?? null,
    subset: card?.subset ?? null,
    cardNumber: card?.cardNumber ?? null,
    players: card?.players as { name: string; team: string | null; position: string | null }[] | null,
    parallel: card?.parallel ?? null,
    printRun: card?.printRun ?? null,
    isAuto: card?.isAuto ?? false,
    autoType: card?.autoType ?? null,
    isMemorabilia: card?.isMemorabilia ?? false,
    isRookie: card?.isRookie ?? false,
    variation: card?.variation ?? null,
    licensed: card?.licensed ?? 'unknown',
    cardsightCardId: card?.cardsightCardId ?? null,
    cardsightParallelId: card?.cardsightParallelId ?? null,
    referenceImageUrl: card?.referenceImageUrl ?? null,
    // Item fields
    serialNumber: item.serialNumber,
    conditionKind: item.conditionKind,
    rawConditionTier: item.rawConditionTier,
    grader: item.grader,
    grade: item.grade != null ? Number(item.grade) : null,
    gradeLabel: item.gradeLabel,
    autoGrade: item.autoGrade != null ? Number(item.autoGrade) : null,
    certNumber: item.certNumber,
    storage: item.storage,
    acquiredOn: item.acquiredOn
      ? new Date(item.acquiredOn).toISOString().split('T')[0]
      : null,
    acquiredVia: item.acquiredVia,
    costPriceCents: item.costPriceCents,
    costTaxCents: item.costTaxCents,
    costShippingCents: item.costShippingCents,
    costFeesCents: item.costFeesCents,
    costGradingCents: item.costGradingCents,
    notes: item.notes,
  };

  return <EditForm initialData={initialData} />;
}
