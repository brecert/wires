// deno-lint-ignore-file prefer-const
import { wire, signal, makeReactive, batch, Wire } from './wires.ts'
import { assertEquals } from "https://deno.land/std@0.166.0/testing/asserts.ts";

// This test doesn't test any specific behavior in this implementation, I just wanted to see if it works as expected
// some basic tests taken from preact
// these miss a lot of behavior but it's more or less what I want

Deno.test("preact: should not block writes after batching completed", () => {
  const a = signal("a");
  const b = signal("b");
  const c = signal("c");
  const d = wire($ => a($) + " " + b($) + " " + c($));

  let result;
  wire($ => (result = d($))).run();

  batch(() => {
    a("aa");
    b("bb");
  });
  c("cc");

  assertEquals(result, "aa bb cc")
})

Deno.test("preact: should not recompute dependencies unnecessarily", () => {
  let timesRan = 0
  let run = () => timesRan++
  const a = signal(0);
  const b = signal(0);
  const c = wire($ => {
    b($);
    run();
  });
  wire($ => {
    if (a($) === 0) {
      c($)
    }
  }).run()
  assertEquals(timesRan, 1)

  batch(() => {
    b(1)
    a(1)
  })
  assertEquals(timesRan, 1)
})

Deno.test("preact: should not recompute if the effect has been notified about changes, but no direct dependency has actually changed", () => {
  const s = signal(0);
  const c = wire(($) => {
    s($);
    return 0;
  });

  let timesRan = 0
  const run = ($: Wire) => {
    timesRan += 1
    c($)
  };

  wire(run).run();
  assertEquals(timesRan, 1);
  timesRan = 0

  s(1)
  assertEquals(timesRan, 1)
})


Deno.test("kitchen sink + caching", () => {
  let countSquaredCalled = 0
  let countSquaredPlusFiveCalled = 0

  const state = makeReactive({
    count: 45,
    countSquared: wire(($): number => {
      countSquaredCalled++
      return state.count($) ** 2;
    }),
    countSquaredPlusFive: wire(($): number => {
      countSquaredPlusFiveCalled++
      return state.countSquared($) + 5;
    }),
  });

  // Note that the computation has never run up to now. They're _lazy_.

  // Calling countSquaredPlusFive will run countSquared, since it's a dependency.
  assertEquals(state.countSquaredPlusFive(), 2030);
  assertEquals(countSquaredCalled, 1)
  assertEquals(countSquaredPlusFiveCalled, 1)

  // Calling countSquared does _no work_. It's not stale. The value is cached.
  assertEquals(state.countSquared(), 2025);
  assertEquals(countSquaredCalled, 1)
  assertEquals(countSquaredPlusFiveCalled, 1)

  // Updating the count does _no work_. The computations are _lazy_.
  state.count(10)
  assertEquals(countSquaredCalled, 1)
  assertEquals(countSquaredPlusFiveCalled, 1)
})