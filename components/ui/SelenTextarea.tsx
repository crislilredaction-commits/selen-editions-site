import type { TextareaHTMLAttributes } from "react";

type SelenTextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement>;

export default function SelenTextarea(props: SelenTextareaProps) {
  return (
    <textarea
      {...props}
      style={{
        width: "100%",
        minHeight: 120,
        borderRadius: "var(--radius-md, 12px)",
        border: "1px solid var(--selen-border, rgba(120, 90, 60, 0.28))",
        background: "var(--selen-bg3, rgba(255, 248, 235, 0.72))",
        color: "var(--selen-text, #2b2118)",
        padding: "12px 14px",
        font: "inherit",
        lineHeight: 1.5,
        resize: "vertical",
        outline: "none",
        ...props.style,
      }}
    />
  );
}