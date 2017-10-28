/**
 * Copyright (c) 2017 molio contributors, licensed under MIT, See LICENSE file for more info.
 *
 * @author David Sehnal <david.sehnal@gmail.com>
 */

import OrderedSet from '../../mol-base/collections/integer/ordered-set'
import Iterator from '../../mol-base/collections/iterator'
import Interval from '../../mol-base/collections/integer/interval'
import { sortArray } from '../../mol-base/collections/sort'
import { hash1 } from '../../mol-base/collections/hash-functions'
import Atom from '../atom'

/** Long and painful implementation starts here */

export interface AtomSetElements { [id: number]: OrderedSet, offsets: number[], hashCode: number, keys: OrderedSet }
export type AtomSetImpl = Atom | AtomSetElements

export const Empty: AtomSetImpl = { offsets: [0], hashCode: 0, keys: OrderedSet.Empty };

export function create(data: Atom | ArrayLike<Atom> | { [id: number]: OrderedSet }): AtomSetImpl {
    if (typeof data === 'number' || Atom.is(data)) return data;
    if (isArrayLike(data)) return ofAtoms(data);
    return ofObject(data as { [id: number]: OrderedSet });
}

export function isSingleton(set: AtomSetImpl) {
    return typeof set === 'number';
}

export function getKeys(set: AtomSetImpl): OrderedSet {
    if (typeof set === 'number') return OrderedSet.ofSingleton(set);
    return (set as AtomSetElements).keys;
}

export function keyCount(set: AtomSetImpl): number {
    if (typeof set === 'number') return 1;
    return OrderedSet.size((set as AtomSetElements).keys);
}

export function hasKey(set: AtomSetImpl, key: number): boolean {
    if (typeof set === 'number') return Atom.unit(set) === key;
    return OrderedSet.has((set as AtomSetElements).keys, key);
}

export function getKey(set: AtomSetImpl, index: number): number {
    if (typeof set === 'number') return Atom.unit(set);
    return OrderedSet.getAt((set as AtomSetElements).keys, index);
}

export function hasAtom(set: AtomSetImpl, t: Atom): boolean {
    if (typeof set === 'number') return Atom.areEqual(t, set);
    const unit = Atom.unit(t);
    return OrderedSet.has((set as AtomSetElements).keys, unit)
        ? OrderedSet.has((set as AtomSetElements)[unit], Atom.index(t)) : false;
}

export function getByKey(set: AtomSetImpl, key: number): OrderedSet {
    if (typeof set === 'number') {
        return Atom.unit(set) === key ? OrderedSet.ofSingleton(Atom.index(set)) : OrderedSet.Empty;
    }
    return OrderedSet.has((set as AtomSetElements).keys, key) ? (set as AtomSetElements)[key] : OrderedSet.Empty;
}

export function getByIndex(set: AtomSetImpl, index: number): OrderedSet {
    if (typeof set === 'number') return index === 0 ? OrderedSet.ofSingleton(Atom.index(set)) : OrderedSet.Empty;
    const key = OrderedSet.getAt((set as AtomSetElements).keys, index);
    return (set as AtomSetElements)[key] || OrderedSet.Empty;
}

export function getAt(set: AtomSetImpl, i: number): Atom {
    if (typeof set === 'number') return set;
    return getAtE(set as AtomSetElements, i);
}

export function indexOf(set: AtomSetImpl, t: Atom) {
    if (typeof set === 'number') return Atom.areEqual(set, t) ? 0 : -1;
    return indexOfE(set as AtomSetElements, t);
}

/** Number elements in the "child" sets */
export function size(set: AtomSetImpl) {
    if (typeof set === 'number') return 1;
    return (set as AtomSetElements).offsets[(set as AtomSetElements).offsets.length - 1];
}

export function hashCode(set: AtomSetImpl) {
    if (typeof set === 'number') return Atom.hashCode(set);
    if ((set as AtomSetElements).hashCode !== -1) return (set as AtomSetElements).hashCode;
    return computeHash((set as AtomSetElements));
}

