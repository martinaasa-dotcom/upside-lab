/**
 * One named loader per Growth panel, in a module of its own.
 *
 * Both `dynamic()` and the idle warm have to reach for the *same*
 * `import()` expression, or the bundler may put them in different chunk
 * groups and the warm quietly stops warming anything: measured on the real
 * build, the idle fetch ran, 44 chunks came down, and the first tap still
 * pulled a fresh one. That is why these are functions referenced twice
 * rather than two inline imports.
 *
 * They live here rather than in `GrowthRoom.tsx` because `Dashboard` needs
 * the calculator's loader for its warm, and importing it from the room
 * would pull the room's module into Dashboard's own chunk statically,
 * which is the `dynamic` boundary defeated in the course of trying to
 * optimise it. A module with nothing in it but two arrow functions costs
 * nothing to pull in.
 */

export const loadCompoundInterestSheet = () =>
  import("@/components/CompoundInterestSheet").then(
    (m) => m.CompoundInterestSheet
  );

export const loadRetirementSheet = () =>
  import("@/components/retirement/RetirementSheet").then(
    (m) => m.RetirementSheet
  );

export const loadGrowthRoom = () =>
  import("@/components/GrowthRoom").then((m) => m.GrowthRoom);
