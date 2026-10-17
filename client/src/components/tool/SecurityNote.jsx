import { ShieldAlert } from "lucide-react";

export default function SecurityNote() {
  return (
    <section className="rounded-[6px] border border-warning/30 bg-warningBg p-3">
      <p className="flex items-start gap-2 font-body text-[13px] font-medium leading-[1.4] text-warningText">
        <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
        Security policy: strong encryption, password protection, and DRM are never bypassed.
      </p>
    </section>
  );
}