export function areEqual(a: AtomSetImpl, b: AtomSetImpl) {
    if (typeof a === 'number') {
        if (typeof b === 'number') return Atom.areEqual(a, b);
        return false;
    }
    if (typeof b === 'number') return false;
    return areEqualEE(a as AtomSetElements, b as AtomSetElements);
}

export function areIntersecting(a: AtomSetImpl, b: AtomSetImpl) {
    if (typeof a === 'number') {
        if (typeof b === 'number') return Atom.areEqual(a, b);
        return areIntersectingNE(a, b as AtomSetElements);
    }
    if (typeof b === 'number') return areIntersectingNE(b, a as AtomSetElements);
    return areIntersectingEE(a as AtomSetElements, b as AtomSetElements);
}

export function intersect(a: AtomSetImpl, b: AtomSetImpl) {
    if (typeof a === 'number') {
        if (typeof b === 'number') return Atom.areEqual(a, b) ? a : Empty;
        return intersectNE(a, b as AtomSetElements);
    }
    if (typeof b === 'number') return intersectNE(b, a as AtomSetElements);
    return intersectEE(a as AtomSetElements, b as AtomSetElements);
}

export function subtract(a: AtomSetImpl, b: AtomSetImpl) {
    if (typeof a === 'number') {
        if (typeof b === 'number') return Atom.areEqual(a, b) ? Empty : a;
        return subtractNE(a, b as AtomSetElements);
    }
    if (typeof b === 'number') return subtractEN(a as AtomSetElements, b);
    return subtractEE(a as AtomSetElements, b as AtomSetElements);
}

export function union(a: AtomSetImpl, b: AtomSetImpl) {
    return findUnion([a, b]);
}

export function unionMany(sets: ArrayLike<AtomSetImpl>) {
    return findUnion(sets);
}

class ElementsIterator implements Iterator<Atom> {
    private unit: number = 0;
    private keyCount: number;
    private setIndex = -1;
    private currentIndex = 0;
    private currentSize = 0;
    private currentSet: OrderedSet = OrderedSet.Empty;

    hasNext: boolean = false;

    move() {
        if (!this.hasNext) return Atom.Zero;
        const ret = Atom.create(this.unit, OrderedSet.getAt(this.currentSet, this.currentIndex++));
        if (this.currentIndex >= this.currentSize) this.advance();
        return ret;
    }

    private advance() {
        if (++this.setIndex >= this.keyCount) {
            this.hasNext = false;
            return false;
        }
        this.unit = OrderedSet.getAt(this.elements.keys, this.setIndex);
        this.currentSet = this.elements[this.unit];
        this.currentIndex = 0;
        this.currentSize = OrderedSet.size(this.currentSet);
        return true;
    }

    constructor(private elements: AtomSetElements) {
        this.keyCount = OrderedSet.size(elements.keys);
        this.hasNext = this.keyCount > 0;
        this.advance();
    }
}

export function values(set: AtomSetImpl): Iterator<Atom> {
    if (typeof set === 'number') return Iterator.Value(set as Atom);
    return new ElementsIterator(set as AtomSetElements);
}

function isArrayLike(x: any): x is ArrayLike<Atom> {
    return x && (typeof x.length === 'number' && (Array.isArray(x) || !!x.buffer));
}

function ofObject(data: { [id: number]: OrderedSet }) {
    const keys = [];
    for (const _k of Object.keys(data)) {
        const k = +_k;
        if (OrderedSet.size(data[k]) > 0) keys[keys.length] = k;
    }
    if (!keys.length) return Empty;
    if (keys.length === 1) {
        const set = data[keys[0]];
        if (OrderedSet.size(set) === 1) return Atom.create(keys[0], OrderedSet.getAt(set, 0));
    }
    return ofObject1(keys, data);
}

