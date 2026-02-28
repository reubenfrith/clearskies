interface Props {
  content: string;
  children: React.ReactNode;
  position?: "top" | "bottom";
}

/**
 * Lightweight hover tooltip. Wraps any inline element.
 * Uses Tailwind named-group so it never conflicts with parent groups.
 */
export function Tooltip({ content, children, position = "top" }: Props) {
  return (
    <span className="relative inline-flex group/tip">
      {children}
      <span
        className={`pointer-events-none absolute z-50 w-max max-w-[220px] rounded bg-gray-800 px-2 py-1.5 text-xs text-white opacity-0 group-hover/tip:opacity-100 transition-opacity whitespace-normal leading-relaxed text-center ${
          position === "top"
            ? "bottom-full left-1/2 -translate-x-1/2 mb-2"
            : "top-full left-1/2 -translate-x-1/2 mt-2"
        }`}
      >
        {content}
        <span
          className={`absolute left-1/2 -translate-x-1/2 border-4 border-transparent ${
            position === "top" ? "top-full border-t-gray-800" : "bottom-full border-b-gray-800"
          }`}
        />
      </span>
    </span>
  );
}
