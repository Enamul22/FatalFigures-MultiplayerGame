import { memo, useEffect, useState } from "react";
/** Only this small component ticks. The scene, scores and modal never subscribe. */
export const RoomClock = memo(function RoomClock({
  deadline,
  serverTime,
  stage,
  label,
}: {
  deadline: number;
  serverTime: number;
  stage: string;
  label: string;
}) {
  const [clock, setClock] = useState(() => ({
    now: serverTime,
    anchor: performance.now(),
  }));
  useEffect(() => {
    const anchor = performance.now();
    setClock({ now: serverTime, anchor });
    const timer = setInterval(
      () => setClock({ now: serverTime + performance.now() - anchor, anchor }),
      200,
    );
    return () => clearInterval(timer);
  }, [serverTime, deadline]);
  const seconds = deadline
    ? Math.max(0, Math.ceil((deadline - clock.now) / 1000))
    : 0;
  return (
    <div
      className={`room-clock ${seconds <= 10 ? "urgent" : ""}`}
      role="timer"
      aria-label={`${stage}: ${seconds} seconds remaining`}
    >
      <small>{label}</small>
      <b>
        {String(Math.floor(seconds / 60)).padStart(2, "0")}
        <i>:</i>
        {String(seconds % 60).padStart(2, "0")}
      </b>
      <span>{deadline ? "SHARED SERVER DEADLINE" : "MATCH COMPLETE"}</span>
    </div>
  );
});
