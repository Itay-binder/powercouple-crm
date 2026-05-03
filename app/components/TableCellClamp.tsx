"use client";

import { useCallback, useLayoutEffect, useRef, useState } from "react";

type Props = {
  children: React.ReactNode;
  /** ללא הגבלה — למשל טלפון בשורה אחת */
  noClamp?: boolean;
  /** ברירת מחדל 15vh */
  maxVh?: number;
};

const TOL = 4;

/**
 * מגביל גובה תא בטבלה; אם התוכן חורג — «הצג עוד» / «הצג פחות».
 */
export function TableCellClamp({ children, noClamp, maxVh = 15 }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [showMore, setShowMore] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const measure = useCallback(() => {
    if (noClamp || expanded) return;
    const el = rootRef.current;
    if (!el) return;
    const sh = el.scrollHeight;
    const ch = el.clientHeight;
    setShowMore(sh > ch + TOL);
  }, [noClamp, expanded]);

  useLayoutEffect(() => {
    measure();
  }, [measure, children]);

  useLayoutEffect(() => {
    if (noClamp) return;
    const el = rootRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => measure());
    ro.observe(el);
    return () => ro.disconnect();
  }, [noClamp, measure]);

  useLayoutEffect(() => {
    if (noClamp) return;
    const onResize = () => measure();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [noClamp, measure]);

  if (noClamp) {
    return <>{children}</>;
  }

  return (
    <div style={{ width: "100%", position: "relative" }}>
      <div
        ref={rootRef}
        style={{
          maxHeight: expanded ? undefined : `${maxVh}vh`,
          overflow: expanded ? "visible" : "hidden",
          width: "100%",
        }}
      >
        {children}
      </div>
      {!expanded && showMore ? (
        <>
          <div
            aria-hidden
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              bottom: 0,
              height: 40,
              background: "linear-gradient(to top, #ffffff 35%, rgba(255,255,255,0))",
              pointerEvents: "none",
            }}
          />
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setExpanded(true);
            }}
            style={{
              position: "absolute",
              bottom: 2,
              left: "50%",
              transform: "translateX(-50%)",
              border: "1px solid #e5e7eb",
              background: "#fff",
              color: "#4c1d95",
              fontWeight: 800,
              fontSize: 11,
              padding: "4px 12px",
              borderRadius: 8,
              cursor: "pointer",
              boxShadow: "0 1px 2px rgba(0,0,0,0.06)",
              zIndex: 2,
            }}
          >
            הצג עוד
          </button>
        </>
      ) : null}
      {expanded ? (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setExpanded(false);
          }}
          style={{
            marginTop: 6,
            border: "1px solid #e5e7eb",
            background: "#f9fafb",
            color: "#4b5563",
            fontWeight: 700,
            fontSize: 11,
            padding: "4px 12px",
            borderRadius: 8,
            cursor: "pointer",
            display: "block",
          }}
        >
          הצג פחות
        </button>
      ) : null}
    </div>
  );
}
