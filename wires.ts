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

let $currentThreads: Wire[] = []
function withThread<R>(thread: Wire, fn: () => R) {
	$currentThreads.push(thread)
	let result = fn()
	$currentThreads.pop()
    return result
}

export function computed<R>(fn: () => R) {
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
            result = withThread(thread, fn)
        }
        wires?.forEach(wire => wire.signal())
    }

    thread.add(run)

    function read(): R {
        if (invalided && !isRunning) {
            result = withThread(thread, fn)
            invalided = false
        }

		if($currentThreads.at(-1)!) {
			(wires ??= new Set()).add($currentThreads.at(-1)!)
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
    /** Updates the value of the signal */
    function update(value: T): void;
    function update(valueOrWire: None | T = None): T | void {
        if (valueOrWire === None) {
            if($currentThreads.at(-1)!) {
                wires.add($currentThreads.at(-1)!)
            }
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

export type WireFn<R> = ReturnType<typeof computed<R>>
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

// This is for fun more than anything
export const memo = computed
export const effect = (fn: () => void) => computed(fn).run()