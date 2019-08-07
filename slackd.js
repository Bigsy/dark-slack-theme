var myPort = chrome.runtime.connect({
    name: "tab"
});

var active = false;

myPort.onMessage.addListener(function (data) {
    if (data == "true") {
        if (!active) {
            removeStyle();
            activate();
        }
    } else {
        removeStyle();
        removeSVGFilter();
        removeDynamicTheme();
        active = false;
    }
});

function activate() {
    createOrUpdateDynamicTheme({
        "mode": 1,
        "brightness": 100,
        "contrast": 90,
        "grayscale": 20,
        "sepia": 10,
        "useFont": false,
        "fontFamily": "Open Sans",
        "textStroke": 0
    }, null);
}

chrome.runtime.sendMessage({
    method: "isActivated"
}, function (response) {
    if (response.status == "true") {
        activate();
    }
});


// MIT License
//
// Copyright (c) 2017 Alexander Shutov
//
// All rights reserved.
//
//     Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
//
//     The above copyright notice and this permission notice shall be included in all
// copies or substantial portions of the Software.
//
//     THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
//     FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
//     OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
// SOFTWARE.

function throttle(callback) {
    let pending = false;
    let frameId = null;
    let lastArgs;
    const throttled = (...args) => {
        lastArgs = args;
        if (frameId) {
            pending = true;
        } else {
            callback(...lastArgs);
            frameId = requestAnimationFrame(() => {
                frameId = null;
                if (pending) {
                    callback(...lastArgs);
                    pending = false;
                }
            });
        }
    };
    const cancel = () => {
        cancelAnimationFrame(frameId);
        pending = false;
        frameId = null;
    };
    return Object.assign(throttled, {cancel});
}
function createAsyncTasksQueue() {
    const tasks = [];
    let frameId = null;
    function runTasks() {
        let task;
        while ((task = tasks.shift())) {
            task();
        }
        frameId = null;
    }
    function add(task) {
        tasks.push(task);
        if (!frameId) {
            frameId = requestAnimationFrame(runTasks);
        }
    }
    function cancel() {
        tasks.splice(0);
        cancelAnimationFrame(frameId);
        frameId = null;
    }
    return {add, cancel};
}

function getDuration(time) {
    let duration = 0;
    if (time.seconds) {
        duration += time.seconds * 1000;
    }
    if (time.minutes) {
        duration += time.minutes * 60 * 1000;
    }
    if (time.hours) {
        duration += time.hours * 60 * 60 * 1000;
    }
    if (time.days) {
        duration += time.days * 24 * 60 * 60 * 1000;
    }
    return duration;
}

function createNodeAsap({
                            selectNode,
                            createNode,
                            updateNode,
                            selectTarget,
                            createTarget,
                            isTargetMutation
                        }) {
    const target = selectTarget();
    if (target) {
        const prev = selectNode();
        if (prev) {
            updateNode(prev);
        } else {
            createNode(target);
        }
    } else {
        const observer = new MutationObserver((mutations) => {
            const mutation = mutations.find(isTargetMutation);
            if (mutation) {
                unsubscribe();
                const target = selectTarget();
                selectNode() || createNode(target);
            }
        });
        const ready = () => {
            if (document.readyState !== "complete") {
                return;
            }
            unsubscribe();
            const target = selectTarget() || createTarget();
            selectNode() || createNode(target);
        };
        const unsubscribe = () => {
            document.removeEventListener("readystatechange", ready);
            observer.disconnect();
        };
        if (document.readyState === "complete") {
            ready();
        } else {
            document.addEventListener("readystatechange", ready);
            observer.observe(document, {childList: true, subtree: true});
        }
    }
}
function removeNode(node) {
    node && node.parentNode && node.parentNode.removeChild(node);
}
function watchForNodePosition(node, onRestore) {
    const MAX_ATTEMPTS_COUNT = 10;
    const ATTEMPTS_INTERVAL = getDuration({seconds: 10});
    const prevSibling = node.previousSibling;
    const parent = node.parentElement;
    if (!parent) {
        return {stop: () => {}};
    }
    let attempts = 0;
    let start = null;
    const restore = throttle(() => {
        attempts++;
        const now = Date.now();
        if (start == null) {
            start = now;
        } else if (attempts >= MAX_ATTEMPTS_COUNT) {
            if (now - start < ATTEMPTS_INTERVAL) {
                stop();
                return;
            }
            start = now;
            attempts = 1;
        }
        if (prevSibling && prevSibling.parentElement !== parent) {
            stop();
            return;
        }
        parent.insertBefore(
            node,
            prevSibling ? prevSibling.nextSibling : parent.firstChild
        );
        onRestore && onRestore();
    });
    const observer = new MutationObserver(() => {
        if (!node.parentElement) {
            restore();
        }
    });
    const run = () => {
        observer.observe(parent, {childList: true});
    };
    const stop = () => {
        observer.disconnect();
    };
    run();
    return {run, stop};
}

function createOrUpdateStyle(css) {
    createNodeAsap({
        selectNode: () => document.getElementById("dark-reader-style"),
        createNode: (target) => {
            const style = document.createElement("style");
            style.id = "dark-reader-style";
            style.type = "text/css";
            style.textContent = css;
            target.appendChild(style);
        },
        updateNode: (existing) => {
            if (
                css.replace(/^\s+/gm, "") !==
                existing.textContent.replace(/^\s+/gm, "")
            ) {
                existing.textContent = css;
            }
        },
        selectTarget: () => document.head,
        createTarget: () => {
            const head = document.createElement("head");
            document.documentElement.insertBefore(
                head,
                document.documentElement.firstElementChild
            );
            return head;
        },
        isTargetMutation: (mutation) =>
            mutation.target.nodeName.toLowerCase() === "head"
    });
}
function removeStyle() {
    removeNode(document.getElementById("dark-reader-style"));
}

function createOrUpdateSVGFilter(svgMatrix, svgReverseMatrix) {
    createNodeAsap({
        selectNode: () => document.getElementById("dark-reader-svg"),
        createNode: (target) => {
            const SVG_NS = "http://www.w3.org/2000/svg";
            const createMatrixFilter = (id, matrix) => {
                const filter = document.createElementNS(SVG_NS, "filter");
                filter.id = id;
                filter.style.colorInterpolationFilters = "sRGB";
                filter.setAttribute("x", "0");
                filter.setAttribute("y", "0");
                filter.setAttribute("width", "99999");
                filter.setAttribute("height", "99999");
                filter.appendChild(createColorMatrix(matrix));
                return filter;
            };
            const createColorMatrix = (matrix) => {
                const colorMatrix = document.createElementNS(
                    SVG_NS,
                    "feColorMatrix"
                );
                colorMatrix.setAttribute("type", "matrix");
                colorMatrix.setAttribute("values", matrix);
                return colorMatrix;
            };
            const svg = document.createElementNS(SVG_NS, "svg");
            svg.id = "dark-reader-svg";
            svg.style.height = "0";
            svg.style.width = "0";
            svg.appendChild(
                createMatrixFilter("dark-reader-filter", svgMatrix)
            );
            svg.appendChild(
                createMatrixFilter(
                    "dark-reader-reverse-filter",
                    svgReverseMatrix
                )
            );
            target.appendChild(svg);
        },
        updateNode: (existing) => {
            const existingMatrix = existing.firstChild.firstChild;
            if (existingMatrix.getAttribute("values") !== svgMatrix) {
                existingMatrix.setAttribute("values", svgMatrix);
                const style = document.getElementById("dark-reader-style");
                const css = style.textContent;
                style.textContent = "";
                style.textContent = css;
            }
        },
        selectTarget: () => document.head,
        createTarget: () => {
            const head = document.createElement("head");
            document.documentElement.insertBefore(
                head,
                document.documentElement.firstElementChild
            );
            return head;
        },
        isTargetMutation: (mutation) =>
            mutation.target.nodeName.toLowerCase() === "head"
    });
}
function removeSVGFilter() {
    removeNode(document.getElementById("dark-reader-svg"));
}

function parseURL(url) {
    const a = document.createElement("a");
    a.href = url;
    return a;
}
function getAbsoluteURL($base, $relative) {
    if ($relative.match(/^.*?\/\//) || $relative.match(/^data\:/)) {
        if ($relative.startsWith("//")) {
            return `${location.protocol}${$relative}`;
        }
        return $relative;
    }
    const b = parseURL($base);
    if ($relative.startsWith("/")) {
        const u = parseURL(`${b.protocol}//${b.host}${$relative}`);
        return u.href;
    }
    const pathParts = b.pathname
        .split("/")
        .concat($relative.split("/"))
        .filter((p) => p);
    let backwardIndex;
    while ((backwardIndex = pathParts.indexOf("..")) > 0) {
        pathParts.splice(backwardIndex - 1, 2);
    }
    const u = parseURL(`${b.protocol}//${b.host}/${pathParts.join("/")}`);
    return u.href;
}

function iterateCSSRules(rules, iterate) {
    Array.from(rules).forEach((rule) => {
        if (rule instanceof CSSMediaRule) {
            const media = Array.from(rule.media);
            if (
                media.includes("screen") ||
                media.includes("all") ||
                !(media.includes("print") || media.includes("speech"))
            ) {
                iterateCSSRules(rule.cssRules, iterate);
            }
        } else if (rule instanceof CSSStyleRule) {
            iterate(rule);
        } else if (rule instanceof CSSImportRule) {
            try {
                iterateCSSRules(rule.styleSheet.cssRules, iterate);
            } catch (err) {}
        }
    });
}
function iterateCSSDeclarations(style, iterate) {
    Array.from(style).forEach((property) => {
        const value = style.getPropertyValue(property).trim();
        if (!value) {
            return;
        }
        iterate(property, value);
    });
}
function isCSSVariable(property) {
    return (
        property.startsWith("--") && !property.startsWith("--darkslack")
    );
}
function getCSSVariables(rules) {
    const variables = new Map();
    rules &&
    iterateCSSRules(rules, (rule) => {
        rule.style &&
        iterateCSSDeclarations(rule.style, (property, value) => {
            if (isCSSVariable(property)) {
                variables.set(property, value);
            }
        });
    });
    return variables;
}
function getElementCSSVariables(element) {
    const variables = new Map();
    iterateCSSDeclarations(element.style, (property, value) => {
        if (isCSSVariable(property)) {
            variables.set(property, value);
        }
    });
    return variables;
}
const cssURLRegex = /url\((('.+?')|(".+?")|([^\)]*?))\)/g;
const cssImportRegex = /@import (url\()?(('.+?')|(".+?")|([^\)]*?))\)?;?/g;
function getCSSURLValue(cssURL) {
    return cssURL
        .replace(/^url\((.*)\)$/, "$1")
        .replace(/^"(.*)"$/, "$1")
        .replace(/^'(.*)'$/, "$1");
}
function getCSSBaseBath(url) {
    const cssURL = parseURL(url);
    return `${cssURL.protocol}//${cssURL.host}${cssURL.pathname
        .replace(/\?.*$/, "")
        .replace(/(\/)([^\/]+)$/i, "$1")}`;
}
function replaceCSSRelativeURLsWithAbsolute($css, cssBasePath) {
    return $css.replace(cssURLRegex, (match) => {
        const pathValue = getCSSURLValue(match);
        return `url("${getAbsoluteURL(cssBasePath, pathValue)}")`;
    });
}
const cssCommentsRegex = /\/\*[\s\S]*?\*\//g;
function removeCSSComments($css) {
    return $css.replace(cssCommentsRegex, "");
}
const fontFaceRegex = /@font-face\s*{[^}]*}/g;
function replaceCSSFontFace($css) {
    return $css.replace(fontFaceRegex, "");
}
const varRegex = /var\((--[^\s,]+),?\s*([^\(\)]*(\([^\(\)]*\)[^\(\)]*)*\s*)\)/g;
function replaceCSSVariables(value, variables) {
    let missing = false;
    const result = value.replace(varRegex, (match, name, fallback) => {
        if (variables.has(name)) {
            return variables.get(name);
        } else if (fallback) {
            return fallback;
        } else {
            missing = true;
        }
        return match;
    });
    if (missing) {
        return result;
    }
    if (result.match(varRegex)) {
        return replaceCSSVariables(result, variables);
    }
    return result;
}

