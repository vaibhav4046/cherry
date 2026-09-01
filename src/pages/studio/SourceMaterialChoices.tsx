interface SourceMaterialChoicesProps {
  onPasteTranscript: () => void;
  onTranscribeWhilePlaying?: () => void;
  onRunnerFetch?: () => void;
  busy?: boolean;
  compact?: boolean;
}

export function SourceMaterialChoices({
  onPasteTranscript,
  onTranscribeWhilePlaying,
  onRunnerFetch,
  busy = false,
  compact = false,
}: SourceMaterialChoicesProps) {
  const buttonClass = `btn${compact ? ' btn-sm' : ''}`;
  return (
    <div
      className={compact ? 'row' : 'stack'}
      role="group"
      aria-label="Ways to add material"
      style={{ gap: compact ? 6 : 'var(--sp-3)', flexWrap: 'wrap' }}
    >
      <button type="button" className={`${buttonClass}${compact ? '' : ' btn-primary'}`} onClick={onPasteTranscript}>
        Paste transcript
      </button>
      {onTranscribeWhilePlaying ? (
        <button type="button" className={buttonClass} onClick={onTranscribeWhilePlaying}>
          Transcribe locally
        </button>
      ) : null}
      {onRunnerFetch ? (
        <button type="button" className={buttonClass} disabled={busy} onClick={onRunnerFetch}>
          Fetch with runner
        </button>
      ) : null}
    </div>
  );
}
