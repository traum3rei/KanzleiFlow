import { CaseStatus, caseStatusLabels, MatterType, matterTypeLabels } from "@/lib/validations/case";

export function StatusBadge({ status }: { status: CaseStatus }) {
  const styles: Record<
    CaseStatus,
    { badge: string; dot: string }
  > = {
    DRAFT: {
      badge: "bg-zinc-100 text-zinc-900 border-zinc-300 dark:bg-zinc-800 dark:text-zinc-200 dark:border-zinc-700",
      dot: "bg-zinc-500",
    },
    IN_REVIEW: {
      badge: "bg-zinc-100 text-zinc-900 border-zinc-400 dark:bg-zinc-800 dark:text-zinc-100 dark:border-zinc-600",
      dot: "bg-zinc-900 dark:bg-zinc-100",
    },
    READY_FOR_NOTARIZATION: {
      badge: "bg-zinc-900 text-zinc-50 border-zinc-900 dark:bg-zinc-100 dark:text-zinc-950 dark:border-zinc-100",
      dot: "bg-zinc-100 dark:bg-zinc-950",
    },
    NOTARIZED: {
      badge: "bg-zinc-200 text-zinc-900 border-zinc-400 dark:bg-zinc-800 dark:text-zinc-100 dark:border-zinc-600",
      dot: "bg-zinc-700 dark:bg-zinc-300",
    },
    COMPLETED: {
      badge: "bg-zinc-100 text-zinc-700 border-zinc-300 dark:bg-zinc-900 dark:text-zinc-300 dark:border-zinc-800",
      dot: "bg-zinc-400",
    },
    ARCHIVED: {
      badge: "bg-zinc-100 text-zinc-600 border-zinc-200 dark:bg-zinc-900 dark:text-zinc-400 dark:border-zinc-800",
      dot: "bg-zinc-400",
    },
  };

  const style = styles[status] || styles.DRAFT;

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-[4px] text-xs font-mono font-medium border leading-none whitespace-nowrap ${style.badge}`}
    >
      <span className={`w-1.5 h-1.5 rounded-[1px] shrink-0 ${style.dot}`} />
      <span>{caseStatusLabels[status]}</span>
    </span>
  );
}

export function MatterTypeBadge({ matterType }: { matterType: MatterType }) {
  return (
    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-[4px] text-xs font-mono font-medium bg-zinc-100 text-zinc-800 dark:bg-zinc-900 dark:text-zinc-200 border border-zinc-300 dark:border-zinc-700 leading-none whitespace-nowrap">
      <span className="w-1.5 h-1.5 rounded-[1px] bg-zinc-400 shrink-0" />
      <span>{matterTypeLabels[matterType]}</span>
    </span>
  );
}
