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
      badge: "bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/50 dark:text-amber-200 dark:border-amber-800",
      dot: "bg-amber-500",
    },
    READY_FOR_NOTARIZATION: {
      badge: "bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-200 dark:border-emerald-800",
      dot: "bg-emerald-500",
    },
    NOTARIZED: {
      badge: "bg-blue-50 text-blue-800 border-blue-200 dark:bg-blue-950/50 dark:text-blue-200 dark:border-blue-800",
      dot: "bg-blue-500",
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
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-lg text-sm font-sans font-medium border leading-5 whitespace-nowrap ${style.badge}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${style.dot}`} />
      <span>{caseStatusLabels[status]}</span>
    </span>
  );
}

const shortMatterLabels: Record<MatterType, string> = {
  REAL_ESTATE: "Immobilien", INHERITANCE: "Erbrecht", CORPORATE: "Gesellschaftsrecht",
  POWER_OF_ATTORNEY: "Vollmachten", MARRIAGE_FAMILY: "Familienrecht", OTHER: "Sonstiges",
};

export function MatterTypeBadge({ matterType }: { matterType: MatterType }) {
  return (
    <span title={matterTypeLabels[matterType]} className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-lg text-sm font-sans font-medium bg-zinc-100 text-zinc-800 dark:bg-zinc-900 dark:text-zinc-200 border border-zinc-300 dark:border-zinc-700 leading-none whitespace-nowrap">
      <span className="w-1.5 h-1.5 rounded-full bg-zinc-400 shrink-0" />
      <span>{shortMatterLabels[matterType]}</span>
    </span>
  );
}
