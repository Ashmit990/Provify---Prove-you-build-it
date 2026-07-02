import * as React from "react";
import { cn } from "@/lib/utils";

const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => {
  return (
    <textarea
      className={cn(
        "flex min-h-32 w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-sm text-text placeholder:text-text-4 transition-all duration-200 focus-visible:outline-none focus-visible:border-blue focus-visible:ring-2 focus-visible:ring-blue-mid/40 disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      ref={ref}
      {...props}
    />
  );
});
Textarea.displayName = "Textarea";

export { Textarea };
