import './Heartbeat.css';

/** EKG 軌跡：flat → QRS spike → flat → 小 bump → flat */
export const EKG_PATH = 'M0,42 L60,42 L80,18 L92,68 L104,42 L145,42 L158,34 L172,42 L230,42';

type HeartbeatProps = {
  /** onDark：白底線（Home hero）；onLight：主色線（Login） */
  tone?: 'onDark' | 'onLight';
  className?: string;
};

export default function Heartbeat({ tone = 'onLight', className = '' }: HeartbeatProps) {
  return (
    <div
      className={`ekg ekg--${tone}${className ? ` ${className}` : ''}`}
      aria-hidden="true"
    >
      <div className="ekg__canvas">
        <svg
          className="ekg__svg"
          width={230}
          height={84}
          viewBox="0 0 230 84"
        >
          <path className="ekg__line" d={EKG_PATH} fill="none" />
        </svg>
        <span
          className="ekg__dot"
          style={{ offsetPath: `path("${EKG_PATH}")` }}
        />
      </div>
    </div>
  );
}
