// Moved out of the old single-page tool shell. The container and bottom padding
// reproduce the inset the old <main> wrapper used to provide around the footer.
export default function Footer() {
  return (
    <div className="mx-auto max-w-7xl px-4 pb-6 sm:px-6 lg:px-8">
      <footer className="mt-8 border-t border-borderDark pt-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="font-mono text-[11px] text-muted">
            Dr.Docs - Midnight Orange - Black structure + white content + gray hierarchy + orange
            action
          </p>
          <p className="font-mono text-[11px] text-muted">
            DESIGN.md / THEME.md is the single source of truth
          </p>
        </div>
      </footer>
    </div>
  );
}
