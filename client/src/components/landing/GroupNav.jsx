export default function GroupNav({ groups }) {
  return (
    <nav
      aria-label="Tool categories"
      className="border-y border-borderDark py-4"
    >
      <ul className="flex flex-wrap items-center gap-2">
        {groups.map((group) => {
          const availableCount = group.tools.filter((tool) => tool.available).length;

          return (
            <li key={group.key}>
              <a
                href={`#${group.key}`}
                title={`${group.title} - ${group.blurb}`}
                className="inline-flex items-center gap-2 rounded-full border border-borderStrong bg-panel px-2.5 py-1 font-body text-xs font-semibold text-offWhite transition hover:border-orange hover:text-orange"
              >
                {group.title}
                <span className="font-mono text-[11px] font-normal text-muted">
                  {availableCount} of {group.tools.length}
                </span>
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
