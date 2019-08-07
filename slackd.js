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

function removeNode(node) {
    node && node.parentElement && node.parentElement.removeChild(node);
}

function removeStyle() {
    removeNode(document.getElementById('dark-slack-style'));
}

function removeSVGFilter() {
    removeNode(document.getElementById('dark-slack-svg'));
}

function getMatches(regex, input, group = 0) {
    const matches = [];
    let m;
    while (m = regex.exec(input)) {
        matches.push(m[group]);
    }
    return matches;
}

function parseURL(url) {
    const a = document.createElement('a');
    a.href = url;
    return a;
}
function getAbsoluteURL($base, $relative) {
    if ($relative.match(/^.*?\/\//) || $relative.match(/^data\:/)) {
        if ($relative.startsWith('//')) {
            return `${location.protocol}${$relative}`;
        }
        return $relative;
    }
    const b = parseURL($base);
    if ($relative.startsWith('/')) {
        const u = parseURL(`${b.protocol}//${b.host}${$relative}`);
        return u.href;
    }
    const baseParts = b.pathname.split('/');
    const backwards = getMatches(/\.\.\//g, $relative);
    const u = parseURL(`${b.protocol}//${b.host}${baseParts.slice(0, baseParts.length - backwards.length).join('/')}/${$relative.replace(/^(\.\.\/)*/, '')}`);
    return u.href;
}

const DEBUG = true;
function logInfo(...args) {
    DEBUG && console.info(...args);
}
function logWarn(...args) {
    DEBUG && console.warn(...args);
}

function iterateCSSRules(rules, iterate) {
    Array.from(rules)
        .forEach((rule) => {
            if (rule instanceof CSSMediaRule) {
                Array.from(rule.cssRules).forEach((mediaRule) => iterate(mediaRule));
            }
            else if (rule instanceof CSSStyleRule) {
                iterate(rule);
            }
            else {
                logWarn(`CSSRule type not supported`, rule);
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
const cssURLRegex = /url\((('.+?')|(".+?")|([^\)]*?))\)/g;
function getCSSURLValue(cssURL) {
    return cssURL.replace(/^url\((.*)\)$/, '$1').replace(/^"(.*)"$/, '$1').replace(/^'(.*)'$/, '$1');
}
function getCSSBaseBath(url) {
    const cssURL = parseURL(url);
    return `${cssURL.protocol}//${cssURL.host}${cssURL.pathname.replace(/\/[^\/]+?\.css$/i, '')}`;
}
function replaceCSSRelativeURLsWithAbsolute($css, cssURL) {
    const cssBasePath = getCSSBaseBath(cssURL);
    return $css.replace(cssURLRegex, (match) => {
        const pathValue = getCSSURLValue(match);
        return `url("${getAbsoluteURL(cssBasePath, pathValue)}")`;
    });
}
const fontFaceRegex = /@font-face\s*{[^}]*}/g;
function replaceCSSFontFace($css) {
    return $css.replace(fontFaceRegex, '');
}
const varRegex = /var\((--[^\s,]+),?\s*([^\(\)]*(\([^\(\)]*\)[^\(\)]*)*\s*)\)/g;
function replaceCSSVariables(value, variables) {
    let missing = false;
    const result = value.replace(varRegex, (match, name, fallback) => {
        if (variables.has(name)) {
            return variables.get(name);
        }
        else if (fallback) {
            return fallback;
        }
        else {
            logWarn(`Variable ${name} not found`);
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

// https://en.wikipedia.org/wiki/HSL_and_HSV
function hslToRGB({ h, s, l, a = 1 }) {
    if (s === 0) {
        const [r, b, g] = [l, l, l].map((x) => Math.round(x * 255));
        return { r, g, b, a };
    }
    const c = (1 - Math.abs(2 * l - 1)) * s;
    const x = c * (1 - Math.abs((h / 60) % 2 - 1));
    const m = l - c / 2;
    const [r, g, b] = (h < 60 ? [c, x, 0] :
        h < 120 ? [x, c, 0] :
            h < 180 ? [0, c, x] :
                h < 240 ? [0, x, c] :
                    h < 300 ? [x, 0, c] :
                        [c, 0, x]).map((n) => Math.round((n + m) * 255));
    return { r, g, b, a };
}
// https://en.wikipedia.org/wiki/HSL_and_HSV
function rgbToHSL({ r: r255, g: g255, b: b255, a = 1 }) {
    const r = r255 / 255;
    const g = g255 / 255;
    const b = b255 / 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const c = max - min;
    const l = (max + min) / 2;
    if (c === 0) {
        return { h: 0, s: 0, l, a };
    }
    let h = (max === r ? (((g - b) / c) % 6) :
        max === g ? ((b - r) / c + 2) :
            ((r - g) / c + 4)) * 60;
    if (h < 0) {
        h += 360;
    }
    const s = c / (1 - Math.abs(2 * l - 1));
    return { h, s, l, a };
}
function toFixed(n, digits = 0) {
    const fixed = n.toFixed(digits);
    if (digits === 0) {
        return fixed;
    }
    const dot = fixed.indexOf('.');
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
    const { r, g, b, a } = rgb;
    if (a != null && a < 1) {
        return `rgba(${toFixed(r)}, ${toFixed(g)}, ${toFixed(b)}, ${toFixed(a, 2)})`;
    }
    return `rgb(${toFixed(r)}, ${toFixed(g)}, ${toFixed(b)})`;
}
function rgbToHexString({ r, g, b, a }) {
    return `#${(a != null && a < 1 ? [r, g, b, Math.round(a * 255)] : [r, g, b]).map((x, i) => {
        return `${x < 16 ? '0' : ''}${x.toString(16)}`;
    }).join('')}`;
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
    if ($color === 'transparent') {
        return { r: 0, g: 0, b: 0, a: 0 };
    }
    throw new Error(`Unable to parse ${$color}`);
}
function getNumbersFromString(str, splitter, range, units) {
    const raw = str.split(splitter).filter((x) => x);
    const unitsList = Object.entries(units);
    const numbers = raw.map((r) => r.trim()).map((r, i) => {
        let n;
        const unit = unitsList.find(([u]) => r.endsWith(u));
        if (unit) {
            n = parseFloat(r.substring(0, r.length - unit[0].length)) / unit[1] * range[i];
        }
        else {
            n = parseFloat(r);
        }
        if (range[i] > 1) {
            return Math.round(n);
        }
        return n;
    });
    return numbers;
}
const rgbSplitter = /rgba?|\(|\)|\/|,|\s/ig;
const rgbRange = [255, 255, 255, 1];
const rgbUnits = { '%': 100 };
function parseRGB($rgb) {
    const [r, g, b, a = 1] = getNumbersFromString($rgb, rgbSplitter, rgbRange, rgbUnits);
    return { r, g, b, a };
}
const hslSplitter = /hsla?|\(|\)|\/|,|\s/ig;
const hslRange = [360, 1, 1, 1];
const hslUnits = { '%': 100, 'deg': 360, 'rad': 2 * Math.PI, 'turn': 1 };
function parseHSL($hsl) {
    const [h, s, l, a = 1] = getNumbersFromString($hsl, hslSplitter, hslRange, hslUnits);
    return hslToRGB({ h, s, l, a });
}
function parseHex($hex) {
    const h = $hex.substring(1);
    switch (h.length) {
        case 3:
        case 4: {
            const [r, g, b] = [0, 1, 2].map((i) => parseInt(`${h[i]}${h[i]}`, 16));
            const a = h.length === 3 ? 1 : (parseInt(`${h[3]}${h[3]}`, 16) / 255);
            return { r, g, b, a };
        }
        case 6:
        case 8: {
            const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.substring(i, i + 2), 16));
            const a = h.length === 6 ? 1 : (parseInt(h.substring(6, 8), 16) / 255);
            return { r, g, b, a };
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
const knownColors = new Map(Object.entries({
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
    yellowgreen: 0x9acd32,
}));
const systemColors = new Map(Object.entries({
    ActiveBorder: 0x3b99fc,
    ActiveCaption: 0x000000,
    AppWorkspace: 0xaaaaaa,
    Background: 0x6363ce,
    ButtonFace: 0xffffff,
    ButtonHighlight: 0xe9e9e9,
    ButtonShadow: 0x9fa09f,
    ButtonText: 0x000000,
    CaptionText: 0x000000,
    GrayText: 0x7f7f7f,
    Highlight: 0xb2d7ff,
    HighlightText: 0x000000,
    InactiveBorder: 0xffffff,
    InactiveCaption: 0xffffff,
    InactiveCaptionText: 0x000000,
    InfoBackground: 0xfbfcc5,
    InfoText: 0x000000,
    Menu: 0xf6f6f6,
    MenuText: 0xffffff,
    Scrollbar: 0xaaaaaa,
    ThreeDDarkShadow: 0x000000,
    ThreeDFace: 0xc0c0c0,
    ThreeDHighlight: 0xffffff,
    ThreeDLightShadow: 0xffffff,
    ThreeDShadow: 0x000000,
    Window: 0xececec,
    WindowFrame: 0xaaaaaa,
    WindowText: 0x000000,
    '-webkit-focus-ring-color': 0xe59700
}).map(([key, value]) => [key.toLowerCase(), value]));

function scale(x, inLow, inHigh, outLow, outHigh) {
    return (x - inLow) * (outHigh - outLow) / (inHigh - inLow) + outLow;
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
    return [0, 1, 2].map((i) => clamp(Math.round(result[i][0] * 255), 0, 255));
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
            [(0.393 + 0.607 * (1 - v)), (0.769 - 0.769 * (1 - v)), (0.189 - 0.189 * (1 - v)), 0, 0],
            [(0.349 - 0.349 * (1 - v)), (0.686 + 0.314 * (1 - v)), (0.168 - 0.168 * (1 - v)), 0, 0],
            [(0.272 - 0.272 * (1 - v)), (0.534 - 0.534 * (1 - v)), (0.131 + 0.869 * (1 - v)), 0, 0],
            [0, 0, 0, 1, 0],
            [0, 0, 0, 0, 1]
        ];
    },
    grayscale(v) {
        return [
            [(0.2126 + 0.7874 * (1 - v)), (0.7152 - 0.7152 * (1 - v)), (0.0722 - 0.0722 * (1 - v)), 0, 0],
            [(0.2126 - 0.2126 * (1 - v)), (0.7152 + 0.2848 * (1 - v)), (0.0722 - 0.0722 * (1 - v)), 0, 0],
            [(0.2126 - 0.2126 * (1 - v)), (0.7152 - 0.7152 * (1 - v)), (0.0722 + 0.9278 * (1 - v)), 0, 0],
            [0, 0, 0, 1, 0],
            [0, 0, 0, 0, 1]
        ];
    },
};

const colorModificationCache = new Map();
function clearColorModificationCache() {
    colorModificationCache.clear();
}
function modifyColorWithCache(rgb, filter, modifyHSL) {
    let fnCache;
    if (colorModificationCache.has(modifyHSL)) {
        fnCache = colorModificationCache.get(modifyHSL);
    }
    else {
        fnCache = new Map();
        colorModificationCache.set(modifyHSL, fnCache);
    }
    const id = Object.entries(rgb)
        .concat(Object.entries(filter).filter(([key]) => ['mode', 'brightness', 'contrast', 'grayscale', 'sepia'].indexOf(key) >= 0))
        .map(([key, value]) => `${key}:${value}`)
        .join(';');
    if (fnCache.has(id)) {
        return fnCache.get(id);
    }
    const hsl = rgbToHSL(rgb);
    const modified = modifyHSL(hsl);
    const { r, g, b, a } = hslToRGB(modified);
    const [rf, gf, bf] = applyColorMatrix([r, g, b], createFilterMatrix({ ...filter, mode: 0 }));
    const color = (a === 1 ?
        rgbToHexString({ r: rf, g: gf, b: bf }) :
        rgbToString({ r: rf, g: gf, b: bf, a }));
    fnCache.set(id, color);
    return color;
}
function modifyLightModeHSL({ h, s, l, a }) {
    const lMin = 0;
    const lMid = 0.4;
    const lMax = 0.9;
    const sNeutralLim = 0.16;
    const sColored = 0.16;
    const hColoredL0 = 220;
    const hColoredL1 = 40;
    const lx = scale(l, 0, 1, lMin, lMax);
    let hx = h;
    let sx = s;
    if (s < sNeutralLim) {
        sx = (l < lMid ?
            scale(l, 0, lMid, sColored, 0) :
            scale(l, lMid, 1, 0, sColored));
        hx = (l < lMid ? hColoredL0 : hColoredL1);
    }
    return { h: hx, s: sx, l: lx, a };
}
function modifyBgHSL({ h, s, l, a }) {
    const lMin = 0.1;
    const lMaxS0 = 0.2;
    const lMaxS1 = 0.4;
    const sNeutralLim = 0.16;
    const sColored = 0.16;
    const hColored = 220;
    const lMax = scale(s, 0, 1, lMaxS0, lMaxS1);
    const lx = (l < lMax ?
        l :
        scale(l, lMax, 1, lMax, lMin));
    let hx = h;
    let sx = s;
    if (s < sNeutralLim) {
        sx = sColored;
        hx = hColored;
    }
    else if (l > lMax) {
        sx = s * scale(l, lMax, 1, 1, 0.5);
    }
    return { h: hx, s: sx, l: lx, a };
}
function modifyBackgroundColor(rgb, filter) {
    if (filter.mode === 0) {
        return modifyColorWithCache(rgb, filter, modifyLightModeHSL);
    }
    return modifyColorWithCache(rgb, filter, modifyBgHSL);
}
function modifyFgHSL({ h, s, l, a }) {
    const lMax = 0.9;
    const lMinS0 = 0.6;
    const lMinS1 = 0.6;
    const sNeutralLim = 0.2;
    const sColored = 0.16;
    const hColored = 40;
    const lMin = scale(s, 0, 1, lMinS0, lMinS1);
    const lx = (l < lMax ?
        scale(l, 0, lMin, lMax, lMin) :
        l);
    let hx = h;
    let sx = s;
    if (s < sNeutralLim) {
        sx = sColored;
        hx = hColored;
    }
    return { h: hx, s: sx, l: lx, a };
}
function modifyForegroundColor(rgb, filter) {
    if (filter.mode === 0) {
        return modifyColorWithCache(rgb, filter, modifyLightModeHSL);
    }
    return modifyColorWithCache(rgb, filter, modifyFgHSL);
}
function modifyBorderHSL({ h, s, l, a }) {
    const lMinS0 = 0.2;
    const lMinS1 = 0.3;
    const lMaxS0 = 0.4;
    const lMaxS1 = 0.5;
    const lMin = scale(s, 0, 1, lMinS0, lMinS1);
    const lMax = scale(s, 0, 1, lMaxS0, lMaxS1);
    const lx = scale(l, 0, 1, lMax, lMin);
    return { h, s, l: lx, a };
}
function modifyBorderColor(rgb, filter) {
    if (filter.mode === 0) {
        return modifyColorWithCache(rgb, filter, modifyLightModeHSL);
    }
    return modifyColorWithCache(rgb, filter, modifyBorderHSL);
}
function modifyShadowColor(rgb, filter) {
    return modifyBackgroundColor(rgb, filter);
}
function modifyGradientColor(rgb, filter) {
    return modifyBackgroundColor(rgb, filter);
}

function createTextStyle(config) {
    const lines = [];
    lines.push('* {');
    if (config.useFont && config.fontFamily) {
        // TODO: Validate...
        lines.push(`  font-family: ${config.fontFamily} !important;`);
    }
    if (config.textStroke > 0) {
        lines.push(`  -webkit-text-stroke: ${config.textStroke}px !important;`);
        lines.push(`  text-stroke: ${config.textStroke}px !important;`);
    }
    lines.push('}');
    return lines.join('\n');
}

var FilterMode;
(function (FilterMode) {
    FilterMode[FilterMode["light"] = 0] = "light";
    FilterMode[FilterMode["dark"] = 1] = "dark";
})(FilterMode || (FilterMode = {}));
function getCSSFilterValue(config) {
    const filters = [];
    if (config.mode === FilterMode.dark) {
        filters.push('invert(100%) hue-rotate(180deg)');
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
    return filters.join(' ');
}

function toSVGMatrix(matrix) {
    return matrix.slice(0, 4).map(m => m.map(m => m.toFixed(3)).join(' ')).join(' ');
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
        chrome.runtime.sendMessage({ type: 'fetch', data: request, id });
    });
}
chrome.runtime.onMessage.addListener(({ type, data, error, id }) => {
    if (type === 'fetch-response') {
        const resolve = resolvers.get(id);
        const reject = rejectors.get(id);
        resolvers.delete(id);
        rejectors.delete(id);
        if (error) {
            reject && reject(error);
        }
        else {
            resolve && resolve(data);
        }
    }
});

async function getImageDetails(url) {
    const dataURL = await getImageDataURL(url);
    const image = await urlToImage(dataURL);
    const info = analyzeImage(image);
    return {
        src: url,
        dataURL,
        width: image.naturalWidth,
        height: image.naturalHeight,
        ...info,
    };
}
async function getImageDataURL(url) {
    let dataURL;
    if (url.startsWith('data:')) {
        dataURL = url;
    }
    else {
        const cache = sessionStorage.getItem(`darkslack-cache:${url}`);
        if (cache) {
            dataURL = cache;
        }
        else {
            dataURL = await bgFetch({ url, responseType: 'data-url' });
            if (dataURL.length < 2 * 256 * 1024) {
                try {
                    sessionStorage.setItem(`darkslack-cache:${url}`, dataURL);
                }
                catch (err) {
                    logWarn(err);
                }
            }
        }
    }
    return dataURL;
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
    const k = Math.min(1, Math.sqrt(MAX_ANALIZE_PIXELS_COUNT / naturalPixelsCount));
    const width = Math.max(1, Math.round(image.naturalWidth * k));
    const height = Math.max(1, Math.round(image.naturalHeight * k));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    context.imageSmoothingEnabled = false;
    context.drawImage(image, 0, 0, width, height);
    const imageData = context.getImageData(0, 0, width, height);
    const d = imageData.data;
    const TRANSPARENT_ALPHA_THRESHOLD = 0.05;
    const DARK_LIGHTNESS_THRESHOLD = 0.4;
    const LIGHT_LIGHTNESS_THRESHOLD = 0.6;
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
            }
            else {
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
        isDark: ((darkPixelsCount / opaquePixelsCount) >= DARK_IMAGE_THRESHOLD),
        isLight: ((lightPixelsCount / opaquePixelsCount) >= LIGHT_IMAGE_THRESHOLD),
        isTransparent: ((transparentPixelsCount / totalPixelsCount) >= TRANSPARENT_IMAGE_THRESHOLD),
        isLarge: (naturalPixelsCount >= LARGE_IMAGE_PIXELS_COUNT),
    };
}
function getFilteredImageDataURL({ dataURL, width, height }, filter) {
    const matrix = getSVGFilterMatrixValue(filter);
    return [
        'data:image/svg+xml;base64,',
        btoa([
            `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${width}" height="${height}">`,
            '<defs>',
            '<filter id="darkslack-image-filter">',
            `<feColorMatrix type="matrix" values="${matrix}" />`,
            '</filter>',
            '</defs>',
            `<image width="${width}" height="${height}" filter="url(#darkslack-image-filter)" xlink:href="${dataURL}" />`,
            '</svg>',
        ].join(''))
    ].join('');
}

function getModifiableCSSDeclaration(property, value, rule, isCancelled) {
    const important = Boolean(rule && rule.style && rule.style.getPropertyPriority(property));
    if (property.startsWith('--')) {
        return null;
    }
    else if (property.indexOf('color') >= 0 && property !== '-webkit-print-color-adjust') {
        const modifier = getColorModifier(property, value);
        if (modifier) {
            return { property, value: modifier, important };
        }
    }
    else if (property === 'background-image') {
        const modifier = getBgImageModifier(property, value, rule, isCancelled);
        if (modifier) {
            return { property, value: modifier, important };
        }
    }
    else if (property.indexOf('shadow') >= 0) {
        const modifier = getShadowModifier(property, value);
        if (modifier) {
            return { property, value: modifier, important };
        }
    }
    return null;
}
function getModifiedUserAgentStyle(filter) {
    const lines = [];
    if (filter.mode === 1) {
        lines.push('html {');
        lines.push(`    background-color: ${modifyBackgroundColor({ r: 255, g: 255, b: 255 }, filter)} !important;`);
        lines.push('}');
    }
    lines.push('html, body, input, textarea, select, button {');
    lines.push(`    background-color: ${modifyBackgroundColor({ r: 255, g: 255, b: 255 }, filter)};`);
    lines.push(`    border-color: ${modifyBorderColor({ r: 76, g: 76, b: 76 }, filter)};`);
    lines.push(`    color: ${modifyForegroundColor({ r: 0, g: 0, b: 0 }, filter)};`);
    lines.push('}');
    lines.push('a {');
    lines.push(`    color: ${modifyBorderColor({ r: 0, g: 64, b: 255 }, filter)};`);
    lines.push('}');
    lines.push('table {');
    lines.push(`    border-color: ${modifyBorderColor({ r: 128, g: 128, b: 128 }, filter)};`);
    lines.push('}');
    lines.push('::placeholder {');
    lines.push(`    color: ${modifyForegroundColor({ r: 169, g: 169, b: 169 }, filter)};`);
    lines.push('}');
    ['::selection', '::-moz-selection'].forEach((selection) => {
        lines.push(`${selection} {`);
        lines.push(`    background-color: ${modifyBackgroundColor({ r: 0, g: 96, b: 212 }, filter)};`);
        lines.push(`    color: ${modifyForegroundColor({ r: 255, g: 255, b: 255 }, filter)};`);
        lines.push('}');
    });
    return lines.join('\n');
}
const unparsableColors = new Set([
    'inherit',
    'transparent',
    'initial',
    'currentcolor',
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
    }
    catch (err) {
        return null;
    }
}
function getColorModifier(prop, value) {
    if (unparsableColors.has(value.toLowerCase())) {
        return () => value;
    }
    try {
        const rgb = parseColorWithCache(value);
        if (prop.indexOf('background') >= 0) {
            return (filter) => modifyBackgroundColor(rgb, filter);
        }
        if (prop.indexOf('border') >= 0 || prop.indexOf('outline') >= 0) {
            return (filter) => modifyBorderColor(rgb, filter);
        }
        return (filter) => modifyForegroundColor(rgb, filter);
    }
    catch (err) {
        logWarn('Color parse error', err);
        return null;
    }
}
const gradientRegex = /[\-a-z]+gradient\(([^\(\)]*(\(.*?\)))*[^\(\)]*\)/g;
const imageDetailsCache = new Map();
const awaitingForImageLoading = new Map();
function getBgImageModifier(prop, value, rule, isCancelled) {
    try {
        const gradients = getMatches(gradientRegex, value);
        const urls = getMatches(cssURLRegex, value);
        if (urls.length === 0 && gradients.length === 0) {
            return null;
        }
        const getIndices = (matches) => {
            let index = 0;
            return matches.map((match) => {
                const valueIndex = value.indexOf(match, index);
                index = valueIndex + match.length;
                return { match, index: valueIndex };
            });
        };
        const matches = getIndices(urls).map((i) => ({ type: 'url', ...i }))
            .concat(getIndices(gradients).map((i) => ({ type: 'gradient', ...i })))
            .sort((a, b) => a.index - b.index);
        const getGradientModifier = (gradient) => {
            const match = gradient.match(/^(.*-gradient)\((.*)\)$/);
            const type = match[1];
            const content = match[2];
            const partsRegex = /([^\(\),]+(\([^\(\)]*\))?[^\(\),]*),?/g;
            const parts = getMatches(partsRegex, content, 1).map((part) => {
                let rgb = tryParseColor(part);
                if (rgb) {
                    return (filter) => modifyGradientColor(rgb, filter);
                }
                const space = part.lastIndexOf(' ');
                rgb = tryParseColor(part.substring(0, space));
                if (rgb) {
                    return (filter) => `${modifyGradientColor(rgb, filter)} ${part.substring(space + 1)}`;
                }
                return () => part;
            });
            return (filter) => {
                return `${type}(${parts.map((modify) => modify(filter)).join(', ')})`;
            };
        };
        const getURLModifier = (urlValue) => {
            let url = getCSSURLValue(urlValue);
            if (rule.parentStyleSheet.href) {
                const basePath = getCSSBaseBath(rule.parentStyleSheet.href);
                url = getAbsoluteURL(basePath, url);
            }
            else {
                url = getAbsoluteURL(location.origin, url);
            }
            if (awaitingForImageLoading.has(url)) {
                return () => new Promise((resolve) => {
                    awaitingForImageLoading.get(url).push(resolve);
                });
            }
            awaitingForImageLoading.set(url, []);
            return async (filter) => {
                let imageDetails;
                if (imageDetailsCache.has(url)) {
                    imageDetails = imageDetailsCache.get(url);
                }
                else {
                    try {
                        imageDetails = await getImageDetails(url);
                        if (isCancelled()) {
                            return null;
                        }
                    }
                    catch (err) {
                        logWarn(err);
                        awaitingForImageLoading.get(url).forEach((resolve) => resolve(urlValue));
                        return urlValue;
                    }
                    imageDetailsCache.set(url, imageDetails);
                }
                const bgImageValue = getBgImageValue(imageDetails, filter) || urlValue;
                awaitingForImageLoading.get(url).forEach((resolve) => resolve(bgImageValue));
                return bgImageValue;
            };
        };
        const getBgImageValue = (imageDetails, filter) => {
            const { isDark, isLight, isTransparent, isLarge, width } = imageDetails;
            let result;
            if (isDark && isTransparent && filter.mode === 1 && !isLarge && width > 2) {
                logInfo(`Inverting dark image ${imageDetails.src}`);
                const inverted = getFilteredImageDataURL(imageDetails, { ...filter, sepia: clamp(filter.sepia + 90, 0, 100) });
                result = `url("${inverted}")`;
            }
            else if (isLight && !isTransparent && filter.mode === 1) {
                if (isLarge) {
                    result = 'none';
                }
                else {
                    logInfo(`Inverting light image ${imageDetails.src}`);
                    const dimmed = getFilteredImageDataURL(imageDetails, filter);
                    result = `url("${dimmed}")`;
                }
            }
            else {
                result = null;
            }
            return result;
        };
        const modifiers = [];
        let index = 0;
        matches.forEach(({ match, type, index: matchStart }, i) => {
            const prefixStart = index;
            const matchEnd = matchStart + match.length;
            index = matchEnd;
            modifiers.push(() => value.substring(prefixStart, matchStart));
            modifiers.push(type === 'url' ? getURLModifier(match) : getGradientModifier(match));
            if (i === matches.length - 1) {
                modifiers.push(() => value.substring(matchEnd));
            }
        });
        return (filter) => {
            const results = modifiers.map((modify) => modify(filter));
            if (results.some((r) => r instanceof Promise)) {
                return Promise.all(results)
                    .then((asyncResults) => {
                        return asyncResults.join('');
                    });
            }
            return results.join('');
        };
    }
    catch (err) {
        logWarn(`Unable to parse gradient ${value}`, err);
        return null;
    }
}
function getShadowModifier(prop, value) {
    try {
        let index = 0;
        const colorMatches = getMatches(/(^|\s)([a-z]+\(.+?\)|#[0-9a-f]+|[a-z]+)(.*?(inset|outset)?($|,))/ig, value, 2);
        const modifiers = colorMatches.map((match, i) => {
            const prefixIndex = index;
            const matchIndex = value.indexOf(match, index);
            const matchEnd = matchIndex + match.length;
            index = matchEnd;
            const rgb = tryParseColor(match);
            if (!rgb) {
                return () => value.substring(prefixIndex, matchEnd);
            }
            return (filter) => `${value.substring(prefixIndex, matchIndex)}${modifyShadowColor(rgb, filter)}${i === colorMatches.length - 1 ? value.substring(matchEnd) : ''}`;
        });
        return (filter) => modifiers.map((modify) => modify(filter)).join('');
    }
    catch (err) {
        logWarn(`Unable to parse shadow ${value}`, err);
        return null;
    }
}
function cleanModificationCache() {
    colorParseCache.clear();
    clearColorModificationCache();
    imageDetailsCache.clear();
    awaitingForImageLoading.clear();
}

function getInlineStyleOverride(elements, filter) {
    const styles = [];
    let prefix = Math.round(Date.now() * Math.random()).toString(16);
    let counter = 0;
    elements.forEach((el) => {
        const modDecs = [];
        el.style && iterateCSSDeclarations(el.style, (property, value) => {
            // Temporaty ignore background images
            // due to possible performance issues
            // and complexity of handling async requests
            if (property === 'background-image') {
                return;
            }
            const mod = getModifiableCSSDeclaration(property, value, null, null);
            if (mod) {
                modDecs.push(mod);
            }
        });
        if (modDecs.length > 0) {
            const id = `${prefix}-${++counter}`;
            el.dataset.darkslackInlineId = id;
            const selector = `[data-darkslack-inline-id="${id}"]`;
            const lines = [];
            lines.push(`${selector} {`);
            modDecs.forEach(({ property, value }) => {
                const val = typeof value === 'function' ? value(filter) : value;
                if (val) {
                    lines.push(`    ${property}: ${val} !important;`);
                }
            });
            lines.push('}');
            styles.push(lines.join('\n'));
        }
    });
    return styles.join('\n');
}

async function manageStyle(element, { update }) {
    const prevStyles = [];
    let next = element;
    while ((next = next.nextElementSibling) && next.matches('.darkslack')) {
        prevStyles.push(next);
    }
    let corsCopy = prevStyles.find((el) => el.matches('.darkslack--cors')) || null;
    let syncStyle = prevStyles.find((el) => el.matches('.darkslack--sync')) || null;
    const asyncStyles = prevStyles.filter((el) => el.matches('.darkslack--async'));
    let cancelAsyncOperations = false;
    function isCancelled() {
        return cancelAsyncOperations;
    }
    const observer = new MutationObserver(async (mutations) => {
        rules = await getRules();
        update();
    });
    const observerOptions = { attributes: true, childList: true };
    let rules;
    async function getRules() {
        let rules = null;
        if (element.sheet == null) {
            if (element instanceof HTMLLinkElement) {
                await linkLoading(element);
                if (cancelAsyncOperations) {
                    return null;
                }
            }
            else {
                return null;
            }
        }
        try {
            rules = element.sheet.cssRules;
        }
        catch (err) {
            // Sometimes cross-origin stylesheets are protected from direct access
            // so need to load CSS text and insert it into style element
            const link = element;
            if (corsCopy) {
                corsCopy.disabled = false;
                rules = corsCopy.sheet.cssRules;
                corsCopy.disabled = true;
            }
            else {
                corsCopy = await createCORSCopy(link, isCancelled);
                if (corsCopy) {
                    corsCopy.disabled = false;
                    rules = corsCopy.sheet.cssRules;
                    corsCopy.disabled = true;
                }
            }
        }
        return rules;
    }
    function getVariables() {
        const variables = new Map();
        rules && iterateCSSRules(rules, (rule) => {
            rule.style && iterateCSSDeclarations(rule.style, (property, value) => {
                if (property.startsWith('--')) {
                    variables.set(property, value);
                }
            });
        });
        return variables;
    }
    function details() {
        const variables = getVariables();
        return { variables };
    }
    function getFilterKey(filter) {
        return ['mode', 'brightness', 'contrast', 'grayscale', 'sepia'].map((p) => `${p}:${filter[p]}`).join(';');
    }
    const rulesTextCache = new Map();
    const rulesModCache = new Map();
    let prevFilterKey = null;
    async function render(filter, variables) {
        if (!rules) {
            // Observer fails to trigger change?
            rules = await getRules();
            if (!rules) {
                return null;
            }
        }
        cancelAsyncOperations = false;
        let rulesChanged = (rulesModCache.size === 0);
        const notFoundCacheKeys = new Set(rulesModCache.keys());
        const filterKey = getFilterKey(filter);
        let filterChanged = (filterKey !== prevFilterKey);
        const modRules = [];
        iterateCSSRules(rules, (rule) => {
            let cssText = rule.cssText;
            let textDiffersFromPrev = false;
            notFoundCacheKeys.delete(cssText);
            if (!rulesTextCache.has(cssText)) {
                rulesTextCache.set(cssText, cssText);
                textDiffersFromPrev = true;
            }
            // Put CSS text with inserted CSS variables into separate <style> element
            // to properly handle composite properties (e.g. background -> background-color)
            let vars = null;
            let varsRule = null;
            if (variables.size > 0) {
                const cssTextWithVariables = replaceCSSVariables(cssText, variables);
                if (rulesTextCache.get(cssText) !== cssTextWithVariables) {
                    rulesTextCache.set(cssText, cssTextWithVariables);
                    textDiffersFromPrev = true;
                    vars = document.createElement('style');
                    vars.classList.add('darkslack');
                    vars.classList.add('darkslack--vars');
                    vars.media = 'screen';
                    vars.textContent = cssTextWithVariables;
                    element.parentElement.insertBefore(vars, element.nextSibling);
                    varsRule = vars.sheet.cssRules[0];
                }
            }
            if (textDiffersFromPrev) {
                rulesChanged = true;
            }
            else {
                modRules.push(rulesModCache.get(cssText));
                return;
            }
            const modDecs = [];
            const targetRule = varsRule || rule;
            targetRule && targetRule.style && iterateCSSDeclarations(targetRule.style, (property, value) => {
                const mod = getModifiableCSSDeclaration(property, value, rule, isCancelled);
                if (mod) {
                    modDecs.push(mod);
                }
            });
            let modRule = null;
            if (modDecs.length > 0) {
                modRule = { selector: rule.selectorText, declarations: modDecs };
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
        asyncStyles.forEach(removeNode);
        asyncStyles.splice(0);
        const queue = [];
        let frameId = null;
        function addToQueue(d) {
            queue.push(d);
            if (!frameId) {
                frameId = requestAnimationFrame(() => {
                    frameId = null;
                    if (cancelAsyncOperations) {
                        return;
                    }
                    const mediaGroups = queue.reduce((groups, d) => {
                        const media = d.media || '';
                        if (!groups[media]) {
                            groups[media] = [];
                        }
                        groups[media].push(d);
                        return groups;
                    }, {});
                    const asyncStyle = document.createElement('style');
                    asyncStyle.classList.add('darkslack');
                    asyncStyle.classList.add('darkslack--async');
                    asyncStyle.media = 'screen';
                    asyncStyle.textContent = Object.entries(mediaGroups).map(([media, decs]) => [
                        media && `@media ${media} {`,
                        decs.map(({ selector, property, value, importantKeyword }) => [
                            `${selector} {`,
                            `    ${property}: ${value}${importantKeyword};`,
                            '}',
                        ].join('\n')).join('\n'),
                        media && '}',
                    ].filter((ln) => ln)).join('\n');
                    const insertTarget = asyncStyles.length > 0 ? asyncStyles[asyncStyles.length - 1].nextSibling : syncStyle.nextSibling;
                    element.parentElement.insertBefore(asyncStyle, insertTarget);
                    asyncStyles.push(asyncStyle);
                });
            }
        }
        const lines = [];
        modRules.filter((r) => r).forEach(({ selector, declarations, media }) => {
            if (media) {
                lines.push(`@media ${media} {`);
            }
            lines.push(`${selector} {`);
            declarations.forEach(({ property, value, important }) => {
                const importantKeyword = important ? ' !important' : '';
                if (typeof value === 'function') {
                    const modified = value(filter);
                    if (modified instanceof Promise) {
                        modified.then((asyncValue) => {
                            if (cancelAsyncOperations || !asyncValue) {
                                return;
                            }
                            addToQueue({ media, selector, property, value: asyncValue, importantKeyword });
                        });
                    }
                    else {
                        lines.push(`    ${property}: ${modified}${importantKeyword};`);
                    }
                }
                else {
                    lines.push(`    ${property}: ${value}${importantKeyword};`);
                }
            });
            lines.push('}');
            if (media) {
                lines.push('}');
            }
        });
        if (!syncStyle) {
            syncStyle = document.createElement('style');
            syncStyle.classList.add('darkslack');
            syncStyle.classList.add('darkslack--sync');
            syncStyle.media = 'screen';
        }
        element.parentElement.insertBefore(syncStyle, corsCopy ? corsCopy.nextSibling : element.nextSibling);
        syncStyle.textContent = lines.join('\n');
        observer.observe(element, observerOptions);
    }
    function pause() {
        observer.disconnect();
        cancelAsyncOperations = true;
    }
    function destroy() {
        pause();
        removeNode(corsCopy);
        removeNode(syncStyle);
        asyncStyles.forEach(removeNode);
    }
    observer.observe(element, observerOptions);
    rules = await getRules();
    return {
        details,
        render,
        pause,
        destroy,
    };
}
function linkLoading(link) {
    return new Promise((resolve, reject) => {
        const cleanUp = () => {
            link.removeEventListener('load', onLoad);
            link.removeEventListener('error', onError);
        };
        const onLoad = () => {
            cleanUp();
            resolve();
        };
        const onError = () => {
            cleanUp();
            reject(`Link loading failed ${link.href}`);
        };
        link.addEventListener('load', onLoad);
        link.addEventListener('error', onError);
    });
}
async function createCORSCopy(link, isCancelled) {
    const url = link.href;
    const prevCors = Array.from(link.parentElement.querySelectorAll('.darkslack--cors')).find((el) => el.dataset.uri === url);
    if (prevCors) {
        return prevCors;
    }
    let response;
    const cache = sessionStorage.getItem(`darkslack-cache:${url}`);
    if (cache) {
        response = cache;
    }
    else {
        response = await bgFetch({ url, responseType: 'text' });
        if (response.length < 2 * 1024 * 1024) {
            try {
                sessionStorage.setItem(`darkslack-cache:${url}`, response);
            }
            catch (err) {
                logWarn(err);
            }
        }
    }
    let cssText = response;
    cssText = replaceCSSFontFace(cssText);
    cssText = replaceCSSRelativeURLsWithAbsolute(cssText, url);
    cssText = cssText.trim();
    if (!cssText) {
        return null;
    }
    const cors = document.createElement('style');
    cors.classList.add('darkslack');
    cors.classList.add('darkslack--cors');
    cors.media = 'screen';
    cors.dataset.uri = url;
    cors.textContent = cssText;
    link.parentElement.insertBefore(cors, link.nextSibling);
    return cors;
}

const styleManagers = new Map();
const variables = new Map();
let filter = null;
let fixes = null;
function createOrUpdateStyle$1(className) {
    let style = document.head.querySelector(`.${className}`);
    if (!style) {
        style = document.createElement('style');
        style.classList.add('darkslack');
        style.classList.add(className);
        style.media = 'screen';
    }
    return style;
}
function createTheme() {
    const userAgentStyle = createOrUpdateStyle$1('darkslack--user-agent');
    document.head.insertBefore(userAgentStyle, document.head.firstChild);
    userAgentStyle.textContent = getModifiedUserAgentStyle(filter);
    const textStyle = createOrUpdateStyle$1('darkslack--text');
    document.head.insertBefore(textStyle, userAgentStyle.nextSibling);
    if (filter.useFont || filter.textStroke > 0) {
        textStyle.textContent = createTextStyle(filter);
    }
    else {
        textStyle.textContent = '';
    }
    const invertStyle = createOrUpdateStyle$1('darkslack--invert');
    document.head.insertBefore(invertStyle, textStyle.nextSibling);
    if (fixes && Array.isArray(fixes.invert) && fixes.invert.length > 0) {
        invertStyle.textContent = [
            `${fixes.invert.join(', ')} {`,
            `    filter: ${getCSSFilterValue(filter)} !important;`,
            '}',
        ].join('\n');
    }
    else {
        invertStyle.textContent = '';
    }
    const inlineStyle = createOrUpdateStyle$1('darkslack--inline');
    document.head.insertBefore(inlineStyle, invertStyle.nextSibling);
    if (fixes && Array.isArray(fixes.inline) && fixes.inline.length > 0) {
        const elements = Array.from(document.querySelectorAll(fixes.inline.join(', ')));
        inlineStyle.textContent = getInlineStyleOverride(elements, filter);
    }
    else {
        inlineStyle.textContent = '';
    }
    Array.from(document.querySelectorAll('link[rel="stylesheet" i], style'))
        .filter((style) => !styleManagers.has(style) && shouldManageStyle(style))
        .forEach((style) => createManager(style));
    throttledRender();
}
const pendingCreation = new Set();
async function createManager(element) {
    if (styleManagers.has(element) || pendingCreation.has(element)) {
        return;
    }
    pendingCreation.add(element);
    function update() {
        const details = manager.details();
        updateVariables(details.variables);
        throttledRender();
    }
    const manager = await manageStyle(element, { update });
    if (!pendingCreation.has(element)) {
        manager.destroy();
        return;
    }
    styleManagers.set(element, manager);
    update();
}
function updateVariables(newVars) {
    newVars.forEach((value, key) => variables.set(key, value));
    variables.forEach((value, key) => variables.set(key, replaceCSSVariables(value, variables)));
}
function removeManager(element) {
    const manager = styleManagers.get(element);
    if (manager) {
        manager.destroy();
        styleManagers.delete(element);
    }
}
let pendingRendering = false;
let requestedFrameId = null;
function render() {
    styleManagers.forEach((manager) => manager.render(filter, variables));
}
function throttledRender() {
    if (requestedFrameId) {
        pendingRendering = true;
    }
    else {
        render();
        requestedFrameId = requestAnimationFrame(() => {
            requestedFrameId = null;
            if (pendingRendering) {
                render();
                pendingRendering = false;
            }
        });
    }
}
function shouldManageStyle(element) {
    return (((element instanceof HTMLStyleElement) ||
        (element instanceof HTMLLinkElement && element.rel && element.rel.toLowerCase() === 'stylesheet')) && (!element.classList.contains('darkslack') ||
            element.classList.contains('darkslack--cors')) &&
        element.media !== 'print');
}
let styleChangeObserver = null;
function createThemeAndWatchForUpdates() {
    createTheme();
    styleChangeObserver = new MutationObserver((mutations) => {
        const addedStyles = mutations.reduce((nodes, m) => nodes.concat(Array.from(m.addedNodes).filter(shouldManageStyle)), []);
        addedStyles.forEach((el) => createManager(el));
        const removedStyles = mutations.reduce((nodes, m) => nodes.concat(Array.from(m.removedNodes).filter(shouldManageStyle)), []);
        removedStyles.forEach((el) => removeManager(el));
        if ((addedStyles.length + removedStyles.length > 0) ||
            mutations.some((m) => m.target && shouldManageStyle(m.target))) {
            throttledRender();
        }
    });
    styleChangeObserver.observe(document.documentElement, { childList: true, subtree: true, characterData: true });
    document.addEventListener('load', throttledRender);
    window.addEventListener('load', throttledRender);
}
function stopWatchingForUpdates() {
    styleManagers.forEach((manager) => manager.pause());
    if (styleChangeObserver) {
        styleChangeObserver.disconnect();
        styleChangeObserver = null;
    }
    document.removeEventListener('load', throttledRender);
    window.removeEventListener('load', throttledRender);
}
function createOrUpdateDynamicTheme(filterConfig, dynamicThemeFixes) {
    filter = filterConfig;
    fixes = dynamicThemeFixes;
    if (document.head) {
        createThemeAndWatchForUpdates();
    }
    else {
        const headObserver = new MutationObserver(() => {
            if (document.head) {
                headObserver.disconnect();
                createThemeAndWatchForUpdates();
            }
        });
        headObserver.observe(document, { childList: true, subtree: true });
    }
}
function removeDynamicTheme() {
    cleanDynamicThemeCache();
    if (document.head) {
        removeNode(document.head.querySelector('.darkslack--user-agent'));
        removeNode(document.head.querySelector('.darkslack--text'));
        removeNode(document.head.querySelector('.darkslack--invert'));
        removeNode(document.head.querySelector('.darkslack--inline'));
    }
    Array.from(styleManagers.keys()).forEach((el) => removeManager(el));
    Array.from(document.querySelectorAll('.darkslack')).forEach(removeNode);
}
function cleanDynamicThemeCache() {
    cancelAnimationFrame(requestedFrameId);
    pendingRendering = false;
    requestedFrameId = null;
    pendingCreation.clear();
    stopWatchingForUpdates();
    cleanModificationCache();
}

