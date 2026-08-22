import type { PlayMode } from "../storage/types";

const MODES: { id: PlayMode; label: string }[] = [
  { id: "sequential", label: "順再生" },
  { id: "shuffle", label: "シャッフル" },
  { id: "leastPlayed", label: "少ない順" },
];

type Props = {
  value: PlayMode;
  onChange: (mode: PlayMode) => void;
};

export function ModeToggle({ value, onChange }: Props) {
  return (
    <div className="mode-toggle" role="radiogroup" aria-label="再生モード">
      {MODES.map((mode) => (
        <button
          key={mode.id}
          type="button"
          role="radio"
          aria-checked={value === mode.id}
          className={value === mode.id ? "mode on" : "mode"}
          onClick={() => onChange(mode.id)}
        >
          {mode.label}
        </button>
      ))}
    </div>
  );
}