function ofObject1(keys: number[], data: { [id: number]: OrderedSet }) {
    if (keys.length === 1) {
        const k = keys[0];
        const set = data[k];
        if (OrderedSet.size(set) === 1) return Atom.create(k, OrderedSet.getAt(set, 0));
    }
    sortArray(keys);
    return _createObjectOrdered(OrderedSet.ofSortedArray(keys), data);
}

function ofObjectOrdered(keys: OrderedSet, data: { [id: number]: OrderedSet }) {
    if (OrderedSet.size(keys) === 1) {
        const k = OrderedSet.getAt(keys, 0);
        const set = data[k];
        if (OrderedSet.size(set) === 1) return Atom.create(k, OrderedSet.getAt(set, 0));
    }
    return _createObjectOrdered(keys, data);
}

function _createObjectOrdered(keys: OrderedSet, data: { [id: number]: OrderedSet }) {
    const ret: AtomSetElements = Object.create(null);
    ret.keys = keys;
    const offsets = [0];
    let runningSize = 0;
    for (let i = 0, _i = OrderedSet.size(keys); i < _i; i++) {
        const k = OrderedSet.getAt(keys, i);
        const set = data[k];
        ret[k] = set;
        runningSize += OrderedSet.size(set);
        offsets[offsets.length] = runningSize;
    }
    ret.offsets = offsets;
    ret.hashCode = -1;
    return ret;
}

function getUniqueElements(xs: number[]) {
    let count = 1;
    for (let i = 1, _i = xs.length; i < _i; i++) {
        if (xs[i - 1] !== xs[i]) count++;
    }
    const ret = new (xs as any).constructor(count);
    ret[0] = xs[0];
    let offset = 1;
    for (let i = 1, _i = xs.length; i < _i; i++) {
        if (xs[i - 1] !== xs[i]) ret[offset++] = xs[i];
    }
    return ret;
}

function normalizeArray(xs: number[]) {
    sortArray(xs);
    for (let i = 1, _i = xs.length; i < _i; i++) {
        if (xs[i - 1] === xs[i]) return getUniqueElements(xs);
    }
    return xs;
}

function ofAtoms(xs: ArrayLike<Atom>) {
    if (xs.length === 0) return Empty;
    const sets: { [key: number]: number[] } = Object.create(null);
    for (let i = 0, _i = xs.length; i < _i; i++) {
        const x = xs[i];
        const u = Atom.unit(x), v = Atom.index(x);
        const set = sets[u];
        if (set) set[set.length] = v;
        else sets[u] = [v];
    }
    const ret: { [key: number]: OrderedSet } = Object.create(null);
    const keys = [];
    for (const _k of Object.keys(sets)) {
        const k = +_k;
        keys[keys.length] = k;
        ret[k] = OrderedSet.ofSortedArray(normalizeArray(sets[k]));
    }
    return ofObject1(keys, ret);
}

function getOffsetIndex(xs: ArrayLike<number>, value: number) {
    let min = 0, max = xs.length - 1;
    while (min < max) {
        const mid = (min + max) >> 1;
        const v = xs[mid];
        if (value < v) max = mid - 1;
        else if (value > v) min = mid + 1;
        else return mid;
    }
    if (min > max) {
        return max;
    }
    return value < xs[min] ? min - 1 : min;
}

function getAtE(set: AtomSetElements, i: number): Atom {
    const { offsets, keys } = set;
    const o = getOffsetIndex(offsets, i);
    if (o >= offsets.length - 1) return 0 as any;
    const k = OrderedSet.getAt(keys, o);
    const e = OrderedSet.getAt(set[k], i - offsets[o]);
    return Atom.create(k, e);
}

function indexOfE(set: AtomSetElements, t: Atom) {
    const { keys } = set;
    const u = Atom.unit(t);
    const setIdx = OrderedSet.indexOf(keys, u);
    if (setIdx < 0) return -1;
    const o = OrderedSet.indexOf(set[u], Atom.index(t));
    if (o < 0) return -1;
    return set.offsets[setIdx] + o;
}

function computeHash(set: AtomSetElements) {
    const { keys } = set;
    let hash = 23;
    for (let i = 0, _i = OrderedSet.size(keys); i < _i; i++) {
        const k = OrderedSet.getAt(keys, i);
        hash = (31 * hash + k) | 0;
        hash = (31 * hash + OrderedSet.hashCode(set[k])) | 0;
    }
    hash = (31 * hash + size(set)) | 0;
    hash = hash1(hash);
    set.hashCode = hash;
    return hash;
}

function areEqualEE(a: AtomSetElements, b: AtomSetElements) {
    if (a === b) return true;
    if (size(a) !== size(a)) return false;

    const keys = a.keys;
    if (!OrderedSet.areEqual(keys, b.keys)) return false;
    for (let i = 0, _i = OrderedSet.size(keys); i < _i; i++) {
        const k = OrderedSet.getAt(keys, i);
        if (!OrderedSet.areEqual(a[k], b[k])) return false;
    }
    return true;
}

function areIntersectingNE(a: Atom, b: AtomSetElements) {
    const u = Atom.unit(a);
    return OrderedSet.has(b.keys, u) && OrderedSet.has(b[u], Atom.index(a));
}

function areIntersectingEE(a: AtomSetElements, b: AtomSetElements) {
    if (a === b) return true;
    const keysA = a.keys, keysB = b.keys;
    if (!OrderedSet.areIntersecting(a.keys, b.keys)) return false;
    const r = OrderedSet.findRange(keysA, OrderedSet.min(keysB), OrderedSet.max(keysB));
    const start = Interval.start(r), end = Interval.end(r);
    for (let i = start; i < end; i++) {
        const k = OrderedSet.getAt(keysA, i);
        if (OrderedSet.has(keysB, k) && OrderedSet.areIntersecting(a[k], b[k])) return true;
    }
    return false;
}

function intersectNE(a: Atom, b: AtomSetElements) {
    const u = Atom.unit(a);
    return OrderedSet.has(b.keys, u) && OrderedSet.has(b[u], Atom.index(a)) ? a : Empty;
}

function intersectEE(a: AtomSetElements, b: AtomSetElements) {
    if (a === b) return a;

    const keysA = a.keys, keysB = b.keys;
    if (!OrderedSet.areIntersecting(a.keys, b.keys)) return Empty;
    const r = OrderedSet.findRange(keysA, OrderedSet.min(keysB), OrderedSet.max(keysB));
    const start = Interval.start(r), end = Interval.end(r);

    const keys = [], ret = Object.create(null);
    for (let i = start; i < end; i++) {
        const k = OrderedSet.getAt(keysA, i);
        if (OrderedSet.has(keysB, k)) {
            const intersection = OrderedSet.intersect(a[k], b[k]);
            if (OrderedSet.size(intersection) > 0) {
                keys[keys.length] = k;
                ret[k] = intersection;
            }
        }
    }
    return ofObjectOrdered(OrderedSet.ofSortedArray(keys), ret);
}

function subtractNE(a: Atom, b: AtomSetElements) {
    const u = Atom.unit(a);
    return OrderedSet.has(b.keys, u) && OrderedSet.has(b[u], Atom.index(a)) ? Empty : a;
}

function subtractEN(a: AtomSetElements, b: Atom): AtomSetImpl {
    const aKeys =  a.keys;
    const u = Atom.unit(b), v = Atom.index(b);
    if (!OrderedSet.has(aKeys, u) || !OrderedSet.has(a[u], v)) return a;
    const set = a[u];
    if (OrderedSet.size(set) === 1) {
        // remove the entire unit.
        return ofObjectOrdered(OrderedSet.subtract(a.keys, OrderedSet.ofSingleton(u)), a);
    } else {
        const ret: { [key: number]: OrderedSet } = Object.create(null);
        for (let i = 0, _i = OrderedSet.size(a.keys); i < _i; i++) {
            const k = OrderedSet.getAt(a.keys, i);
            if (k === u) {
                ret[k] = OrderedSet.subtract(set, OrderedSet.ofSingleton(v));
            } else ret[k] = a[k];
        }
        return ofObjectOrdered(a.keys, ret);
    }
}