function hslToRGB({h, s, l, a = 1}) {
    if (s === 0) {
        const [r, b, g] = [l, l, l].map((x) => Math.round(x * 255));
        return {r, g, b, a};
    }
    const c = (1 - Math.abs(2 * l - 1)) * s;
    const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
    const m = l - c / 2;
    const [r, g, b] = (h < 60
            ? [c, x, 0]
            : h < 120
                ? [x, c, 0]
                : h < 180
                    ? [0, c, x]
                    : h < 240
                        ? [0, x, c]
                        : h < 300
                            ? [x, 0, c]
                            : [c, 0, x]
    ).map((n) => Math.round((n + m) * 255));
    return {r, g, b, a};
}
function rgbToHSL({r: r255, g: g255, b: b255, a = 1}) {
    const r = r255 / 255;
    const g = g255 / 255;
    const b = b255 / 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const c = max - min;
    const l = (max + min) / 2;
    if (c === 0) {
        return {h: 0, s: 0, l, a};
    }
    let h =
        (max === r
            ? ((g - b) / c) % 6
            : max === g
                ? (b - r) / c + 2
                : (r - g) / c + 4) * 60;
    if (h < 0) {
        h += 360;
    }
    const s = c / (1 - Math.abs(2 * l - 1));
    return {h, s, l, a};
}
function toFixed(n, digits = 0) {
    const fixed = n.toFixed(digits);
    if (digits === 0) {
        return fixed;
    }
    const dot = fixed.indexOf(".");
    if (dot >= 0) {
        const zerosMatch = fixed.match(/0+$/);
        if (zerosMatch) {
            if (zerosMatch.index === dot + 1) {
                return fixed.substring(0, dot);
            }
            return fixed.substring(0, zerosMatch.index);
        }
    }
    return fixed;
}
function rgbToString(rgb) {
    const {r, g, b, a} = rgb;
    if (a != null && a < 1) {
        return `rgba(${toFixed(r)}, ${toFixed(g)}, ${toFixed(b)}, ${toFixed(
            a,
            2
        )})`;
    }
    return `rgb(${toFixed(r)}, ${toFixed(g)}, ${toFixed(b)})`;
}
function rgbToHexString({r, g, b, a}) {
    return `#${(a != null && a < 1
            ? [r, g, b, Math.round(a * 255)]
            : [r, g, b]
    )
        .map((x) => {
            return `${x < 16 ? "0" : ""}${x.toString(16)}`;
        })
        .join("")}`;
}
const rgbMatch = /^rgba?\([^\(\)]+\)$/;
const hslMatch = /^hsla?\([^\(\)]+\)$/;
const hexMatch = /^#[0-9a-f]+$/i;
function parse($color) {
    const c = $color.trim().toLowerCase();
    if (c.match(rgbMatch)) {
        return parseRGB(c);
    }
    if (c.match(hslMatch)) {
        return parseHSL(c);
    }
    if (c.match(hexMatch)) {
        return parseHex(c);
    }
    if (knownColors.has(c)) {
        return getColorByName(c);
    }
    if (systemColors.has(c)) {
        return getSystemColor(c);
    }
    if ($color === "transparent") {
        return {r: 0, g: 0, b: 0, a: 0};
    }
    throw new Error(`Unable to parse ${$color}`);
}
function getNumbersFromString(str, splitter, range, units) {
    const raw = str.split(splitter).filter((x) => x);
    const unitsList = Object.entries(units);
    const numbers = raw
        .map((r) => r.trim())
        .map((r, i) => {
            let n;
            const unit = unitsList.find(([u]) => r.endsWith(u));
            if (unit) {
                n =
                    (parseFloat(r.substring(0, r.length - unit[0].length)) /
                        unit[1]) *
                    range[i];
            } else {
                n = parseFloat(r);
            }
            if (range[i] > 1) {
                return Math.round(n);
            }
            return n;
        });
    return numbers;
}
const rgbSplitter = /rgba?|\(|\)|\/|,|\s/gi;
const rgbRange = [255, 255, 255, 1];
const rgbUnits = {"%": 100};
function parseRGB($rgb) {
    const [r, g, b, a = 1] = getNumbersFromString(
        $rgb,
        rgbSplitter,
        rgbRange,
        rgbUnits
    );
    return {r, g, b, a};
}
const hslSplitter = /hsla?|\(|\)|\/|,|\s/gi;
const hslRange = [360, 1, 1, 1];
const hslUnits = {"%": 100, "deg": 360, "rad": 2 * Math.PI, "turn": 1};
function parseHSL($hsl) {
    const [h, s, l, a = 1] = getNumbersFromString(
        $hsl,
        hslSplitter,
        hslRange,
        hslUnits
    );
    return hslToRGB({h, s, l, a});
}
function parseHex($hex) {
    const h = $hex.substring(1);
    switch (h.length) {
        case 3:
        case 4: {
            const [r, g, b] = [0, 1, 2].map((i) =>
                parseInt(`${h[i]}${h[i]}`, 16)
            );
            const a =
                h.length === 3 ? 1 : parseInt(`${h[3]}${h[3]}`, 16) / 255;
            return {r, g, b, a};
        }
        case 6:
        case 8: {
            const [r, g, b] = [0, 2, 4].map((i) =>
                parseInt(h.substring(i, i + 2), 16)
            );
            const a =
                h.length === 6 ? 1 : parseInt(h.substring(6, 8), 16) / 255;
            return {r, g, b, a};
        }
    }
    throw new Error(`Unable to parse ${$hex}`);
}
function getColorByName($color) {
    const n = knownColors.get($color);
    return {
        r: (n >> 16) & 255,
        g: (n >> 8) & 255,
        b: (n >> 0) & 255,
        a: 1
    };
}
function getSystemColor($color) {
    const n = systemColors.get($color);
    return {
        r: (n >> 16) & 255,
        g: (n >> 8) & 255,
        b: (n >> 0) & 255,
        a: 1
    };
}
const knownColors = new Map(
    Object.entries({
        aliceblue: 0xf0f8ff,
        antiquewhite: 0xfaebd7,
        aqua: 0x00ffff,
        aquamarine: 0x7fffd4,
        azure: 0xf0ffff,
        beige: 0xf5f5dc,
        bisque: 0xffe4c4,
        black: 0x000000,
        blanchedalmond: 0xffebcd,
        blue: 0x0000ff,
        blueviolet: 0x8a2be2,
        brown: 0xa52a2a,
        burlywood: 0xdeb887,
        cadetblue: 0x5f9ea0,
        chartreuse: 0x7fff00,
        chocolate: 0xd2691e,
        coral: 0xff7f50,
        cornflowerblue: 0x6495ed,
        cornsilk: 0xfff8dc,
        crimson: 0xdc143c,
        cyan: 0x00ffff,
        darkblue: 0x00008b,
        darkcyan: 0x008b8b,
        darkgoldenrod: 0xb8860b,
        darkgray: 0xa9a9a9,
        darkgrey: 0xa9a9a9,
        darkgreen: 0x006400,
        darkkhaki: 0xbdb76b,
        darkmagenta: 0x8b008b,
        darkolivegreen: 0x556b2f,
        darkorange: 0xff8c00,
        darkorchid: 0x9932cc,
        darkred: 0x8b0000,
        darksalmon: 0xe9967a,
        darkseagreen: 0x8fbc8f,
        darkslateblue: 0x483d8b,
        darkslategray: 0x2f4f4f,
        darkslategrey: 0x2f4f4f,
        darkturquoise: 0x00ced1,
        darkviolet: 0x9400d3,
        deeppink: 0xff1493,
        deepskyblue: 0x00bfff,
        dimgray: 0x696969,
        dimgrey: 0x696969,
        dodgerblue: 0x1e90ff,
        firebrick: 0xb22222,
        floralwhite: 0xfffaf0,
        forestgreen: 0x228b22,
        fuchsia: 0xff00ff,
        gainsboro: 0xdcdcdc,
        ghostwhite: 0xf8f8ff,
        gold: 0xffd700,
        goldenrod: 0xdaa520,
        gray: 0x808080,
        grey: 0x808080,
        green: 0x008000,
        greenyellow: 0xadff2f,
        honeydew: 0xf0fff0,
        hotpink: 0xff69b4,
        indianred: 0xcd5c5c,
        indigo: 0x4b0082,
        ivory: 0xfffff0,
        khaki: 0xf0e68c,
        lavender: 0xe6e6fa,
        lavenderblush: 0xfff0f5,
        lawngreen: 0x7cfc00,
        lemonchiffon: 0xfffacd,
        lightblue: 0xadd8e6,
        lightcoral: 0xf08080,
        lightcyan: 0xe0ffff,
        lightgoldenrodyellow: 0xfafad2,
        lightgray: 0xd3d3d3,
        lightgrey: 0xd3d3d3,
        lightgreen: 0x90ee90,
        lightpink: 0xffb6c1,
        lightsalmon: 0xffa07a,
        lightseagreen: 0x20b2aa,
        lightskyblue: 0x87cefa,
        lightslategray: 0x778899,
        lightslategrey: 0x778899,
        lightsteelblue: 0xb0c4de,
        lightyellow: 0xffffe0,
        lime: 0x00ff00,
        limegreen: 0x32cd32,
        linen: 0xfaf0e6,
        magenta: 0xff00ff,
        maroon: 0x800000,
        mediumaquamarine: 0x66cdaa,
        mediumblue: 0x0000cd,
        mediumorchid: 0xba55d3,
        mediumpurple: 0x9370db,
        mediumseagreen: 0x3cb371,
        mediumslateblue: 0x7b68ee,
        mediumspringgreen: 0x00fa9a,
        mediumturquoise: 0x48d1cc,
        mediumvioletred: 0xc71585,
        midnightblue: 0x191970,
        mintcream: 0xf5fffa,
        mistyrose: 0xffe4e1,
        moccasin: 0xffe4b5,
        navajowhite: 0xffdead,
        navy: 0x000080,
        oldlace: 0xfdf5e6,
        olive: 0x808000,
        olivedrab: 0x6b8e23,
        orange: 0xffa500,
        orangered: 0xff4500,
        orchid: 0xda70d6,
        palegoldenrod: 0xeee8aa,
        palegreen: 0x98fb98,
        paleturquoise: 0xafeeee,
        palevioletred: 0xdb7093,
        papayawhip: 0xffefd5,
        peachpuff: 0xffdab9,
        peru: 0xcd853f,
        pink: 0xffc0cb,
        plum: 0xdda0dd,
        powderblue: 0xb0e0e6,
        purple: 0x800080,
        rebeccapurple: 0x663399,
        red: 0xff0000,
        rosybrown: 0xbc8f8f,
        royalblue: 0x4169e1,
        saddlebrown: 0x8b4513,
        salmon: 0xfa8072,
        sandybrown: 0xf4a460,
        seagreen: 0x2e8b57,
        seashell: 0xfff5ee,
        sienna: 0xa0522d,
        silver: 0xc0c0c0,
        skyblue: 0x87ceeb,
        slateblue: 0x6a5acd,
        slategray: 0x708090,
        slategrey: 0x708090,
        snow: 0xfffafa,
        springgreen: 0x00ff7f,
        steelblue: 0x4682b4,
        tan: 0xd2b48c,
        teal: 0x008080,
        thistle: 0xd8bfd8,
        tomato: 0xff6347,
        turquoise: 0x40e0d0,
        violet: 0xee82ee,
        wheat: 0xf5deb3,
        white: 0xffffff,
        whitesmoke: 0xf5f5f5,
        yellow: 0xffff00,
        yellowgreen: 0x9acd32
    })
);
const systemColors = new Map(
    Object.entries({
        "ActiveBorder": 0x3b99fc,
        "ActiveCaption": 0x000000,
        "AppWorkspace": 0xaaaaaa,
        "Background": 0x6363ce,
        "ButtonFace": 0xffffff,
        "ButtonHighlight": 0xe9e9e9,
        "ButtonShadow": 0x9fa09f,
        "ButtonText": 0x000000,
        "CaptionText": 0x000000,
        "GrayText": 0x7f7f7f,
        "Highlight": 0xb2d7ff,
        "HighlightText": 0x000000,
        "InactiveBorder": 0xffffff,
        "InactiveCaption": 0xffffff,
        "InactiveCaptionText": 0x000000,
        "InfoBackground": 0xfbfcc5,
        "InfoText": 0x000000,
        "Menu": 0xf6f6f6,
        "MenuText": 0xffffff,
        "Scrollbar": 0xaaaaaa,
        "ThreeDDarkShadow": 0x000000,
        "ThreeDFace": 0xc0c0c0,
        "ThreeDHighlight": 0xffffff,
        "ThreeDLightShadow": 0xffffff,
        "ThreeDShadow": 0x000000,
        "Window": 0xececec,
        "WindowFrame": 0xaaaaaa,
        "WindowText": 0x000000,
        "-webkit-focus-ring-color": 0xe59700
    }).map(([key, value]) => [key.toLowerCase(), value])
);

