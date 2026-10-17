import ToolSection from "./ToolSection";

export default function ToolGrid({ groups, hub }) {
  return (
    <div className="space-y-10 pt-8">
      {groups.map((group) => (
        <ToolSection key={group.key} group={group} hub={hub} />
      ))}
    </div>
  );
}
