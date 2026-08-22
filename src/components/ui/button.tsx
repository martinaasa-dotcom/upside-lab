import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Slot } from "radix-ui"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center rounded-lg border border-transparent bg-clip-padding text-sm font-medium whitespace-nowrap transition-all duration-150 ease-out outline-none select-none hover:scale-[1.015] focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 active:not-aria-[haspopup]:translate-y-px active:not-aria-[haspopup]:scale-100 disabled:pointer-events-none disabled:opacity-50 disabled:hover:scale-100 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        /*
         * Disabled drops the accent entirely rather than dimming it.
         *
         * `disabled:opacity-50` from the base is right for every other
         * variant, but on a `--primary` fill it is the mud described in
         * `SEGMENTED_ITEM`: the app's yellow is a deliberately low-chroma
         * warm one, and half of it over a near-black field is khaki, with
         * the near-black label on top going to a washed brown. An empty
         * form's "Check" or "Add these names" read as a yellow button that
         * had gone wrong rather than as one that is not ready. A neutral
         * surface with muted type says "not yet" and stays legible, and it
         * follows the rule the rest of the app follows: the accent arrives
         * at full lightness or it stays out.
         *
         * `disabled:opacity-100` undoes the base rather than compounding
         * with it; without it the neutral fill would be dimmed again.
         */
        default:
          "bg-primary text-primary-foreground shadow-xs hover:bg-[color-mix(in_oklch,var(--primary),white_10%)] disabled:bg-secondary disabled:text-muted-foreground disabled:opacity-100 disabled:shadow-none",
        /*
         * Hover *lifts* the surface it is on; it never replaces it.
         *
         * These used to hover to `bg-muted`, an opaque grey. On anything
         * translucent — every `.glass` card, every well — that swapped the
         * surface out from under the content, so the base tone vanished
         * the moment you pointed at it and the card stopped reading as
         * glass. A translucent white overlay brightens whatever is
         * already there instead, which is how a lit surface behaves and
         * is the one hover vocabulary the whole app now shares.
         */
        outline:
          "border-border bg-background hover:bg-foreground/[0.06] hover:text-foreground aria-expanded:bg-foreground/[0.06] aria-expanded:text-foreground dark:border-input dark:bg-input/30",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-[color-mix(in_oklch,var(--secondary),var(--foreground)_5%)] aria-expanded:bg-secondary aria-expanded:text-secondary-foreground",
        ghost:
          "hover:bg-foreground/[0.08] hover:text-foreground aria-expanded:bg-foreground/[0.08] aria-expanded:text-foreground",
        destructive:
          "bg-destructive/10 text-destructive hover:bg-destructive/20 focus-visible:border-destructive/40 focus-visible:ring-destructive/20 dark:bg-destructive/20 dark:hover:bg-destructive/30 dark:focus-visible:ring-destructive/40",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default:
          "h-8 gap-1.5 px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2",
        xs: "h-6 gap-1 rounded-[min(var(--radius-md),10px)] px-2 text-xs in-data-[slot=button-group]:rounded-lg has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-7 gap-1 rounded-[min(var(--radius-md),12px)] px-2.5 text-sm in-data-[slot=button-group]:rounded-lg has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3.5",
        lg: "h-9 gap-1.5 px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2",
        icon: "size-8",
        "icon-xs":
          "size-6 rounded-[min(var(--radius-md),10px)] in-data-[slot=button-group]:rounded-lg [&_svg:not([class*='size-'])]:size-3",
        "icon-sm":
          "size-7 rounded-[min(var(--radius-md),12px)] in-data-[slot=button-group]:rounded-lg",
        "icon-lg": "size-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot.Root : "button"

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
