/**
 * The dither that makes the ambient field smooth, and the only reason it
 * exists is that eight bits are not enough for this room.
 *
 * The field is a set of very low alpha lobes on a true black page, so the
 * whole ramp is spent in the bottom of the range: measured off the real
 * landing page, the warm lobe travels 36 luminance levels of 255 across
 * 840px and the cool one 31. Thirty-odd levels over eight hundred pixels
 * is a step every twenty-three pixels, and a 1/255 step twenty-three
 * pixels wide is not a gradient, it is a contour line. That is the ringing
 * a reader sees around both corners of the signed-out page, and no amount
 * of re-shaping the stops fixes it: the levels are not there to be spent.
 *
 * So the field gets a dither, the same answer as in audio and in print.
 * One bit of noise per pixel breaks the boundary between two levels into a
 * scatter either side of it, so there is no continuous edge left for the
 * eye to trace. It cannot put back levels the format does not have, and it
 * is not meant to: the mean is still a staircase, but a riser is only a
 * contour while it is clean, and this buries every riser under the grain.
 *
 * The amplitude is TWO levels, and that number was measured rather than
 * picked. At one level the rings were softened and still findable; at two
 * they are gone; at three the grain itself starts to read as texture on a
 * dark screen, which is trading one artefact for another. Measured on the
 * real page, the edge of a riser went from 0.29 of the local pixel spread
 * to 0.13, which is to say from the loudest thing in that part of the
 * frame to well under the noise.
 *
 * Three things about the way it is built, all of which matter:
 *
 * It is SIGNED. Every CSS way of laying grain over a page adds light:
 * `plus-lighter` at an amplitude that does anything measurable lifts this
 * page's black by 1.6 levels, and `--background` here is `oklch(0 0 0)`,
 * so that is the true black the whole product is built on turned grey.
 * Inside a filter chain the noise can be added and half its amplitude
 * subtracted again, which is a mean of exactly zero. Measured lift on the
 * unlit part of the page: 0.000.
 *
 * It is CLIPPED to what the field actually paints. Both `feComposite`
 * terms are masked by `SourceAlpha`, so a pixel the lobes never reach is
 * returned untouched rather than dithered around zero, where the negative
 * half would clip and leave a lift behind. This is what keeps the black
 * between the lobes at 0 rather than at 0.5.
 *
 * It is ONE OCTAVE at a high base frequency, which is grain rather than
 * clouds. A low frequency noise would swap one visible pattern for
 * another.
 *
 * `filter` lives in CSS (`.page-frame::before`), and the
 * filter itself has to live in the document:
 * Safari does not resolve a filter referenced from a data URI, so an
 * inline definition is the only form that works on an iPhone. It renders
 * once, from the root layout, and paints nothing.
 */
export function AmbientDither() {
  return (
    <svg
      aria-hidden
      focusable="false"
      width="0"
      height="0"
      style={{ position: "absolute", width: 0, height: 0 }}
    >
      <filter
        id="ambient-dither"
        x="0"
        y="0"
        width="100%"
        height="100%"
        colorInterpolationFilters="sRGB"
      >
        <feTurbulence
          type="fractalNoise"
          baseFrequency="0.8"
          numOctaves="1"
          seed="17"
          result="noise"
        />
        {/*
          * Round the noise to one bit so every pixel moves by exactly the
          * amplitude, up or down, rather than by a bell curve whose tail
          * is three times it. Raw turbulence spreads about 0.13 of full
          * scale, so reaching this amplitude with it would need peaks four
          * times as loud for the same effect.
          */}
        <feComponentTransfer in="noise" result="bits">
          <feFuncR type="discrete" tableValues="0 1" />
        </feComponentTransfer>
        {/*
          * Anywhere the field paints at all, this is 1. It is the mask
          * both halves of the dither are clipped to, so they cover exactly
          * the same pixels and cannot leave a bias behind at the edge.
          */}
        <feComponentTransfer in="SourceAlpha" result="lit">
          <feFuncA type="linear" slope="255" />
        </feComponentTransfer>
        {/* + 4/255 where the bit is set */}
        <feColorMatrix
          in="bits"
          type="matrix"
          result="grain"
          values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0.016 0 0 0 0"
        />
        <feComposite in="grain" in2="lit" operator="in" result="grainLit" />
        {/* - 2/255 everywhere the grain could land, so the mean is zero */}
        <feColorMatrix
          in="lit"
          type="matrix"
          result="half"
          values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 0.008 0"
        />
        <feComposite
          in="SourceGraphic"
          in2="grainLit"
          operator="arithmetic"
          k1="0"
          k2="1"
          k3="1"
          k4="0"
          result="up"
        />
        <feComposite
          in="up"
          in2="half"
          operator="arithmetic"
          k1="0"
          k2="1"
          k3="-1"
          k4="0"
        />
      </filter>

    </svg>
  );
}
