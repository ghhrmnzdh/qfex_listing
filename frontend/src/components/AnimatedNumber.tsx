import { useEffect, useRef } from "react";
import { animate, useInView } from "framer-motion";
import { useStill } from "../anim";

interface Props {
  value: number;
  format: (v: number) => string;
  duration?: number;
  className?: string;
  style?: React.CSSProperties;
  /** start the tween only when scrolled into view */
  onView?: boolean;
}

/** Tweens the displayed number whenever `value` changes (or on first view). */
export default function AnimatedNumber({
  value,
  format,
  duration = 0.9,
  className,
  style,
  onView = false,
}: Props) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: "-40px" });
  const from = useRef(0);
  const still = useStill();

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (still) {
      node.textContent = format(value);
      from.current = value;
      return;
    }
    if (onView && !inView) return;
    const controls = animate(from.current, value, {
      duration,
      ease: [0.16, 1, 0.3, 1],
      onUpdate(v) {
        node.textContent = format(v);
      },
    });
    from.current = value;
    return () => controls.stop();
  }, [value, inView, onView, duration, format, still]);

  return (
    <span ref={ref} className={className} style={style}>
      {format(onView && !still ? 0 : value)}
    </span>
  );
}
