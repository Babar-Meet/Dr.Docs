export default function Panel({ className = "", children }) {
  return (
    <section
      className={`rounded-[6px] border border-borderDark bg-panel p-4 ${className}`.trim()}
    >
      {children}
    </section>
  );
}
