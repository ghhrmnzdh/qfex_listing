import { motion } from "framer-motion";
import { enter, useStill } from "../anim";
import { IndexMark, GitHubIcon, REPO_URL } from "./Brand";

/**
 * Closing section — QFEX-style editorial headline (grotesk + italic serif) with
 * the outbound CTA. This study is independent; the exchange is QFEX.
 */
export default function Outro() {
  const still = useStill();
  const rise = (d = 0) => ({
    initial: enter({ opacity: 0, y: 22 }, still),
    whileInView: { opacity: 1, y: 0 },
    viewport: { once: true, margin: "-80px" },
    transition: { duration: 0.7, delay: d, ease: [0.16, 1, 0.3, 1] as const },
  });

  return (
    <section className="outro">
      <div className="outro-glow" aria-hidden />
      <div className="outro-inner">
        <motion.div className="outro-eyebrow" {...rise(0)}>
          <IndexMark size={18} />
          <span className="mono">THE LISTING INDEX</span>
        </motion.div>

        <h2 className="outro-title">
          <motion.span className="outro-line-a" {...rise(0.05)}>Made for quants,</motion.span>
          <motion.span className="outro-line-b" {...rise(0.13)}>by quants.</motion.span>
        </h2>

        <motion.p className="outro-sub" {...rise(0.2)}>
          An independent study of every market QFEX has listed — the numbers are on the table.
          The exchange runs 24/7, so the desk is always open.
        </motion.p>

        <motion.div className="outro-cta-row" {...rise(0.27)}>
          <a className="outro-cta" href="https://www.qfex.com" target="_blank" rel="noreferrer">
            Trade on QFEX <span aria-hidden>↗</span>
          </a>
          <a className="outro-link" href="https://x.com/QFEX" target="_blank" rel="noreferrer">
            @QFEX on X <span aria-hidden>↗</span>
          </a>
          <a className="outro-link outro-gh" href={REPO_URL} target="_blank" rel="noreferrer">
            <GitHubIcon size={16} /> View source
          </a>
        </motion.div>

        <motion.div className="outro-fine mono" {...rise(0.34)}>
          Independent &amp; unaffiliated · not investment advice · a study, made with respect for the tape.
        </motion.div>
      </div>
    </section>
  );
}
