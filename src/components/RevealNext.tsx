interface Props {
  label: string;
  ms: number;
  onClick: () => void;
}

/** "Next" after an answer: a bar drains while the answer is up, and tapping skips the wait. */
export function RevealNext({ label, ms, onClick }: Props) {
  return (
    <button className="tv-next reveal-next" onClick={onClick}>
      {label}
      <i aria-hidden style={{ animationDuration: `${ms}ms` }} />
    </button>
  );
}
