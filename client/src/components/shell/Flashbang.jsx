import { useTheme } from "../../theme/ThemeProvider.jsx";

// The midnight -> white guard overlay. Copy, countdown, progress width, and the
// one-way trigger are moved unchanged from App.jsx.
export default function Flashbang() {
  const { showFlashbang, flashCountdown, cancelFlashbang, requestWhite } = useTheme();

  if (!showFlashbang) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-ink/90 px-4 backdrop-blur-sm">
      <div className="w-full max-w-[480px] rounded-[8px] border border-borderDark bg-panel p-6 text-center shadow-[0_12px_32px_rgba(0,0,0,0.6)]">
        <p className="font-mono text-[11px] font-bold uppercase tracking-[0.2em] text-muted">Flashbang Warning</p>
        <h2 className="mt-2 font-display text-[28px] font-bold leading-none tracking-tight text-white">FLASHBANG INCOMING</h2>
        <p className="mt-3 font-body text-[14px] font-medium leading-[1.4] text-offWhite">
          You are about to leave the Midnight. White mode is 100% brightness. Your retinas may file a complaint.
        </p>
        <p className="mt-2 font-mono text-[12px] text-muted">Classic meme: protect your eyes. Sunglasses not included.</p>

        <div className="mt-5">
          <p className="font-display text-[48px] font-bold leading-none text-orange">{flashCountdown}</p>
          <p className="font-mono text-[11px] uppercase tracking-[0.1em] text-muted">seconds to blindness</p>
          <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-deep">
            <div
              className="h-full bg-orange transition-all duration-1000 ease-linear"
              style={{ width: `${(flashCountdown / 5) * 100}%` }}
            />
          </div>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={cancelFlashbang}
            className="rounded-[5px] border border-borderStrong bg-deep px-4 py-3 font-display text-[13px] font-bold text-white hover:bg-elevated"
          >
            Cancel - Keep Me Dark
          </button>
          <button
            type="button"
            onClick={requestWhite}
            className="rounded-[5px] bg-orange px-4 py-3 font-display text-[13px] font-bold text-black hover:bg-orangeSoft"
          >
            I Am Ready - Flash Me
          </button>
        </div>
        <p className="mt-3 font-mono text-[11px] text-muted">Auto-flash in {flashCountdown}s. Only shows when switching Dark to Light.</p>
      </div>
    </div>
  );
}
