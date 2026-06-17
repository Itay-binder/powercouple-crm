"use client";

type Props = {
  rating: number;
  size?: number;
  interactive?: boolean;
  onRate?: (r: number) => void;
};

export default function StarRating({ rating, size = 20, interactive = false, onRate }: Props) {
  return (
    <span style={{ display: "inline-flex", gap: 2 }}>
      {[1, 2, 3, 4, 5].map((star) => (
        <span
          key={star}
          onClick={() => interactive && onRate?.(star)}
          style={{
            fontSize: size,
            color: star <= Math.round(rating) ? "#f59e0b" : "#4b5563",
            cursor: interactive ? "pointer" : "default",
            lineHeight: 1,
            userSelect: "none",
          }}
        >
          ★
        </span>
      ))}
    </span>
  );
}