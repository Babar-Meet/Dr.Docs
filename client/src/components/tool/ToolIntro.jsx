export default function ToolIntro({ tool }) {
  return (
    <header className="text-center">
      <h1 className="font-display text-[36px] font-bold leading-tight text-white">
        {tool.label}
      </h1>
      <p className="mx-auto mt-2 max-w-[52ch] font-body text-[16px] font-medium leading-normal text-offWhite">
        {tool.help}
      </p>
    </header>
  );
}