function scale(x, inLow, inHigh, outLow, outHigh) {
    return ((x - inLow) * (outHigh - outLow)) / (inHigh - inLow) + outLow;
}
function clamp(x, min, max) {
    return Math.min(max, Math.max(min, x));
}
function multiplyMatrices(m1, m2) {
    const result = [];
    for (let i = 0; i < m1.length; i++) {
        result[i] = [];
        for (let j = 0; j < m2[0].length; j++) {
            let sum = 0;
            for (let k = 0; k < m1[0].length; k++) {
                sum += m1[i][k] * m2[k][j];
            }
            result[i][j] = sum;
        }
    }
    return result;
}

function isFirefox() {
    return navigator.userAgent.includes("Firefox");
}
function isMacOS() {
    return navigator.platform.toLowerCase().startsWith("mac");
}
function isDeepSelectorSupported() {
    try {
        document.querySelector("x /deep/ x");
        return true;
    } catch (err) {
        return false;
    }
}

function getMatches(regex, input, group = 0) {
    const matches = [];
    let m;
    while ((m = regex.exec(input))) {
        matches.push(m[group]);
    }
    return matches;
}

function createFilterMatrix(config) {
    let m = Matrix.identity();
    if (config.sepia !== 0) {
        m = multiplyMatrices(m, Matrix.sepia(config.sepia / 100));
    }
    if (config.grayscale !== 0) {
        m = multiplyMatrices(m, Matrix.grayscale(config.grayscale / 100));
    }
    if (config.contrast !== 100) {
        m = multiplyMatrices(m, Matrix.contrast(config.contrast / 100));
    }
    if (config.brightness !== 100) {
        m = multiplyMatrices(m, Matrix.brightness(config.brightness / 100));
    }
    if (config.mode === 1) {
        m = multiplyMatrices(m, Matrix.invertNHue());
    }
    return m;
}
function applyColorMatrix([r, g, b], matrix) {
    const rgb = [[r / 255], [g / 255], [b / 255], [1], [1]];
    const result = multiplyMatrices(matrix, rgb);
    return [0, 1, 2].map((i) =>
        clamp(Math.round(result[i][0] * 255), 0, 255)
    );
}
const Matrix = {
    identity() {
        return [
            [1, 0, 0, 0, 0],
            [0, 1, 0, 0, 0],
            [0, 0, 1, 0, 0],
            [0, 0, 0, 1, 0],
            [0, 0, 0, 0, 1]
        ];
    },
    invertNHue() {
        return [
            [0.333, -0.667, -0.667, 0, 1],
            [-0.667, 0.333, -0.667, 0, 1],
            [-0.667, -0.667, 0.333, 0, 1],
            [0, 0, 0, 1, 0],
            [0, 0, 0, 0, 1]
        ];
    },
    brightness(v) {
        return [
            [v, 0, 0, 0, 0],
            [0, v, 0, 0, 0],
            [0, 0, v, 0, 0],
            [0, 0, 0, 1, 0],
            [0, 0, 0, 0, 1]
        ];
    },
    contrast(v) {
        const t = (1 - v) / 2;
        return [
            [v, 0, 0, 0, t],
            [0, v, 0, 0, t],
            [0, 0, v, 0, t],
            [0, 0, 0, 1, 0],
            [0, 0, 0, 0, 1]
        ];
    },
    sepia(v) {
        return [
            [
                0.393 + 0.607 * (1 - v),
                0.769 - 0.769 * (1 - v),
                0.189 - 0.189 * (1 - v),
                0,
                0
            ],
            [
                0.349 - 0.349 * (1 - v),
                0.686 + 0.314 * (1 - v),
                0.168 - 0.168 * (1 - v),
                0,
                0
            ],
            [
                0.272 - 0.272 * (1 - v),
                0.534 - 0.534 * (1 - v),
                0.131 + 0.869 * (1 - v),
                0,
                0
            ],
            [0, 0, 0, 1, 0],
            [0, 0, 0, 0, 1]
        ];
    },
    grayscale(v) {
        return [
            [
                0.2126 + 0.7874 * (1 - v),
                0.7152 - 0.7152 * (1 - v),
                0.0722 - 0.0722 * (1 - v),
                0,
                0
            ],
            [
                0.2126 - 0.2126 * (1 - v),
                0.7152 + 0.2848 * (1 - v),
                0.0722 - 0.0722 * (1 - v),
                0,
                0
            ],
            [
                0.2126 - 0.2126 * (1 - v),
                0.7152 - 0.7152 * (1 - v),
                0.0722 + 0.9278 * (1 - v),
                0,
                0
            ],
            [0, 0, 0, 1, 0],
            [0, 0, 0, 0, 1]
        ];
    }
};

const colorModificationCache = new Map();
function clearColorModificationCache() {
    colorModificationCache.clear();
}
function modifyColorWithCache(rgb, filter, modifyHSL) {
    let fnCache;
    if (colorModificationCache.has(modifyHSL)) {
        fnCache = colorModificationCache.get(modifyHSL);
    } else {
        fnCache = new Map();
        colorModificationCache.set(modifyHSL, fnCache);
    }
    const id = Object.entries(rgb)
        .concat(
            Object.entries(filter).filter(
                ([key]) =>
                    [
                        "mode",
                        "brightness",
                        "contrast",
                        "grayscale",
                        "sepia"
                    ].indexOf(key) >= 0
            )
        )
        .map(([key, value]) => `${key}:${value}`)
        .join(";");
    if (fnCache.has(id)) {
        return fnCache.get(id);
    }
    const hsl = rgbToHSL(rgb);
    const modified = modifyHSL(hsl);
    const {r, g, b, a} = hslToRGB(modified);
    const matrix = createFilterMatrix(filter);
    const [rf, gf, bf] = applyColorMatrix([r, g, b], matrix);
    const color =
        a === 1
            ? rgbToHexString({r: rf, g: gf, b: bf})
            : rgbToString({r: rf, g: gf, b: bf, a});
    fnCache.set(id, color);
    return color;
}
function noopHSL(hsl) {
    return hsl;
}
function modifyColor(rgb, theme) {
    return modifyColorWithCache(rgb, theme, noopHSL);
}
function modifyLightModeHSL({h, s, l, a}) {
    const lMin = 0;
    const lMid = 0.4;
    const lMax = 0.9;
    const sNeutralLim = 0.36;
    const lNeutralDark = 0.2;
    const lNeutralLight = 0.8;
    const sColored = 0.16;
    const hColoredL0 = 205;
    const hColoredL1 = 40;
    const lx = scale(l, 0, 1, lMin, lMax);
    let hx = h;
    let sx = s;
    const isNeutral =
        l < lNeutralDark || l > lNeutralLight || s < sNeutralLim;
    if (isNeutral) {
        sx =
            l < lMid
                ? scale(l, 0, lMid, sColored, 0)
                : scale(l, lMid, 1, 0, sColored);
        hx = l < lMid ? hColoredL0 : hColoredL1;
    }
    return {h: hx, s: sx, l: lx, a};
}
function modifyBgHSL({h, s, l, a}) {
    const lMin = 0.1;
    const lMaxS0 = 0.25;
    const lMaxS1 = 0.4;
    const sNeutralLim = 0.12;
    const lNeutralLight = 0.8;
    const sColored = 0.05;
    const hColored = 205;
    const hBlue0 = 200;
    const hBlue1 = 280;
    const lMax = scale(s, 0, 1, lMaxS0, lMaxS1);
    const lx = l < lMax ? l : l < 0.5 ? lMax : scale(l, 0.5, 1, lMax, lMin);
    const isNeutral =
        (l >= lNeutralLight && h > hBlue0 && h < hBlue1) || s < sNeutralLim;
    let hx = h;
    let sx = s;
    if (isNeutral) {
        sx = sColored;
        hx = hColored;
    }
    return {h: hx, s: sx, l: lx, a};
}
function modifyBackgroundColor(rgb, filter) {
    if (filter.mode === 0) {
        return modifyColorWithCache(rgb, filter, modifyLightModeHSL);
    }
    return modifyColorWithCache(rgb, {...filter, mode: 0}, modifyBgHSL);
}
function modifyFgHSL({h, s, l, a}) {
    const lMax = 0.9;
    const lMinS0 = 0.7;
    const lMinS1 = 0.6;
    const sNeutralLim = 0.24;
    const lNeutralDark = 0.2;
    const sColored = 0.1;
    const hColored = 40;
    const hBlue0 = 205;
    const hBlue1 = 245;
    const hBlueMax = 220;
    const lBlueMin = 0.7;
    const isBlue = h > hBlue0 && h <= hBlue1;
    const lMin = scale(
        s,
        0,
        1,
        isBlue ? scale(h, hBlue0, hBlue1, lMinS0, lBlueMin) : lMinS0,
        lMinS1
    );
    const lx = l < 0.5 ? scale(l, 0, 0.5, lMax, lMin) : l < lMin ? lMin : l;
    let hx = h;
    let sx = s;
    if (isBlue) {
        hx = scale(hx, hBlue0, hBlue1, hBlue0, hBlueMax);
    }
    const isNeutral = l < lNeutralDark || s < sNeutralLim;
    if (isNeutral) {
        sx = sColored;
        hx = hColored;
    }
    return {h: hx, s: sx, l: lx, a};
}
function modifyForegroundColor(rgb, filter) {
    if (filter.mode === 0) {
        return modifyColorWithCache(rgb, filter, modifyLightModeHSL);
    }
    return modifyColorWithCache(rgb, {...filter, mode: 0}, modifyFgHSL);
}
function modifyBorderHSL({h, s, l, a}) {
    const lMinS0 = 0.2;
    const lMinS1 = 0.3;
    const lMaxS0 = 0.4;
    const lMaxS1 = 0.5;
    const lMin = scale(s, 0, 1, lMinS0, lMinS1);
    const lMax = scale(s, 0, 1, lMaxS0, lMaxS1);
    const lx = scale(l, 0, 1, lMax, lMin);
    return {h, s, l: lx, a};
}
function modifyBorderColor(rgb, filter) {
    if (filter.mode === 0) {
        return modifyColorWithCache(rgb, filter, modifyLightModeHSL);
    }
    return modifyColorWithCache(rgb, {...filter, mode: 0}, modifyBorderHSL);
}
function modifyShadowColor(rgb, filter) {
    return modifyBackgroundColor(rgb, filter);
}
function modifyGradientColor(rgb, filter) {
    return modifyBackgroundColor(rgb, filter);
}

function getURLHost(url) {
    return url.match(/^(.*?\/{2,3})?(.+?)(\/|$)/)[2];
}

function createTextStyle(config) {
    const lines = [];
    lines.push("* {");
    if (config.useFont && config.fontFamily) {
        lines.push(`  font-family: ${config.fontFamily} !important;`);
    }
    if (config.textStroke > 0) {
        lines.push(
            `  -webkit-text-stroke: ${config.textStroke}px !important;`
        );
        lines.push(`  text-stroke: ${config.textStroke}px !important;`);
    }
    lines.push("}");
    return lines.join("\n");
}

var FilterMode;
(function(FilterMode) {
    FilterMode[(FilterMode["light"] = 0)] = "light";
    FilterMode[(FilterMode["dark"] = 1)] = "dark";
})(FilterMode || (FilterMode = {}));
function getCSSFilterValue(config) {
    const filters = [];
    if (config.mode === FilterMode.dark) {
        filters.push("invert(100%) hue-rotate(180deg)");
    }
    if (config.brightness !== 100) {
        filters.push(`brightness(${config.brightness}%)`);
    }
    if (config.contrast !== 100) {
        filters.push(`contrast(${config.contrast}%)`);
    }
    if (config.grayscale !== 0) {
        filters.push(`grayscale(${config.grayscale}%)`);
    }
    if (config.sepia !== 0) {
        filters.push(`sepia(${config.sepia}%)`);
    }
    if (filters.length === 0) {
        return null;
    }
    return filters.join(" ");
}

function toSVGMatrix(matrix) {
    return matrix
        .slice(0, 4)
        .map((m) => m.map((m) => m.toFixed(3)).join(" "))
        .join(" ");
}
function getSVGFilterMatrixValue(config) {
    return toSVGMatrix(createFilterMatrix(config));
}

let counter = 0;
const resolvers = new Map();
const rejectors = new Map();
function bgFetch(request) {
    return new Promise((resolve, reject) => {
        const id = ++counter;
        resolvers.set(id, resolve);
        rejectors.set(id, reject);
        chrome.runtime.sendMessage({type: "fetch", data: request, id});
    });
}
chrome.runtime.onMessage.addListener(({type, data, error, id}) => {
    if (type === "fetch-response") {
        const resolve = resolvers.get(id);
        const reject = rejectors.get(id);
        resolvers.delete(id);
        rejectors.delete(id);
        if (error) {
            reject && reject(error);
        } else {
            resolve && resolve(data);
        }
    }
});

async function getOKResponse(url) {
    const response = await fetch(url, {cache: "force-cache"});
    if (response.ok) {
        return response;
    } else {
        throw new Error(
            `Unable to load ${url} ${response.status} ${response.statusText}`
        );
    }
}
async function loadAsDataURL(url) {
    const response = await getOKResponse(url);
    const blob = await response.blob();
    const dataURL = await new Promise((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.readAsDataURL(blob);
    });
    return dataURL;
}

async function getImageDetails(url) {
    let dataURL;
    if (url.startsWith("data:")) {
        dataURL = url;
    } else {
        dataURL = await getImageDataURL(url);
    }
    const image = await urlToImage(dataURL);
    const info = analyzeImage(image);
    return {
        src: url,
        dataURL,
        width: image.naturalWidth,
        height: image.naturalHeight,
        ...info
    };
}
async function getImageDataURL(url) {
    if (getURLHost(url) === location.host) {
        return await loadAsDataURL(url);
    }
    return await bgFetch({url, responseType: "data-url"});
}
async function urlToImage(url) {
    return new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = () => reject(`Unable to load image ${url}`);
        image.src = url;
    });
}
function analyzeImage(image) {
    const MAX_ANALIZE_PIXELS_COUNT = 32 * 32;
    const naturalPixelsCount = image.naturalWidth * image.naturalHeight;
    const k = Math.min(
        1,
        Math.sqrt(MAX_ANALIZE_PIXELS_COUNT / naturalPixelsCount)
    );
    const width = Math.max(1, Math.round(image.naturalWidth * k));
    const height = Math.max(1, Math.round(image.naturalHeight * k));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    context.imageSmoothingEnabled = false;
    context.drawImage(image, 0, 0, width, height);
    const imageData = context.getImageData(0, 0, width, height);
    const d = imageData.data;
    const TRANSPARENT_ALPHA_THRESHOLD = 0.05;
    const DARK_LIGHTNESS_THRESHOLD = 0.4;
    const LIGHT_LIGHTNESS_THRESHOLD = 0.7;
    let transparentPixelsCount = 0;
    let darkPixelsCount = 0;
    let lightPixelsCount = 0;
    let i, x, y;
    let r, g, b, a;
    let l, min, max;
    for (y = 0; y < height; y++) {
        for (x = 0; x < width; x++) {
            i = 4 * (y * width + x);
            r = d[i + 0] / 255;
            g = d[i + 1] / 255;
            b = d[i + 2] / 255;
            a = d[i + 3] / 255;
            if (a < TRANSPARENT_ALPHA_THRESHOLD) {
                transparentPixelsCount++;
            } else {
                min = Math.min(r, g, b);
                max = Math.max(r, g, b);
                l = (max + min) / 2;
                if (l < DARK_LIGHTNESS_THRESHOLD) {
                    darkPixelsCount++;
                }
                if (l > LIGHT_LIGHTNESS_THRESHOLD) {
                    lightPixelsCount++;
                }
            }
        }
    }
    const totalPixelsCount = width * height;
    const opaquePixelsCount = totalPixelsCount - transparentPixelsCount;
    const DARK_IMAGE_THRESHOLD = 0.7;
    const LIGHT_IMAGE_THRESHOLD = 0.7;
    const TRANSPARENT_IMAGE_THRESHOLD = 0.1;
    const LARGE_IMAGE_PIXELS_COUNT = 800 * 600;
    return {
        isDark: darkPixelsCount / opaquePixelsCount >= DARK_IMAGE_THRESHOLD,
        isLight:
            lightPixelsCount / opaquePixelsCount >= LIGHT_IMAGE_THRESHOLD,
        isTransparent:
            transparentPixelsCount / totalPixelsCount >=
            TRANSPARENT_IMAGE_THRESHOLD,
        isLarge: naturalPixelsCount >= LARGE_IMAGE_PIXELS_COUNT
    };
}
function getFilteredImageDataURL({dataURL, width, height}, filter) {
    const matrix = getSVGFilterMatrixValue(filter);
    const svg = [
        `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${width}" height="${height}">`,
        "<defs>",
        '<filter id="darkslack-image-filter">',
        `<feColorMatrix type="matrix" values="${matrix}" />`,
        "</filter>",
        "</defs>",
        `<image width="${width}" height="${height}" filter="url(#darkslack-image-filter)" xlink:href="${dataURL}" />`,
        "</svg>"
    ].join("");
    const bytes = new Uint8Array(svg.length);
    for (let i = 0; i < svg.length; i++) {
        bytes[i] = svg.charCodeAt(i);
    }
    const blob = new Blob([bytes], {type: "image/svg+xml"});
    const objectURL = URL.createObjectURL(blob);
    return objectURL;
}

function getModifiableCSSDeclaration(property, value, rule, isCancelled) {
    const important = Boolean(
        rule && rule.style && rule.style.getPropertyPriority(property)
    );
    const sourceValue = value;
    if (property.startsWith("--")) {
        return null;
    } else if (
        (property.indexOf("color") >= 0 &&
            property !== "-webkit-print-color-adjust") ||
        property === "fill" ||
        property === "stroke"
    ) {
        const modifier = getColorModifier(property, value);
        if (modifier) {
            return {property, value: modifier, important, sourceValue};
        }
    } else if (property === "background-image") {
        const modifier = getBgImageModifier(
            property,
            value,
            rule,
            isCancelled
        );
        if (modifier) {
            return {property, value: modifier, important, sourceValue};
        }
    } else if (property.indexOf("shadow") >= 0) {
        const modifier = getShadowModifier(property, value);
        if (modifier) {
            return {property, value: modifier, important, sourceValue};
        }
    }
    return null;
}
function getModifiedUserAgentStyle(filter, isIFrame) {
    const lines = [];
    if (!isIFrame) {
        lines.push("html {");
        lines.push(
            `    background-color: ${modifyBackgroundColor(
                {r: 255, g: 255, b: 255},
                filter
            )} !important;`
        );
        lines.push("}");
    }
    lines.push(
        `${isIFrame ? "" : "html, body, "}input, textarea, select, button {`
    );
    lines.push(
        `    background-color: ${modifyBackgroundColor(
            {r: 255, g: 255, b: 255},
            filter
        )};`
    );
    lines.push("}");
    lines.push("html, body, input, textarea, select, button {");
    lines.push(
        `    border-color: ${modifyBorderColor(
            {r: 76, g: 76, b: 76},
            filter
        )};`
    );
    lines.push(
        `    color: ${modifyForegroundColor({r: 0, g: 0, b: 0}, filter)};`
    );
    lines.push("}");
    lines.push("a {");
    lines.push(
        `    color: ${modifyForegroundColor(
            {r: 0, g: 64, b: 255},
            filter
        )};`
    );
    lines.push("}");
    lines.push("table {");
    lines.push(
        `    border-color: ${modifyBorderColor(
            {r: 128, g: 128, b: 128},
            filter
        )};`
    );
    lines.push("}");
    lines.push("::placeholder {");
    lines.push(
        `    color: ${modifyForegroundColor(
            {r: 169, g: 169, b: 169},
            filter
        )};`
    );
    lines.push("}");
    ["::selection", "::-moz-selection"].forEach((selection) => {
        lines.push(`${selection} {`);
        lines.push(
            `    background-color: ${modifyBackgroundColor(
                {r: 0, g: 96, b: 212},
                filter
            )};`
        );
        lines.push(
            `    color: ${modifyForegroundColor(
                {r: 255, g: 255, b: 255},
                filter
            )};`
        );
        lines.push("}");
    });
    lines.push("input:-webkit-autofill,");
    lines.push("textarea:-webkit-autofill,");
    lines.push("select:-webkit-autofill {");
    lines.push(
        `    background-color: ${modifyBackgroundColor(
            {r: 250, g: 255, b: 189},
            filter
        )} !important;`
    );
    lines.push(
        `    color: ${modifyForegroundColor(
            {r: 0, g: 0, b: 0},
            filter
        )} !important;`
    );
    lines.push("}");
    if (!isMacOS()) {
        lines.push("::-webkit-scrollbar {");
        lines.push(
            `    background-color: ${modifyBackgroundColor(
                {r: 241, g: 241, b: 241},
                filter
            )};`
        );
        lines.push(
            `    color: ${modifyForegroundColor(
                {r: 96, g: 96, b: 96},
                filter
            )};`
        );
        lines.push("}");
        lines.push("::-webkit-scrollbar-thumb {");
        lines.push(
            `    background-color: ${modifyBackgroundColor(
                {r: 193, g: 193, b: 193},
                filter
            )};`
        );
        lines.push("}");
        lines.push("::-webkit-scrollbar-thumb:hover {");
        lines.push(
            `    background-color: ${modifyBackgroundColor(
                {r: 166, g: 166, b: 166},
                filter
            )};`
        );
        lines.push("}");
        lines.push("::-webkit-scrollbar-thumb:active {");
        lines.push(
            `    background-color: ${modifyBackgroundColor(
                {r: 96, g: 96, b: 96},
                filter
            )};`
        );
        lines.push("}");
        lines.push("::-webkit-scrollbar-corner {");
        lines.push(
            `    background-color: ${modifyBackgroundColor(
                {r: 255, g: 255, b: 255},
                filter
            )};`
        );
        lines.push("}");
        lines.push("* {");
        lines.push(
            `    scrollbar-color: ${modifyBackgroundColor(
                {r: 193, g: 193, b: 193},
                filter
            )} ${modifyBackgroundColor({r: 241, g: 241, b: 241}, filter)};`
        );
        lines.push("}");
    }
    return lines.join("\n");
}
function getModifiedFallbackStyle(filter, {strict}) {
    const lines = [];
    lines.push(`html, body, ${strict ? "body *" : "body > *"} {`);
    lines.push(
        `    background-color: ${modifyBackgroundColor(
            {r: 255, g: 255, b: 255},
            filter
        )} !important;`
    );
    lines.push(
        `    border-color: ${modifyBorderColor(
            {r: 64, g: 64, b: 64},
            filter
        )} !important;`
    );
    lines.push(
        `    color: ${modifyForegroundColor(
            {r: 0, g: 0, b: 0},
            filter
        )} !important;`
    );
    lines.push("}");
    return lines.join("\n");
}
const unparsableColors = new Set([
    "inherit",
    "transparent",
    "initial",
    "currentcolor",
    "none"
]);
const colorParseCache = new Map();
function parseColorWithCache($color) {
    $color = $color.trim();
    if (colorParseCache.has($color)) {
        return colorParseCache.get($color);
    }
    const color = parse($color);
    colorParseCache.set($color, color);
    return color;
}
function tryParseColor($color) {
    try {
        return parseColorWithCache($color);
    } catch (err) {
        return null;
    }
}
function getColorModifier(prop, value) {
    if (unparsableColors.has(value.toLowerCase())) {
        return value;
    }
    try {
        const rgb = parseColorWithCache(value);
        if (prop.indexOf("background") >= 0) {
            return (filter) => modifyBackgroundColor(rgb, filter);
        }
        if (prop.indexOf("border") >= 0 || prop.indexOf("outline") >= 0) {
            return (filter) => modifyBorderColor(rgb, filter);
        }
        return (filter) => modifyForegroundColor(rgb, filter);
    } catch (err) {
        return null;
    }
}
const gradientRegex = /[\-a-z]+gradient\(([^\(\)]*(\(([^\(\)]*(\(.*?\)))*[^\(\)]*\))){0,15}[^\(\)]*\)/g;
const imageDetailsCache = new Map();
const awaitingForImageLoading = new Map();
function getBgImageModifier(prop, value, rule, isCancelled) {
    try {
        const gradients = getMatches(gradientRegex, value);
        const urls = getMatches(cssURLRegex, value);
        if (urls.length === 0 && gradients.length === 0) {
            return value;
        }
        const getIndices = (matches) => {
            let index = 0;
            return matches.map((match) => {
                const valueIndex = value.indexOf(match, index);
                index = valueIndex + match.length;
                return {match, index: valueIndex};
            });
        };
        const matches = getIndices(urls)
            .map((i) => ({type: "url", ...i}))
            .concat(
                getIndices(gradients).map((i) => ({type: "gradient", ...i}))
            )
            .sort((a, b) => a.index - b.index);
        const getGradientModifier = (gradient) => {
            const match = gradient.match(/^(.*-gradient)\((.*)\)$/);
            const type = match[1];
            const content = match[2];
            const partsRegex = /([^\(\),]+(\([^\(\)]*(\([^\(\)]*\)*[^\(\)]*)?\))?[^\(\),]*),?/g;
            const colorStopRegex = /^(from|color-stop|to)\(([^\(\)]*?,\s*)?(.*?)\)$/;
            const parts = getMatches(partsRegex, content, 1).map((part) => {
                part = part.trim();
                let rgb = tryParseColor(part);
                if (rgb) {
                    return (filter) => modifyGradientColor(rgb, filter);
                }
                const space = part.lastIndexOf(" ");
                rgb = tryParseColor(part.substring(0, space));
                if (rgb) {
                    return (filter) =>
                        `${modifyGradientColor(
                            rgb,
                            filter
                        )} ${part.substring(space + 1)}`;
                }
                const colorStopMatch = part.match(colorStopRegex);
                if (colorStopMatch) {
                    rgb = tryParseColor(colorStopMatch[3]);
                    if (rgb) {
                        return (filter) =>
                            `${colorStopMatch[1]}(${
                                colorStopMatch[2]
                                    ? `${colorStopMatch[2]}, `
                                    : ""
                            }${modifyGradientColor(rgb, filter)})`;
                    }
                }
                return () => part;
            });
            return (filter) => {
                return `${type}(${parts
                    .map((modify) => modify(filter))
                    .join(", ")})`;
            };
        };
        const getURLModifier = (urlValue) => {
            let url = getCSSURLValue(urlValue);
            if (rule.parentStyleSheet.href) {
                const basePath = getCSSBaseBath(rule.parentStyleSheet.href);
                url = getAbsoluteURL(basePath, url);
            } else if (
                rule.parentStyleSheet.ownerNode &&
                rule.parentStyleSheet.ownerNode.baseURI
            ) {
                url = getAbsoluteURL(
                    rule.parentStyleSheet.ownerNode.baseURI,
                    url
                );
            } else {
                url = getAbsoluteURL(location.origin, url);
            }
            const absoluteValue = `url("${url}")`;
            return async (filter) => {
                let imageDetails;
                if (imageDetailsCache.has(url)) {
                    imageDetails = imageDetailsCache.get(url);
                } else {
                    try {
                        if (awaitingForImageLoading.has(url)) {
                            const awaiters = awaitingForImageLoading.get(
                                url
                            );
                            imageDetails = await new Promise((resolve) =>
                                awaiters.push(resolve)
                            );
                            if (!imageDetails) {
                                return null;
                            }
                        } else {
                            awaitingForImageLoading.set(url, []);
                            imageDetails = await getImageDetails(url);
                            imageDetailsCache.set(url, imageDetails);
                            awaitingForImageLoading
                                .get(url)
                                .forEach((resolve) =>
                                    resolve(imageDetails)
                                );
                            awaitingForImageLoading.delete(url);
                        }
                        if (isCancelled()) {
                            return null;
                        }
                    } catch (err) {
                        logWarn(err);
                        if (awaitingForImageLoading.has(url)) {
                            awaitingForImageLoading
                                .get(url)
                                .forEach((resolve) => resolve(null));
                            awaitingForImageLoading.delete(url);
                        }
                        return absoluteValue;
                    }
                }
                const bgImageValue =
                    getBgImageValue(imageDetails, filter) || absoluteValue;
                return bgImageValue;
            };
        };
        const getBgImageValue = (imageDetails, filter) => {
            const {
                isDark,
                isLight,
                isTransparent,
                isLarge,
                width
            } = imageDetails;
            let result;
            if (
                isDark &&
                isTransparent &&
                filter.mode === 1 &&
                !isLarge &&
                width > 2
            ) {
                logInfo(`Inverting dark image ${imageDetails.src}`);
                const inverted = getFilteredImageDataURL(imageDetails, {
                    ...filter,
                    sepia: clamp(filter.sepia + 10, 0, 100)
                });
                result = `url("${inverted}")`;
            } else if (isLight && !isTransparent && filter.mode === 1) {
                if (isLarge) {
                    result = "none";
                } else {
                    logInfo(`Dimming light image ${imageDetails.src}`);
                    const dimmed = getFilteredImageDataURL(
                        imageDetails,
                        filter
                    );
                    result = `url("${dimmed}")`;
                }
            } else if (filter.mode === 0 && isLight && !isLarge) {
                logInfo(`Applying filter to image ${imageDetails.src}`);
                const filtered = getFilteredImageDataURL(imageDetails, {
                    ...filter,
                    brightness: clamp(filter.brightness - 10, 5, 200),
                    sepia: clamp(filter.sepia + 10, 0, 100)
                });
                result = `url("${filtered}")`;
            } else {
                result = null;
            }
            return result;
        };
        const modifiers = [];
        let index = 0;
        matches.forEach(({match, type, index: matchStart}, i) => {
            const prefixStart = index;
            const matchEnd = matchStart + match.length;
            index = matchEnd;
            modifiers.push(() => value.substring(prefixStart, matchStart));
            modifiers.push(
                type === "url"
                    ? getURLModifier(match)
                    : getGradientModifier(match)
            );
            if (i === matches.length - 1) {
                modifiers.push(() => value.substring(matchEnd));
            }
        });
        return (filter) => {
            const results = modifiers.map((modify) => modify(filter));
            if (results.some((r) => r instanceof Promise)) {
                return Promise.all(results).then((asyncResults) => {
                    return asyncResults.join("");
                });
            }
            return results.join("");
        };
    } catch (err) {
        return null;
    }
}
function getShadowModifier(prop, value) {
    try {
        let index = 0;
        const colorMatches = getMatches(
            /(^|\s)([a-z]+\(.+?\)|#[0-9a-f]+|[a-z]+)(.*?(inset|outset)?($|,))/gi,
            value,
            2
        );
        const modifiers = colorMatches.map((match, i) => {
            const prefixIndex = index;
            const matchIndex = value.indexOf(match, index);
            const matchEnd = matchIndex + match.length;
            index = matchEnd;
            const rgb = tryParseColor(match);
            if (!rgb) {
                return () => value.substring(prefixIndex, matchEnd);
            }
            return (filter) =>
                `${value.substring(
                    prefixIndex,
                    matchIndex
                )}${modifyShadowColor(rgb, filter)}${
                    i === colorMatches.length - 1
                        ? value.substring(matchEnd)
                        : ""
                }`;
        });
        return (filter) =>
            modifiers.map((modify) => modify(filter)).join("");
    } catch (err) {
        return null;
    }
}
function cleanModificationCache() {
    colorParseCache.clear();
    clearColorModificationCache();
    imageDetailsCache.clear();
    awaitingForImageLoading.clear();
}

const overrides = {
    "background-color": {
        customProp: "--darkslack-inline-bgcolor",
        cssProp: "background-color",
        dataAttr: "data-darkslack-inline-bgcolor",
        store: new WeakSet()
    },
    "background-image": {
        customProp: "--darkslack-inline-bgimage",
        cssProp: "background-image",
        dataAttr: "data-darkslack-inline-bgimage",
        store: new WeakSet()
    },
    "border-color": {
        customProp: "--darkslack-inline-border",
        cssProp: "border-color",
        dataAttr: "data-darkslack-inline-border",
        store: new WeakSet()
    },
    "border-bottom-color": {
        customProp: "--darkslack-inline-border-bottom",
        cssProp: "border-bottom-color",
        dataAttr: "data-darkslack-inline-border-bottom",
        store: new WeakSet()
    },
    "border-left-color": {
        customProp: "--darkslack-inline-border-left",
        cssProp: "border-left-color",
        dataAttr: "data-darkslack-inline-border-left",
        store: new WeakSet()
    },
    "border-right-color": {
        customProp: "--darkslack-inline-border-right",
        cssProp: "border-right-color",
        dataAttr: "data-darkslack-inline-border-right",
        store: new WeakSet()
    },
    "border-top-color": {
        customProp: "--darkslack-inline-border-top",
        cssProp: "border-top-color",
        dataAttr: "data-darkslack-inline-border-top",
        store: new WeakSet()
    },
    "box-shadow": {
        customProp: "--darkslack-inline-boxshadow",
        cssProp: "box-shadow",
        dataAttr: "data-darkslack-inline-boxshadow",
        store: new WeakSet()
    },
    "color": {
        customProp: "--darkslack-inline-color",
        cssProp: "color",
        dataAttr: "data-darkslack-inline-color",
        store: new WeakSet()
    },
    "fill": {
        customProp: "--darkslack-inline-fill",
        cssProp: "fill",
        dataAttr: "data-darkslack-inline-fill",
        store: new WeakSet()
    },
    "stroke": {
        customProp: "--darkslack-inline-stroke",
        cssProp: "stroke",
        dataAttr: "data-darkslack-inline-stroke",
        store: new WeakSet()
    },
    "outline-color": {
        customProp: "--darkslack-inline-outline",
        cssProp: "outline-color",
        dataAttr: "data-darkslack-inline-outline",
        store: new WeakSet()
    }
};
const overridesList = Object.values(overrides);
const INLINE_STYLE_ATTRS = ["style", "fill", "stroke", "bgcolor", "color"];
const INLINE_STYLE_SELECTOR = INLINE_STYLE_ATTRS.map(
    (attr) => `[${attr}]`
).join(", ");
function getInlineOverrideStyle() {
    return overridesList
        .map(({dataAttr, customProp, cssProp}) => {
            return [
                `[${dataAttr}] {`,
                `  ${cssProp}: var(${customProp}) !important;`,
                "}"
            ].join("\n");
        })
        .join("\n");
}
let observer = null;
function expand(nodes, selector) {
    const results = [];
    nodes.forEach((n) => {
        if (n instanceof Element) {
            if (n.matches(selector)) {
                results.push(n);
            }
            results.push(...Array.from(n.querySelectorAll(selector)));
        }
    });
    return results;
}
function watchForInlineStyles(elementStyleDidChange) {
    if (observer) {
        observer.disconnect();
    }
    observer = new MutationObserver((mutations) => {
        mutations.forEach((m) => {
            const createdInlineStyles = expand(
                Array.from(m.addedNodes),
                INLINE_STYLE_SELECTOR
            );
            if (createdInlineStyles.length > 0) {
                createdInlineStyles.forEach((el) =>
                    elementStyleDidChange(el)
                );
            }
            if (m.type === "attributes") {
                if (INLINE_STYLE_ATTRS.includes(m.attributeName)) {
                    elementStyleDidChange(m.target);
                }
                overridesList
                    .filter(
                        ({store, dataAttr}) =>
                            store.has(m.target) &&
                            !m.target.hasAttribute(dataAttr)
                    )
                    .forEach(({dataAttr}) =>
                        m.target.setAttribute(dataAttr, "")
                    );
            }
        });
    });
    observer.observe(document, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: INLINE_STYLE_ATTRS.concat(
            overridesList.map(({dataAttr}) => dataAttr)
        )
    });
}
function stopWatchingForInlineStyles() {
    if (observer) {
        observer.disconnect();
        observer = null;
    }
}
const inlineStyleCache = new WeakMap();
const filterProps = [
    "brightness",
    "contrast",
    "grayscale",
    "sepia",
    "mode"
];
function getInlineStyleCacheKey(el, theme) {
    return INLINE_STYLE_ATTRS.map(
        (attr) => `${attr}="${el.getAttribute(attr)}"`
    )
        .concat(filterProps.map((prop) => `${prop}="${theme[prop]}"`))
        .join(" ");
}
function overrideInlineStyle(element, theme) {
    const cacheKey = getInlineStyleCacheKey(element, theme);
    if (cacheKey === inlineStyleCache.get(element)) {
        return;
    }
    const unsetProps = new Set(Object.keys(overrides));
    function setCustomProp(targetCSSProp, modifierCSSProp, cssVal) {
        const {customProp, dataAttr} = overrides[targetCSSProp];
        const mod = getModifiableCSSDeclaration(
            modifierCSSProp,
            cssVal,
            null,
            null
        );
        if (!mod) {
            return;
        }
        let value = mod.value;
        if (typeof value === "function") {
            value = value(theme);
        }
        element.style.setProperty(customProp, value);
        if (!element.hasAttribute(dataAttr)) {
            element.setAttribute(dataAttr, "");
        }
        unsetProps.delete(targetCSSProp);
    }
    if (element.hasAttribute("bgcolor")) {
        let value = element.getAttribute("bgcolor");
        if (
            value.match(/^[0-9a-f]{3}$/i) ||
            value.match(/^[0-9a-f]{6}$/i)
        ) {
            value = `#${value}`;
        }
        setCustomProp("background-color", "background-color", value);
    }
    if (element.hasAttribute("color")) {
        let value = element.getAttribute("color");
        if (
            value.match(/^[0-9a-f]{3}$/i) ||
            value.match(/^[0-9a-f]{6}$/i)
        ) {
            value = `#${value}`;
        }
        setCustomProp("color", "color", value);
    }
    if (element.hasAttribute("fill") && element instanceof SVGElement) {
        const SMALL_SVG_LIMIT = 32;
        let value = element.getAttribute("fill");
        let isBg = false;
        if (!(element instanceof SVGTextElement)) {
            const {width, height} = element.getBoundingClientRect();
            isBg = width > SMALL_SVG_LIMIT || height > SMALL_SVG_LIMIT;
        }
        setCustomProp("fill", isBg ? "background-color" : "color", value);
    }
    if (element.hasAttribute("stroke")) {
        let value = element.getAttribute("stroke");
        setCustomProp(
            "stroke",
            element instanceof SVGLineElement ||
            element instanceof SVGTextElement
                ? "border-color"
                : "color",
            value
        );
    }
    element.style &&
    iterateCSSDeclarations(element.style, (property, value) => {
        if (
            property === "background-image" &&
            value.indexOf("url") >= 0
        ) {
            return;
        }
        if (overrides.hasOwnProperty(property)) {
            setCustomProp(property, property, value);
        }
    });
    if (
        element.style &&
        element instanceof SVGTextElement &&
        element.style.fill
    ) {
        setCustomProp(
            "fill",
            "color",
            element.style.getPropertyValue("fill")
        );
    }
    Array.from(unsetProps).forEach((cssProp) => {
        const {store, dataAttr} = overrides[cssProp];
        store.delete(element);
        element.removeAttribute(dataAttr);
    });
    inlineStyleCache.set(element, getInlineStyleCacheKey(element, theme));
}

const metaThemeColorName = "theme-color";
const metaThemeColorSelector = `meta[name="${metaThemeColorName}"]`;
let srcMetaThemeColor = null;
let observer$1 = null;
function changeMetaThemeColor(meta, theme) {
    srcMetaThemeColor = srcMetaThemeColor || meta.content;
    try {
        const color = parse(srcMetaThemeColor);
        meta.content = modifyBackgroundColor(color, theme);
    } catch (err) {}
}
function changeMetaThemeColorWhenAvailable(theme) {
    const meta = document.querySelector(metaThemeColorSelector);
    if (meta) {
        changeMetaThemeColor(meta, theme);
    } else {
        if (observer$1) {
            observer$1.disconnect();
        }
        observer$1 = new MutationObserver((mutations) => {
            loop: for (let m of mutations) {
                for (let node of Array.from(m.addedNodes)) {
                    if (
                        node instanceof HTMLMetaElement &&
                        node.name === metaThemeColorName
                    ) {
                        observer$1.disconnect();
                        observer$1 = null;
                        changeMetaThemeColor(node, theme);
                        break loop;
                    }
                }
            }
        });
        observer$1.observe(document.head, {childList: true});
    }
}
function restoreMetaThemeColor() {
    if (observer$1) {
        observer$1.disconnect();
        observer$1 = null;
    }
    const meta = document.querySelector(metaThemeColorSelector);
    if (meta && srcMetaThemeColor) {
        meta.content = srcMetaThemeColor;
    }
}

const STYLE_SELECTOR = isDeepSelectorSupported()
    ? 'html /deep/ link[rel*="stylesheet" i], html /deep/ style'
    : 'html link[rel*="stylesheet" i], html style';
