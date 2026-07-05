import { motion } from "framer-motion";
import type { HorizonKey } from "../types";
import { HORIZON_SHORT, HORIZON_LABELS } from "../lib";

interface Props {
  horizons: HorizonKey[];
  value: HorizonKey;
  onChange: (h: HorizonKey) => void;
}

export default function HorizonScrubber({ horizons, value, onChange }: Props) {
  return (
    <div className="scrubber" role="tablist" aria-label="Return horizon">
      {horizons.map((h) => {
        const active = h === value;
        return (
          <button
            key={h}
            role="tab"
            aria-selected={active}
            className={`scrub-btn ${active ? "active" : ""}`}
            onClick={() => onChange(h)}
            title={HORIZON_LABELS[h]}
          >
            {active && (
              <motion.span
                layoutId="scrub-pill"
                className="scrub-pill"
                transition={{ type: "spring", stiffness: 420, damping: 34 }}
              />
            )}
            <span className="scrub-label mono">{HORIZON_SHORT[h]}</span>
          </button>
        );
      })}
    </div>
  );
}
