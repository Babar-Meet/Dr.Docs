import ConversionSections from "../components/conversions/ConversionSections";

// The Conversions hub: every conversion grouped by the file you start
// from. The section list itself is shared with the landing Any To Any block
// (ConversionSections), so both surfaces can never show a different pair set.
export default function ConversionsPage() {
  return (
    <main className="mx-auto w-full max-w-7xl px-4 pb-16 pt-8 sm:px-6 lg:px-8">
      <h1 className="font-display text-[36px] font-bold leading-[1.1] tracking-tight text-content">
        Conversions
      </h1>
      <p className="mt-3 max-w-2xl font-body text-[15px] leading-normal text-muted">
        Every conversion grouped by the file you start from, so the possible
        targets for one format all sit in that format's section. Tiles without
        a built tool yet show Coming soon.
      </p>

      <div className="mt-8 flex flex-col gap-8">
        <ConversionSections />
      </div>
    </main>
  );
}
