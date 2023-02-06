// deno-lint-ignore-file prefer-const
import { batch, computed, makeReactive, signal, Wire } from "./wires.ts";
import { assertEquals } from "https://deno.land/std@0.166.0/testing/asserts.ts";

// This test doesn't test any specific behavior in this implementation, I just wanted to see if it works as expected
// some basic tests taken from preact
// these miss a lot of behavior but it's more or less what I want

Deno.test("preact: should not block writes after batching completed", () => {
  const a = signal("a");
  const b = signal("b");
  const c = signal("c");
  const d = computed(() => a() + " " + b() + " " + c());

  let result;
  computed(() => (result = d())).run();

  batch(() => {
    a("aa");
    b("bb");
  });
  c("cc");

  assertEquals(result, "aa bb cc");
});

Deno.test("preact: should not recompute dependencies unnecessarily", () => {
  let timesRan = 0;
  let run = () => timesRan++;
  const a = signal(0);
  const b = signal(0);
  const c = computed(() => {
    b();
    run();
  });
  computed(() => {
    if (a() === 0) {
      c();
    }
  }).run();
  assertEquals(timesRan, 1);

  batch(() => {
    b(1);
    a(1);
  });
  assertEquals(timesRan, 1);
});

Deno.test("preact: should not recompute if the effect has been notified about changes, but no direct dependency has actually changed", () => {
  const s = signal(0);
  const c = computed(() => {
    s();
    return 0;
  });

  let timesRan = 0;
  const run = () => {
    timesRan += 1;
    c();
  };

  computed(run).run();
  assertEquals(timesRan, 1);
  timesRan = 0;

  s(1);
  assertEquals(timesRan, 1);
});

Deno.test("kitchen sink + caching", () => {
  let countSquaredCalled = 0;
  let countSquaredPlusFiveCalled = 0;

  const state = makeReactive({
    count: 45,
    countSquared: computed((): number => {
      countSquaredCalled++;
      return state.count() ** 2;
    }),
    countSquaredPlusFive: computed((): number => {
      countSquaredPlusFiveCalled++;
      return state.countSquared() + 5;
    }),
  });

  // Note that the computation has never run up to now. They're _lazy_.

  // Calling countSquaredPlusFive will run countSquared, since it's a dependency.
  assertEquals(state.countSquaredPlusFive(), 2030);
  assertEquals(countSquaredCalled, 1);
  assertEquals(countSquaredPlusFiveCalled, 1);

  // Calling countSquared does _no work_. It's not stale. The value is cached.
  assertEquals(state.countSquared(), 2025);
  assertEquals(countSquaredCalled, 1);
  assertEquals(countSquaredPlusFiveCalled, 1);

  // Updating the count does _no work_. The computations are _lazy_.
  state.count(10);
  assertEquals(countSquaredCalled, 1);
  assertEquals(countSquaredPlusFiveCalled, 1);
});

Deno.test("two signals", () => {
  const a = signal(7);
  const b = signal(1);

  let callCount = 0;

  const c = computed(() => {
    callCount++;
    return a() * b();
  });

  a(2);
  assertEquals(a(), 2);

  b(3);
  assertEquals(b(), 3);

  assertEquals(callCount, 0);

  assertEquals(c(), 6);
  assertEquals(callCount, 1);
});

Deno.test("diamond computeds", () => {
  const s = signal(1);
  const a = computed(() => s());
  const b = computed(() => a() * 2);
  const c = computed(() => a() * 3);

  let callCount = 0;
  const d = computed(() => {
    callCount++;
    return b() + c();
  });

  assertEquals(d(), 5);
  assertEquals(callCount, 1);

  s(2);
  assertEquals(d(), 10);
  assertEquals(callCount, 2);

  s(3);
  assertEquals(d(), 15);
  assertEquals(callCount, 3);
});

Deno.test("set inside reaction", () => {
  const s = signal(1);
  const a = computed(() => s(2));
  const l = computed(() => s() + 100);

  a();
  assertEquals(l(), 102);
});

Deno.test("small dynamic graph with signal grandparents", () => {
  const z = signal(3);
  const x = signal(0);

  const y = signal(0);
  const i = computed(() => {
    let a = y();
    z();
    if (!a) {
      return x();
    } else {
      return a;
    }
  });
  const j = computed(() => {
    let a = i();
    z();
    if (!a) {
      return x();
    } else {
      return a;
    }
  });
  j();
  x(1);
  j();
  y(1);
  j();
});

Deno.test("dynamic sources recalculate correctly", () => {
  const a = signal(false);
  const b = signal(2);
  let count = 0;

  const c = computed(() => {
    count++;
    a() || b();
  }).run();

  assertEquals(count, 1);
  
  a(true);
  assertEquals(count, 2);
  
  b(4);
  assertEquals(count, 3);
});
