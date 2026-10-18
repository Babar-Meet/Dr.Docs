export default function LimitsCard() {
  return (
    <section className="rounded-[6px] border border-borderDark bg-panel p-3">
      <p className="font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-muted">
        Limits
      </p>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <div className="rounded-[5px] bg-deep px-2 py-2 text-center">
          <p className="font-display text-sm font-bold text-content">50 MB</p>
          <p className="font-mono text-[11px] text-muted">per file</p>
        </div>
        <div className="rounded-[5px] bg-deep px-2 py-2 text-center">
          <p className="font-display text-sm font-bold text-content">200</p>
          <p className="font-mono text-[11px] text-muted">max files</p>
        </div>
      </div>
    </section>
  );
}
