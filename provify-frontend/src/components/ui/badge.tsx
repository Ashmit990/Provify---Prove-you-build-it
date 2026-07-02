import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors duration-200",
  {
    variants: {
      variant: {
        source:
          "border-blue-mid bg-blue-dim text-blue-text font-mono-tag",
        score: "border-amber-mid bg-amber-dim text-amber-text",
        neutral: "border-border bg-surface-2 text-text-3",
        success: "border-green-mid bg-green-dim text-green-text",
        warning: "border-red-mid bg-red-dim text-red-text",
      },
    },
    defaultVariants: { variant: "neutral" },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <span className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants };
