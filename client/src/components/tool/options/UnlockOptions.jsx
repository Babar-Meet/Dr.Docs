import Panel from "../../ui/Panel.jsx";
import TextInput from "../../ui/TextInput.jsx";

// Unlock has no other options. The password box exists because a locked PDF
// refuses everything else: the user types its original password here and the
// run opens the file with it. A wrong or missing password still fails.
export default function UnlockOptions({ password, setPassword }) {
  return (
    <Panel>
      <p className="font-display text-[12px] font-semibold uppercase tracking-[0.08em] text-muted">
        Password
      </p>
      <TextInput
        type="password"
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        placeholder="Original password, if the PDF is locked"
        className="mt-3"
      />
      <p className="mt-2 font-body text-xs text-muted">
        Needed only if a PDF asks for its password. Word, PowerPoint, Excel and
        ZIP files do not need it. A wrong password fails, and nothing is ever
        guessed or bypassed.
      </p>
    </Panel>
  );
}
