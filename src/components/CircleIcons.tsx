import type { ReactNode, SVGProps } from "react";

/**
 * Circle dock glyph: a ring of members around a solid node.
 *
 * Same 24px Lucide stroke as the rest of the bar. `r = 10` is Lucide's own
 * circle, so this cell is not a size smaller than Home or Growth. `pathLength`
 * keeps eight dashes even at 16px and 20px, so the leftover fraction in a
 * raw dasharray cannot pile up on one side. The filled discs in `People.tsx`
 * were the previous mark.
 */
export type CircleIconProps = SVGProps<SVGSVGElement> & {
  size?: number;
  color?: string;
};

function NavSvg({
  size = 24,
  width,
  height,
  strokeWidth = 2,
  color = "currentColor",
  className,
  children,
  ...rest
}: CircleIconProps & { children: ReactNode }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      {...rest}
      width={width ?? size}
      height={height ?? size}
      viewBox="0 0 24 24"
      stroke={color}
      strokeWidth={strokeWidth}
      className={className}
    >
      {children}
    </svg>
  );
}

export function CircleNavIcon(props: CircleIconProps) {
  return (
    <NavSvg {...props}>
      <circle
        cx="12"
        cy="12"
        r="10"
        fill="none"
        pathLength={8}
        strokeDasharray="0.34 0.66"
      />
      <circle cx="12" cy="12" r="3" fill="currentColor" stroke="none" />
    </NavSvg>
  );
}