function shouldManageStyle(element) {
    return (
        (element instanceof HTMLStyleElement ||
            (element instanceof HTMLLinkElement &&
                element.rel &&
                element.rel.toLowerCase().includes("stylesheet"))) &&
        !element.classList.contains("darkslack") &&
        element.media !== "print"
    );
}
const asyncQueue = createAsyncTasksQueue();
function manageStyle(element, {update, loadingStart, loadingEnd}) {
    const prevStyles = [];
    let next = element;
    while (
        (next = next.nextElementSibling) &&
        next.matches(".darkslack")
        ) {
        prevStyles.push(next);
    }
    let corsCopy =
        prevStyles.find((el) => el.matches(".darkslack--cors")) || null;
    let syncStyle =
        prevStyles.find((el) => el.matches(".darkslack--sync")) || null;
    let corsCopyPositionWatcher = null;
    let syncStylePositionWatcher = null;
    let cancelAsyncOperations = false;
    function isCancelled() {
        return cancelAsyncOperations;
    }
    const observer = new MutationObserver(() => {
        update();
    });
    const observerOptions = {
        attributes: true,
        childList: true,
        characterData: true
    };
    function containsCSSImport() {
        return (
            element instanceof HTMLStyleElement &&
            element.textContent.trim().match(cssImportRegex)
        );
    }
    function getRulesSync() {
        if (corsCopy) {
            return corsCopy.sheet.cssRules;
        }
        if (element.sheet == null) {
            return null;
        }
        if (element instanceof HTMLLinkElement) {
            try {
                return element.sheet.cssRules;
            } catch (err) {
                return null;
            }
        }
        if (containsCSSImport()) {
            return null;
        }
        return safeGetSheetRules();
    }
    let isLoadingRules = false;
    let wasLoadingError = false;
    async function getRulesAsync() {
        let cssText;
        let cssBasePath;
        if (element instanceof HTMLLinkElement) {
            if (element.sheet == null) {
                try {
                    await linkLoading(element);
                    if (cancelAsyncOperations) {
                        return null;
                    }
                } catch (err) {
                    wasLoadingError = true;
                    return null;
                }
            }
            try {
                if (element.sheet.cssRules != null) {
                    return element.sheet.cssRules;
                }
            } catch (err) {}
            cssText = await loadText(element.href);
            cssBasePath = getCSSBaseBath(element.href);
            if (cancelAsyncOperations) {
                return null;
            }
        } else if (containsCSSImport()) {
            cssText = element.textContent.trim();
            cssBasePath = getCSSBaseBath(location.href);
        } else {
            return null;
        }
        if (cssText) {
            try {
                const fullCSSText = await replaceCSSImports(
                    cssText,
                    cssBasePath
                );
                corsCopy = createCORSCopy(element, fullCSSText);
                if (corsCopy) {
                    corsCopyPositionWatcher = watchForNodePosition(
                        corsCopy
                    );
                }
            } catch (err) {}
            if (corsCopy) {
                return corsCopy.sheet.cssRules;
            }
        }
        return null;
    }
    function details() {
        const rules = getRulesSync();
        if (!rules) {
            if (isLoadingRules || wasLoadingError) {
                return null;
            }
            isLoadingRules = true;
            loadingStart();
            getRulesAsync()
                .then((results) => {
                    isLoadingRules = false;
                    loadingEnd();
                    if (results) {
                        update();
                    }
                })
                .catch((err) => {
                    isLoadingRules = false;
                    loadingEnd();
                });
            return null;
        }
        const variables = getCSSVariables(rules);
        return {variables};
    }
    function getFilterKey(filter) {
        return ["mode", "brightness", "contrast", "grayscale", "sepia"]
            .map((p) => `${p}:${filter[p]}`)
            .join(";");
    }
    let renderId = 0;
    const rulesTextCache = new Map();
    const rulesModCache = new Map();
    let prevFilterKey = null;
    function render(filter, variables) {
        const rules = getRulesSync();
        if (!rules) {
            return;
        }
        cancelAsyncOperations = false;
        let rulesChanged = rulesModCache.size === 0;
        const notFoundCacheKeys = new Set(rulesModCache.keys());
        const filterKey = getFilterKey(filter);
        let filterChanged = filterKey !== prevFilterKey;
        const modRules = [];
        iterateCSSRules(rules, (rule) => {
            let cssText = rule.cssText;
            let textDiffersFromPrev = false;
            notFoundCacheKeys.delete(cssText);
            if (!rulesTextCache.has(cssText)) {
                rulesTextCache.set(cssText, cssText);
                textDiffersFromPrev = true;
            }
            let vars = null;
            let varsRule = null;
            if (variables.size > 0 || cssText.includes("var(")) {
                const cssTextWithVariables = replaceCSSVariables(
                    cssText,
                    variables
                );
                if (rulesTextCache.get(cssText) !== cssTextWithVariables) {
                    rulesTextCache.set(cssText, cssTextWithVariables);
                    textDiffersFromPrev = true;
                    vars = document.createElement("style");
                    vars.classList.add("darkslack");
                    vars.classList.add("darkslack--vars");
                    vars.media = "screen";
                    vars.textContent = cssTextWithVariables;
                    element.parentNode.insertBefore(
                        vars,
                        element.nextSibling
                    );
                    varsRule = vars.sheet.cssRules[0];
                }
            }
            if (textDiffersFromPrev) {
                rulesChanged = true;
            } else {
                modRules.push(rulesModCache.get(cssText));
                return;
            }
            const modDecs = [];
            const targetRule = varsRule || rule;
            targetRule &&
            targetRule.style &&
            iterateCSSDeclarations(
                targetRule.style,
                (property, value) => {
                    const mod = getModifiableCSSDeclaration(
                        property,
                        value,
                        rule,
                        isCancelled
                    );
                    if (mod) {
                        modDecs.push(mod);
                    }
                }
            );
            let modRule = null;
            if (modDecs.length > 0) {
                modRule = {
                    selector: rule.selectorText,
                    declarations: modDecs
                };
                if (rule.parentRule instanceof CSSMediaRule) {
                    modRule.media = rule.parentRule.media.mediaText;
                }
                modRules.push(modRule);
            }
            rulesModCache.set(cssText, modRule);
            removeNode(vars);
        });
        notFoundCacheKeys.forEach((key) => {
            rulesTextCache.delete(key);
            rulesModCache.delete(key);
        });
        prevFilterKey = filterKey;
        if (!rulesChanged && !filterChanged) {
            return;
        }
        renderId++;
        function setRule(target, index, declarations) {
            const {selector} = declarations[0];
            target.insertRule(`${selector} {}`, index);
            const style = target.cssRules.item(index).style;
            declarations.forEach(
                ({property, value, important, sourceValue}) => {
                    style.setProperty(
                        property,
                        value == null ? sourceValue : value,
                        important ? "important" : ""
                    );
                }
            );
        }
        const readyDeclarations = [];
        const asyncDeclarations = new Map();
        let asyncDeclarationCounter = 0;
        function buildStyleSheet() {
            const groups = [];
            readyDeclarations.forEach((decl, i) => {
                let mediaGroup;
                let selectorGroup;
                const prev = i === 0 ? null : readyDeclarations[i - 1];
                const isSameMedia = prev && prev.media === decl.media;
                const isSameMediaAndSelector =
                    prev && isSameMedia && prev.selector === decl.selector;
                if (isSameMedia) {
                    mediaGroup = groups[groups.length - 1];
                } else {
                    mediaGroup = [];
                    groups.push(mediaGroup);
                }
                if (isSameMediaAndSelector) {
                    selectorGroup = mediaGroup[mediaGroup.length - 1];
                } else {
                    selectorGroup = [];
                    mediaGroup.push(selectorGroup);
                }
                selectorGroup.push(decl);
            });
            if (!syncStyle) {
                syncStyle = document.createElement("style");
                syncStyle.classList.add("darkslack");
                syncStyle.classList.add("darkslack--sync");
                syncStyle.media = "screen";
            }
            syncStylePositionWatcher && syncStylePositionWatcher.stop();
            element.parentNode.insertBefore(
                syncStyle,
                corsCopy ? corsCopy.nextSibling : element.nextSibling
            );
            const sheet = syncStyle.sheet;
            for (let i = sheet.cssRules.length - 1; i >= 0; i--) {
                sheet.deleteRule(i);
            }
            groups.forEach((mediaGroup) => {
                const {media} = mediaGroup[0][0];
                let target;
                if (media) {
                    sheet.insertRule(
                        `@media ${media} {}`,
                        sheet.cssRules.length
                    );
                    target = sheet.cssRules[sheet.cssRules.length - 1];
                } else {
                    target = sheet;
                }
                mediaGroup.forEach((selectorGroup) => {
                    const asyncItems = selectorGroup.filter(
                        ({value}) => value == null
                    );
                    if (asyncItems.length > 0) {
                        asyncItems.forEach(({asyncKey}) =>
                            asyncDeclarations.set(asyncKey, {
                                declarations: selectorGroup,
                                target,
                                index: target.cssRules.length
                            })
                        );
                    }
                    setRule(target, target.cssRules.length, selectorGroup);
                });
            });
            if (syncStylePositionWatcher) {
                syncStylePositionWatcher.run();
            } else {
                syncStylePositionWatcher = watchForNodePosition(
                    syncStyle,
                    buildStyleSheet
                );
            }
        }
        function rebuildAsyncRule(key) {
            const {declarations, target, index} = asyncDeclarations.get(
                key
            );
            target.deleteRule(index);
            setRule(target, index, declarations);
            asyncDeclarations.delete(key);
        }
        modRules
            .filter((r) => r)
            .forEach(({selector, declarations, media}) => {
                declarations.forEach(
                    ({property, value, important, sourceValue}) => {
                        if (typeof value === "function") {
                            const modified = value(filter);
                            if (modified instanceof Promise) {
                                const index = readyDeclarations.length;
                                const asyncKey = asyncDeclarationCounter++;
                                readyDeclarations.push({
                                    media,
                                    selector,
                                    property,
                                    value: null,
                                    important,
                                    asyncKey,
                                    sourceValue
                                });
                                const promise = modified;
                                const currentRenderId = renderId;
                                promise.then((asyncValue) => {
                                    if (
                                        !asyncValue ||
                                        cancelAsyncOperations ||
                                        currentRenderId !== renderId
                                    ) {
                                        return;
                                    }
                                    readyDeclarations[
                                        index
                                        ].value = asyncValue;
                                    asyncQueue.add(() => {
                                        if (
                                            cancelAsyncOperations ||
                                            currentRenderId !== renderId
                                        ) {
                                            return;
                                        }
                                        rebuildAsyncRule(asyncKey);
                                    });
                                });
                            } else {
                                readyDeclarations.push({
                                    media,
                                    selector,
                                    property,
                                    value: modified,
                                    important,
                                    sourceValue
                                });
                            }
                        } else {
                            readyDeclarations.push({
                                media,
                                selector,
                                property,
                                value,
                                important,
                                sourceValue
                            });
                        }
                    }
                );
            });
        buildStyleSheet();
    }
    let rulesCount = null;
    let rulesCheckFrameId = null;
    function safeGetSheetRules() {
        try {
            return element.sheet.cssRules;
        } catch (err) {
            return null;
        }
    }
    function subscribeToSheetChanges() {
        if (element.sheet && safeGetSheetRules()) {
            rulesCount = element.sheet.cssRules.length;
        }
        unsubscribeFromSheetChanges();
        const checkForUpdate = () => {
            if (
                element.sheet &&
                safeGetSheetRules() &&
                element.sheet.cssRules.length !== rulesCount
            ) {
                rulesCount = element.sheet.cssRules.length;
                update();
            }
            rulesCheckFrameId = requestAnimationFrame(checkForUpdate);
        };
        checkForUpdate();
    }
    function unsubscribeFromSheetChanges() {
        cancelAnimationFrame(rulesCheckFrameId);
    }
    function pause() {
        observer.disconnect();
        corsCopyPositionWatcher && corsCopyPositionWatcher.stop();
        syncStylePositionWatcher && syncStylePositionWatcher.stop();
        cancelAsyncOperations = true;
        unsubscribeFromSheetChanges();
    }
    function destroy() {
        pause();
        removeNode(corsCopy);
        removeNode(syncStyle);
    }
    function watch() {
        observer.observe(element, observerOptions);
        if (element instanceof HTMLStyleElement) {
            subscribeToSheetChanges();
        }
    }
    return {
        details,
        render,
        pause,
        destroy,
        watch
    };
}
function linkLoading(link) {
    return new Promise((resolve, reject) => {
        const cleanUp = () => {
            link.removeEventListener("load", onLoad);
            link.removeEventListener("error", onError);
        };
        const onLoad = () => {
            cleanUp();
            resolve();
        };
        const onError = () => {
            cleanUp();
            reject(`Link loading failed ${link.href}`);
        };
        link.addEventListener("load", onLoad);
        link.addEventListener("error", onError);
    });
}
function getCSSImportURL(importDeclaration) {
    return getCSSURLValue(importDeclaration.substring(8).replace(/;$/, ""));
}
async function loadText(url) {
    if (url.startsWith("data:")) {
        return await (await fetch(url)).text();
    }
    return await bgFetch({url, responseType: "text"});
}
async function replaceCSSImports(cssText, basePath) {
    cssText = removeCSSComments(cssText);
    cssText = replaceCSSFontFace(cssText);
    cssText = replaceCSSRelativeURLsWithAbsolute(cssText, basePath);
    const importMatches = getMatches(cssImportRegex, cssText);
    for (let match of importMatches) {
        const importURL = getCSSImportURL(match);
        const absoluteURL = getAbsoluteURL(basePath, importURL);
        let importedCSS;
        try {
            importedCSS = await loadText(absoluteURL);
            importedCSS = await replaceCSSImports(
                importedCSS,
                getCSSBaseBath(absoluteURL)
            );
        } catch (err) {
            importedCSS = "";
        }
        cssText = cssText.split(match).join(importedCSS);
    }
    cssText = cssText.trim();
    return cssText;
}
function createCORSCopy(srcElement, cssText) {
    if (!cssText) {
        return null;
    }
    const cors = document.createElement("style");
    cors.classList.add("darkslack");
    cors.classList.add("darkslack--cors");
    cors.media = "screen";
    cors.textContent = cssText;
    srcElement.parentNode.insertBefore(cors, srcElement.nextSibling);
    cors.sheet.disabled = true;
    return cors;
}

let observer$2 = null;
function getAllManageableStyles(nodes) {
    const results = [];
    Array.from(nodes).forEach((node) => {
        if (node instanceof Element) {
            if (shouldManageStyle(node)) {
                results.push(node);
            }
            results.push(
                ...Array.from(node.querySelectorAll(STYLE_SELECTOR)).filter(
                    shouldManageStyle
                )
            );
        }
    });
    return results;
}
function iterateShadowNodes(nodes, iterator) {
    Array.from(nodes).forEach((node) => {
        if (node instanceof Element) {
            if (node.shadowRoot) {
                iterator(node);
            }
            iterateShadowNodes(node.childNodes, iterator);
        }
    });
}
const shadowObservers = new Set();
function watchForStyleChanges(update) {
    if (observer$2) {
        observer$2.disconnect();
        shadowObservers.forEach((o) => o.disconnect());
        shadowObservers.clear();
    }
    function handleMutations(mutations) {
        const createdStyles = mutations.reduce(
            (nodes, m) =>
                nodes.concat(getAllManageableStyles(m.addedNodes)),
            []
        );
        const removedStyles = mutations.reduce(
            (nodes, m) =>
                nodes.concat(getAllManageableStyles(m.removedNodes)),
            []
        );
        const updatedStyles = mutations
            .filter(
                ({target, type}) =>
                    type === "attributes" && shouldManageStyle(target)
            )
            .reduce((styles, {target}) => {
                styles.push(target);
                return styles;
            }, []);
        if (
            createdStyles.length +
            removedStyles.length +
            updatedStyles.length >
            0
        ) {
            update({
                created: createdStyles,
                updated: updatedStyles,
                removed: removedStyles
            });
        }
        const allAddedNodes = [];
        mutations.forEach((m) => {
            m.addedNodes.forEach((n) => {
                allAddedNodes.push(n);
            });
        });
        iterateShadowNodes(allAddedNodes, subscribeForShadowRootChanges);
    }
    function subscribeForShadowRootChanges(node) {
        const shadowObserver = new MutationObserver(handleMutations);
        shadowObserver.observe(node.shadowRoot, mutationObserverOptions);
        shadowObservers.add(shadowObserver);
    }
    const mutationObserverOptions = {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ["rel"]
    };
    observer$2 = new MutationObserver(handleMutations);
    observer$2.observe(document.documentElement, mutationObserverOptions);
    iterateShadowNodes(
        document.documentElement.children,
        subscribeForShadowRootChanges
    );
}
function stopWatchingForStyleChanges() {
    if (observer$2) {
        observer$2.disconnect();
        observer$2 = null;
        shadowObservers.forEach((o) => o.disconnect());
        shadowObservers.clear();
    }
}

