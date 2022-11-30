// deno-fmt-ignore-file
// deno-lint-ignore-file
// This code was bundled using `deno bundle` and it's not recommended to edit it manually

const None = Symbol();
const $batched = new Set();
let $inBatch = 0;
function batch(fn) {
    $inBatch++;
    fn();
    if ($inBatch <= 0) {
        const fns = [
            ...$batched.values()
        ];
        $batched.clear();
        fns.map((fn)=>fn());
    }
    $inBatch--;
}
const callBatched = (fn)=>$inBatch > 0 ? $batched.add(fn) : fn();
class Wire extends Set {
    signal() {
        this.forEach((fn)=>fn());
    }
}
function wire(fn) {
    let wires;
    let thread = new Wire();
    let result;
    let invalided = true;
    let isRunning = false;
    let run = ()=>{
        invalided = true;
        if (isRunning) {
            result = fn(thread);
        }
        wires?.forEach((wire)=>wire.signal());
    };
    thread.add(run);
    function read($) {
        if (invalided && !isRunning) {
            result = fn(thread);
            invalided = false;
        }
        if ($) {
            (wires ??= new Set()).add($);
        }
        return result;
    }
    read.run = ()=>{
        isRunning = true;
        run();
    };
    read.stop = ()=>{
        isRunning = false;
        thread.delete(run);
    };
    return read;
}
function signal(val) {
    let wires = new Set;
    function update(valueOrWire = None) {
        if (valueOrWire === None) {
            return val;
        } else if (valueOrWire instanceof Wire) {
            wires.add(valueOrWire);
            return val;
        } else {
            val = valueOrWire;
            wires.forEach((wire)=>wire.forEach(callBatched));
            return val;
        }
    }
    return update;
}
function makeReactive(obj) {
    Object.keys(obj).forEach((key)=>{
        let val = obj[key];
        obj[key] = typeof val === 'function' ? val : signal(val);
    });
    return obj;
}
const memo = wire;
const effect = (fn)=>wire(fn).run();
export { batch as batch };
export { Wire as Wire };
export { wire as wire };
export { signal as signal };
export { makeReactive as makeReactive };
export { memo as memo };
export { effect as effect };
