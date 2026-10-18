import Panel from "../../ui/Panel.jsx";
import TextInput from "../../ui/TextInput.jsx";

export default function ProtectOptions({ password, setPassword }) {
  return (
    <Panel>
      <p className="font-display text-[12px] font-semibold uppercase tracking-[0.08em] text-muted">
        Protection Password
      </p>
      <TextInput
        type="password"
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        placeholder="Choose a password"
        className="mt-3"
      />
      <p className="mt-2 font-body text-xs text-muted">
        256-bit AES encryption is applied to every PDF. The password is used for
        this job only and is never stored.
      </p>
    </Panel>
  );
}