const styleManagers = new Map();
const variables = new Map();
let filter = null;
let fixes = null;
let isIFrame = null;
function createOrUpdateStyle$1(className) {
    let style = (document.head || document).querySelector(`.${className}`);
    if (!style) {
        style = document.createElement("style");
        style.classList.add("darkslack");
        style.classList.add(className);
        style.media = "screen";
    }
    return style;
}
const stylePositionWatchers = new Map();
function setupStylePositionWatcher(node, alias) {
    stylePositionWatchers.has(alias) &&
    stylePositionWatchers.get(alias).stop();
    stylePositionWatchers.set(alias, watchForNodePosition(node));
}
function stopStylePositionWatchers() {
    Array.from(stylePositionWatchers.values()).forEach((watcher) =>
        watcher.stop()
    );
    stylePositionWatchers.clear();
}
function createStaticStyleOverrides() {
    const fallbackStyle = createOrUpdateStyle$1("darkslack--fallback");
    document.head.insertBefore(fallbackStyle, document.head.firstChild);
    fallbackStyle.textContent = getModifiedFallbackStyle(filter, {
        strict: true
    });
    setupStylePositionWatcher(fallbackStyle, "fallback");
    const userAgentStyle = createOrUpdateStyle$1("darkslack--user-agent");
    document.head.insertBefore(userAgentStyle, fallbackStyle.nextSibling);
    userAgentStyle.textContent = getModifiedUserAgentStyle(
        filter,
        isIFrame
    );
    setupStylePositionWatcher(userAgentStyle, "user-agent");
    const textStyle = createOrUpdateStyle$1("darkslack--text");
    document.head.insertBefore(textStyle, fallbackStyle.nextSibling);
    if (filter.useFont || filter.textStroke > 0) {
        textStyle.textContent = createTextStyle(filter);
    } else {
        textStyle.textContent = "";
    }
    setupStylePositionWatcher(textStyle, "text");
    const invertStyle = createOrUpdateStyle$1("darkslack--invert");
    document.head.insertBefore(invertStyle, textStyle.nextSibling);
    if (fixes && Array.isArray(fixes.invert) && fixes.invert.length > 0) {
        invertStyle.textContent = [
            `${fixes.invert.join(", ")} {`,
            `    filter: ${getCSSFilterValue({
                ...filter,
                contrast:
                    filter.mode === 0
                        ? filter.contrast
                        : clamp(filter.contrast - 10, 0, 100)
            })} !important;`,
            "}"
        ].join("\n");
    } else {
        invertStyle.textContent = "";
    }
    setupStylePositionWatcher(invertStyle, "invert");
    const inlineStyle = createOrUpdateStyle$1("darkslack--inline");
    document.head.insertBefore(inlineStyle, invertStyle.nextSibling);
    inlineStyle.textContent = getInlineOverrideStyle();
    setupStylePositionWatcher(inlineStyle, "inline");
    const overrideStyle = createOrUpdateStyle$1("darkslack--override");
    document.head.appendChild(overrideStyle);
    overrideStyle.textContent =
        fixes && fixes.css ? replaceCSSTemplates(fixes.css) : "";
    setupStylePositionWatcher(overrideStyle, "override");
}
function replaceCSSTemplates($cssText) {
    return $cssText.replace(/\${(.+?)}/g, (m0, $color) => {
        try {
            const color = parseColorWithCache($color);
            return modifyColor(color, filter);
        } catch (err) {
            return $color;
        }
    });
}
function cleanFallbackStyle() {
    const fallback = document.head.querySelector(".darkslack--fallback");
    if (fallback) {
        fallback.textContent = "";
    }
}
function createDynamicStyleOverrides() {
    cancelRendering();
    updateVariables(getElementCSSVariables(document.documentElement));
    const newManagers = Array.from(
        document.querySelectorAll(STYLE_SELECTOR)
    )
        .filter(
            (style) => !styleManagers.has(style) && shouldManageStyle(style)
        )
        .map((style) => createManager(style));
    const newVariables = newManagers
        .map((manager) => manager.details())
        .filter((details) => details && details.variables.size > 0)
        .map(({variables}) => variables);
    if (newVariables.length === 0) {
        styleManagers.forEach((manager) =>
            manager.render(filter, variables)
        );
        if (loadingStyles.size === 0) {
            cleanFallbackStyle();
        }
    } else {
        newVariables.forEach((variables) => updateVariables(variables));
        throttledRenderAllStyles(() => {
            if (loadingStyles.size === 0) {
                cleanFallbackStyle();
            }
        });
    }
    newManagers.forEach((manager) => manager.watch());
    const inlineStyleElements = Array.from(
        document.querySelectorAll(INLINE_STYLE_SELECTOR)
    );
    inlineStyleElements.forEach((el) => overrideInlineStyle(el, filter));
}
let loadingStylesCounter = 0;
const loadingStyles = new Set();
function createManager(element) {
    if (styleManagers.has(element)) {
        return;
    }
    let loadingStyleId = ++loadingStylesCounter;
    function loadingStart() {
        if (!isPageLoaded() || !didDocumentShowUp) {
            loadingStyles.add(loadingStyleId);
            const fallbackStyle = document.querySelector(
                ".darkslack--fallback"
            );
            if (!fallbackStyle.textContent) {
                fallbackStyle.textContent = getModifiedFallbackStyle(
                    filter,
                    {strict: false}
                );
            }
        }
    }
    function loadingEnd() {
        loadingStyles.delete(loadingStyleId);
        if (loadingStyles.size === 0 && isPageLoaded()) {
            cleanFallbackStyle();
        }
    }
    function update() {
        const details = manager.details();
        if (!details) {
            return;
        }
        if (details.variables.size === 0) {
            manager.render(filter, variables);
        } else {
            updateVariables(details.variables);
            throttledRenderAllStyles();
        }
    }
    const manager = manageStyle(element, {
        update,
        loadingStart,
        loadingEnd
    });
    styleManagers.set(element, manager);
    return manager;
}
function updateVariables(newVars) {
    if (newVars.size === 0) {
        return;
    }
    newVars.forEach((value, key) => variables.set(key, value));
    variables.forEach((value, key) =>
        variables.set(key, replaceCSSVariables(value, variables))
    );
}
function removeManager(element) {
    const manager = styleManagers.get(element);
    if (manager) {
        manager.destroy();
        styleManagers.delete(element);
    }
}
const throttledRenderAllStyles = throttle((callback) => {
    styleManagers.forEach((manager) => manager.render(filter, variables));
    callback && callback();
});
const cancelRendering = function() {
    throttledRenderAllStyles.cancel();
};
function isPageLoaded() {
    return (
        document.readyState === "complete" ||
        document.readyState === "interactive"
    );
}
function onReadyStateChange() {
    if (!isPageLoaded()) {
        return;
    }
    document.removeEventListener("readystatechange", onReadyStateChange);
    if (loadingStyles.size === 0) {
        cleanFallbackStyle();
    }
}
let documentVisibilityListener = null;
let didDocumentShowUp = !document.hidden;
function watchForDocumentVisibility(callback) {
    const alreadyWatching = Boolean(documentVisibilityListener);
    documentVisibilityListener = () => {
        if (!document.hidden) {
            stopWatchingForDocumentVisibility();
            callback();
            didDocumentShowUp = true;
        }
    };
    if (!alreadyWatching) {
        document.addEventListener(
            "visibilitychange",
            documentVisibilityListener
        );
    }
}
function stopWatchingForDocumentVisibility() {
    document.removeEventListener(
        "visibilitychange",
        documentVisibilityListener
    );
    documentVisibilityListener = null;
}
function createThemeAndWatchForUpdates() {
    createStaticStyleOverrides();
    function runDynamicStyle() {
        createDynamicStyleOverrides();
        watchForUpdates();
    }
    if (document.hidden) {
        watchForDocumentVisibility(runDynamicStyle);
    } else {
        runDynamicStyle();
    }
    changeMetaThemeColorWhenAvailable(filter);
}
function watchForUpdates() {
    watchForStyleChanges(({created, updated, removed}) => {
        const createdStyles = new Set(created);
        const movedStyles = new Set(
            removed.filter((style) => createdStyles.has(style))
        );
        removed
            .filter((style) => !movedStyles.has(style))
            .forEach((style) => removeManager(style));
        const newManagers = Array.from(new Set(created.concat(updated)))
            .filter((style) => !styleManagers.has(style))
            .map((style) => createManager(style));
        const newVariables = newManagers
            .map((manager) => manager.details())
            .filter((details) => details && details.variables.size > 0)
            .map(({variables}) => variables);
        if (newVariables.length === 0) {
            newManagers.forEach((manager) =>
                manager.render(filter, variables)
            );
        } else {
            newVariables.forEach((variables) => updateVariables(variables));
            throttledRenderAllStyles();
        }
        newManagers.forEach((manager) => manager.watch());
    });
    watchForInlineStyles((element) => {
        overrideInlineStyle(element, filter);
        if (element === document.documentElement) {
            const rootVariables = getElementCSSVariables(
                document.documentElement
            );
            if (rootVariables.size > 0) {
                updateVariables(rootVariables);
                throttledRenderAllStyles();
            }
        }
    });
    document.addEventListener("readystatechange", onReadyStateChange);
}
function stopWatchingForUpdates() {
    styleManagers.forEach((manager) => manager.pause());
    stopStylePositionWatchers();
    stopWatchingForStyleChanges();
    stopWatchingForInlineStyles();
    document.removeEventListener("readystatechange", onReadyStateChange);
}
function createOrUpdateDynamicTheme(
    filterConfig,
    dynamicThemeFixes,
    iframe
) {
    filter = filterConfig;
    fixes = dynamicThemeFixes;
    isIFrame = iframe;
    if (document.head) {
        createThemeAndWatchForUpdates();
    } else {
        if (!isFirefox()) {
            const fallbackStyle = createOrUpdateStyle$1(
                "darkslack--fallback"
            );
            document.documentElement.appendChild(fallbackStyle);
            fallbackStyle.textContent = getModifiedFallbackStyle(filter, {
                strict: true
            });
        }
        const headObserver = new MutationObserver(() => {
            if (document.head) {
                headObserver.disconnect();
                createThemeAndWatchForUpdates();
            }
        });
        headObserver.observe(document, {childList: true, subtree: true});
    }
}
function removeDynamicTheme() {
    cleanDynamicThemeCache();
    removeNode(document.querySelector(".darkslack--fallback"));
    if (document.head) {
        restoreMetaThemeColor();
        removeNode(document.head.querySelector(".darkslack--user-agent"));
        removeNode(document.head.querySelector(".darkslack--text"));
        removeNode(document.head.querySelector(".darkslack--invert"));
        removeNode(document.head.querySelector(".darkslack--inline"));
        removeNode(document.head.querySelector(".darkslack--override"));
    }
    Array.from(styleManagers.keys()).forEach((el) => removeManager(el));
    Array.from(document.querySelectorAll(".darkslack")).forEach(
        removeNode
    );
}
function cleanDynamicThemeCache() {
    stopWatchingForDocumentVisibility();
    cancelRendering();
    stopWatchingForUpdates();
    cleanModificationCache();
}