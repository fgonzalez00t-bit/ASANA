import type { Profile } from "@/lib/types";
import { displayName, initials } from "@/lib/utils";

const COLORS = ["bg-indigo-500", "bg-pink-500", "bg-amber-500", "bg-emerald-500", "bg-sky-500", "bg-violet-500"];

const DIMS = { xs: "h-5 w-5 text-[9px]", sm: "h-6 w-6 text-[10px]", md: "h-8 w-8 text-xs" };

export function Avatar({ profile, size = "md" }: { profile?: Profile | null; size?: "xs" | "sm" | "md" }) {
  const dims = DIMS[size];
  if (!profile) {
    return <span className={`${dims} inline-flex shrink-0 items-center justify-center rounded-full border border-dashed border-slate-300 text-slate-400`}>?</span>;
  }
  const color = COLORS[[...profile.id].reduce((a, c) => a + c.charCodeAt(0), 0) % COLORS.length];
  return (
    <span title={displayName(profile)} className={`${dims} ${color} inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white`}>
      {initials(profile)}
    </span>
  );
}
