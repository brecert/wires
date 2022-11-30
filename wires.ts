// deno-lint-ignore-file prefer-const
// Utils

type Fn<T = void> = () => T
type None = typeof None

const None = Symbol()
const $batched: Set<Fn> = new Set()

let $inBatch = 0
export function batch(fn: Fn) {
    $inBatch++
    fn()
    if ($inBatch <= 0) {
        const fns = [...$batched.values()]
        $batched.clear()
        fns.map(fn => fn())
    }
    $inBatch--
}

const callBatched = (fn: Fn) => $inBatch > 0
    ? $batched.add(fn)
    : fn()


// Wires

// There's probably a ton of memory leaks, didn't really consider or test that while throwing this together

// Would create on read be possible or efficient?
export class Wire extends Set<Fn> {
    signal() { this.forEach(fn => fn()) }
}

export function wire<R>(fn: (thread: Wire) => R) {
    let wires: Set<Wire> | undefined
    let thread = new Wire()

    // There needs to be a better way, I feel this could mess with the optimization of some browsers
    // Need to test
    let result: R
    let invalided = true
    let isRunning = false

    let run = () => {
        invalided = true
        if (isRunning) {
            result = fn(thread)
        }
        wires?.forEach(wire => wire.signal())
    }

    thread.add(run)

    function read(): R
    function read($: Wire): R
    function read($?: Wire): R {
        if (invalided && !isRunning) {
            result = fn(thread)
            invalided = false
        }

        if ($) {
            // We don't create a set unless needed
            (wires ??= new Set()).add($)
        }

        return result
    }

    read.run = () => {
        isRunning = true
        run()
    }
    read.stop = () => {
        isRunning = false
        thread.delete(run)
    }

    return read
}

export function signal<T>(val: T) {
    // We create the set here because what's the point of a signal if you're not going to use it
    // Maybe a "global" WeakMap wire store could save on memory
    let wires = new Set<Wire>

    /** Gets the value of the signal */
    function update(): T;
    /** Gets the value of the signal, wired for reactivity */
    function update($: Wire): T;
    /** Updates the value of the signal */
    function update(value: T): void;
    function update(valueOrWire: None | T | Wire = None): T | void {
        if (valueOrWire === None) {
            return val
        }
        else if (valueOrWire instanceof Wire) {
            // Set wire thread the signal is on
            wires.add(valueOrWire)
            return val
        }
        else {
            val = valueOrWire
            // Signal wires to update now that the value has been updated.
            // If in a batch then we don't signal updates until the batch ends
            wires.forEach(wire => wire.forEach(callBatched))
            return val
        }
    }

    return update
}

export type WireFn<R> = ReturnType<typeof wire<R>>
export type SignalFn<T> = ReturnType<typeof signal<T>>

type Reactive<T> = { [K in keyof T]: T[K] extends ((...args: unknown[]) => unknown) ? T[K] : SignalFn<T[K]> }

/**
 * Makes an object's properties reactive by wrapping them in signals.
 * Ignores functions and is not deep.
 */
export function makeReactive<T extends Record<string, unknown>>(obj: T): Reactive<T> {
    Object.keys(obj).forEach((key: keyof T) => {
        let val = obj[key]
        obj[key] = (typeof val === 'function' ? val : signal(val)) as T[keyof T]
    })
    return obj as Reactive<T>
}

// Testing

// Problem: once a wire runs once it's either linked to other wires or becomes an "effect" that persists.
// How do you get the value of a wire without either outcome?
// Currently a wire runs whenever a found dependency is changed.

// How should wires be handled?
// A wire returns a function that can be called in one of a few ways.
// A function with no arguments will only call the wire once and get the result.
// A function with a wire/thread argument will thread the wire into the chain and call whenever the wire's dependencies change.
// So how do we get react effects?

// name
// $ -> test ($)
//      $ -> $age
//      $ -> $name

// age('value') ->
//   tell wire updating is a good idea
//   next time wire is called, wire will check if updating is a good idea and then update if it should
//   if wire is wired as well, tell that wire that updating is a good idea
//   doesn't this lose the fine tuned reactive guaranties that we want?

// if only signals could contain reactions, would that be efficient?
// it could work but I'm not sure
// a(12) -> iterate all reactions in the set, then run them in order(?)
//   that'd have dependency issues, stuff may run out of order or in ways not expected (ex. a conditional prevents a signal from being ran but it still tells it to run)
// locality matters for signals

// This is for fun more than anything
export const memo = wire
export const effect = (fn: ($: Wire) => void) => wire(fn).run()