function subtractEE(a: AtomSetElements, b: AtomSetElements) {
    if (a === b) return Empty;

    const keysA = a.keys, keysB = b.keys;
    if (!OrderedSet.areIntersecting(a.keys, b.keys)) return Empty;
    const r = OrderedSet.findRange(keysA, OrderedSet.min(keysB), OrderedSet.max(keysB));
    const start = Interval.start(r), end = Interval.end(r);

    const keys = [], ret = Object.create(null);
    for (let i = 0; i < start; i++) {
        const k = OrderedSet.getAt(keysA, i);
        keys[keys.length] = k;
        ret[k] = a[k];
    }
    for (let i = start; i < end; i++) {
        const k = OrderedSet.getAt(keysA, i);
        if (OrderedSet.has(keysB, k)) {
            const subtraction = OrderedSet.subtract(a[k], b[k]);
            if (OrderedSet.size(subtraction) > 0) {
                keys[keys.length] = k;
                ret[k] = subtraction;
            }
        } else {
            keys[keys.length] = k;
            ret[k] = a[k];
        }
    }
    for (let i = end, _i = OrderedSet.size(keysA); i < _i; i++) {
        const k = OrderedSet.getAt(keysA, i);
        keys[keys.length] = k;
        ret[k] = a[k];
    }
    return ofObjectOrdered(OrderedSet.ofSortedArray(keys), ret);
}

function findUnion(sets: ArrayLike<AtomSetImpl>) {
    if (!sets.length) return Empty;
    if (sets.length === 1) return sets[0];
    if (sets.length === 2 && areEqual(sets[0], sets[1])) return sets[0];

    const eCount = { count: 0 };
    const ns = unionN(sets, eCount);
    if (!eCount.count) return ns;
    const ret = Object.create(null);
    for (let i = 0, _i = sets.length; i < _i; i++) {
        const s = sets[i];
        if (typeof s !== 'number') unionInto(ret, s as AtomSetElements);
    }
    if (size(ns as AtomSetImpl) > 0) {
        if (typeof ns === 'number') unionIntoN(ret, ns as any);
        else unionInto(ret, ns as AtomSetElements);
    }
    return ofObject(ret);
}

function unionN(sets: ArrayLike<AtomSetImpl>, eCount: { count: number }) {
    let countN = 0, countE = 0;
    for (let i = 0, _i = sets.length; i < _i; i++) {
        if (typeof sets[i] === 'number') countN++;
        else countE++;
    }
    eCount.count = countE;
    if (!countN) return Empty;
    if (countN === sets.length) return ofAtoms(sets as ArrayLike<Atom>);
    const packed = new Float64Array(countN);
    let offset = 0;
    for (let i = 0, _i = sets.length; i < _i; i++) {
        const s = sets[i];
        if (typeof s === 'number') packed[offset++] = s;
    }
    return ofAtoms(packed as any);
}

function unionInto(data: { [key: number]: OrderedSet }, a: AtomSetElements) {
    const keys = a.keys;
    for (let i = 0, _i = OrderedSet.size(keys); i < _i; i++) {
        const k = OrderedSet.getAt(keys, i);
        const set = data[k];
        if (set) data[k] = OrderedSet.union(set, a[k]);
        else data[k] = a[k];
    }
}

function unionIntoN(data: { [key: number]: OrderedSet }, a: Atom) {
    const u = Atom.unit(a);
    const set = data[u];
    if (set) {
        data[u] = OrderedSet.union(set, OrderedSet.ofSingleton(Atom.index(a)));
    } else {
        data[u] = OrderedSet.ofSingleton(Atom.index(a));
    }
}