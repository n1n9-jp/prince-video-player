import type { PlayMode } from "../storage/types";

const MODES: { id: PlayMode; label: string }[] = [
  { id: "sequential", label: "順再生" },
  { id: "shuffle", label: "シャッフル" },
  { id: "leastPlayed", label: "少ない順" },
];

type Props = {
  value: PlayMode;
  autoplayNext: boolean;
  onChange: (mode: PlayMode) => void;
  onAutoplayNextChange: (value: boolean) => void;
};

export function ModeToggle({ value, autoplayNext, onChange, onAutoplayNextChange }: Props) {
  return (
    <div className="toolbar">
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
      <button
        type="button"
        className={autoplayNext ? "switch on" : "switch"}
        role="switch"
        aria-checked={autoplayNext}
        onClick={() => onAutoplayNextChange(!autoplayNext)}
      >
        <span className="switch-track" aria-hidden="true">
          <span className="switch-knob" />
        </span>
        連続再生
      </button>
    </div>
  );
}
