import { useEffect, useRef, type ReactNode } from "react";
export function RoomDialog({
  title,
  dialogKey,
  onClose,
  children,
}: {
  title: string;
  dialogKey: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const element = useRef<HTMLElement>(null),
    close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const prior = document.activeElement as HTMLElement | null,
      root = element.current!;
    root.scrollIntoView({ block: "center", behavior: "instant" });
    const focusables = () =>
      Array.from(
        root.querySelectorAll<HTMLElement>(
          "button:not(:disabled),input:not(:disabled),summary,select,[href]",
        ),
      ).filter((e) => e.getClientRects().length > 0);
    (
      root.querySelector<HTMLInputElement>("input[type=number]") ??
      focusables()[0]
    )?.focus({ preventScroll: true });
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        close.current();
      }
      if (e.key === "Tab") {
        const fs = focusables();
        if (e.shiftKey && document.activeElement === fs[0]) {
          e.preventDefault();
          fs.at(-1)?.focus();
        } else if (!e.shiftKey && document.activeElement === fs.at(-1)) {
          e.preventDefault();
          fs[0]?.focus();
        }
      }
    };
    root.addEventListener("keydown", key);
    return () => {
      root.removeEventListener("keydown", key);
      if (prior?.isConnected) prior.focus({ preventScroll: true });
    };
  }, [dialogKey]);
  return (
    <section
      ref={element}
      className="room-dialog"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      aria-describedby="room-overlay-deadlines"
    >
      <button
        type="button"
        className="room-dialog-close"
        aria-label="Watch the table"
        onClick={onClose}
      >
        ×
      </button>
      <div className="eyebrow">{title}</div>
      {children}
      <p id="room-overlay-deadlines" className="overlay-clock-note">
        The shared clock continues. Effects never pause play.
      </p>
    </section>
  );
}
