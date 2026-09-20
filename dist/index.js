//#region src/ucs.ts
function e(e, t) {
	return [
		e[0] * t[0] + e[1] * t[1] + e[2] * t[2],
		e[3] * t[0] + e[4] * t[1] + e[5] * t[2],
		e[6] * t[0] + e[7] * t[1] + e[8] * t[2]
	];
}
function t(e, t) {
	let n = [];
	for (let r = 0; r < 3; r++) for (let i = 0; i < 3; i++) n.push(e[r * 3] * t[i] + e[r * 3 + 1] * t[3 + i] + e[r * 3 + 2] * t[6 + i]);
	return n;
}
function n(e) {
	let [t, n, r, i, a, o, s, c, l] = e, u = t * (a * l - o * c) - n * (i * l - o * s) + r * (i * c - a * s);
	return [
		(a * l - o * c) / u,
		(r * c - n * l) / u,
		(n * o - r * a) / u,
		(o * s - i * l) / u,
		(t * l - r * s) / u,
		(r * i - t * o) / u,
		(i * c - a * s) / u,
		(n * s - t * c) / u,
		(t * a - n * i) / u
	];
}
var r = [
	.4360747,
	.3850649,
	.1430804,
	.2225045,
	.7168786,
	.0606169,
	.0139322,
	.0971045,
	.7141733
], i = [
	3.1338561,
	-1.6168667,
	-.4906146,
	-.9787684,
	1.9161415,
	.033454,
	.0719453,
	-.2289914,
	1.4052427
], a = [
	1.01085433,
	.0407086103,
	-.0341445825,
	.00542814201,
	.993581926,
	.00115592039,
	.000250722468,
	-.0114918759,
	.767964947
], o = [
	.989466254,
	-.0400304626,
	.0440530317,
	-.00540518733,
	1.00666069,
	-.00175551955,
	-.000403920992,
	.015076803,
	1.30210211
], s = [
	[.708, .292],
	[.17, .797],
	[.131, .046]
], c = [.312700492, .329000939], l = [
	.8951,
	.2664,
	-.1614,
	-.7502,
	1.7135,
	.0367,
	.0389,
	-.0685,
	1.0296
], u = [
	.9642,
	1,
	.8249
];
function d(r, i) {
	let [[a, o], [s, c], [d, f]] = r, p = [
		a / o,
		s / c,
		d / f,
		1,
		1,
		1,
		(1 - a - o) / o,
		(1 - s - c) / c,
		(1 - d - f) / f
	], m = [
		i[0] / i[1],
		1,
		(1 - i[0] - i[1]) / i[1]
	], h = e(n(p), m), g = p.map((e, t) => e * h[t % 3]), _ = e(l, m), v = e(l, u), y = l.map((e, t) => v[Math.floor(t / 3)] / _[Math.floor(t / 3)] * e);
	return t(t(n(l), y), g);
}
var f = d(s, c), p = n(f), m = t(p, r), h = t(i, f), g = {
	a: .17883277,
	b: .28466892,
	c: .55991073
};
function _(e) {
	return e <= 0 ? 0 : e <= 1 / 12 ? Math.sqrt(3 * e) : g.a * Math.log(12 * e - g.b) + g.c;
}
var v = 2.098883786377, y = .631651345306265, b = 1.12426773749357, x = 1.5831518565279648, S = 15.932993652962535, C = .6523997524738018, w = .6007557017508491, T = .8322850678616855, E = 1.33654221029386, ee = [
	-.783941002840055,
	.745273540913283,
	.318707282433486
], te = [
	.277512987809202,
	-.205375866083878,
	2.16743692732158
], ne = [
	.153836578598858,
	-.165478376301988,
	.291320554395942
], D = [1.39656225667, 1.4513954287], O = [1.49217352929, 1.52488637914], re = [
	-1.124983854323892,
	-.980483721769325,
	1.86323315098672,
	1.971853092390862
], k = [
	-5.037522385190711,
	-2.504856328185843,
	4.760029407436461,
	2.874012963239247
], ie = [
	.167171472114775,
	-.150959086409163,
	.940254742367256
], ae = [
	.141299802443708,
	-.155185060382272,
	1
], oe = [
	-.00801531300850582,
	-.00843312433578007,
	-.0256325967652889
], se = 1.1920929e-7, ce = 117549435e-46;
function le(e) {
	let t = e ** +y;
	return v * t / (t + b);
}
function ue(e) {
	return (b * e / (v - e)) ** +x;
}
var A = le(1);
function de(e) {
	let t = e[0] + e[1] + e[2];
	return [
		e[0] / t,
		e[1] / t,
		e[1]
	];
}
function fe(e) {
	let [t, n, r] = e;
	return n === 0 ? [
		0,
		0,
		0
	] : [
		r * t / n,
		r,
		r * (1 - t - n) / n
	];
}
function pe(e) {
	return e >= 0 ? Math.max(ce, e) : Math.min(-117549435e-46, e);
}
function me(e) {
	let t = [
		0,
		0,
		0
	];
	for (let n = 0; n < 3; n++) t[n] = ee[n] * e[0] + te[n] * e[1] + ne[n];
	let n = pe(t[2]), r = t[0] / n, i = t[1] / n, a = D[0] * r / (Math.abs(r) + O[0]), o = D[1] * i / (Math.abs(i) + O[1]), s = re[0] * a + re[1] * o, c = re[2] * a + re[3] * o, l = le(e[2]), u = s * s + c * c;
	return [
		l / A,
		S * l ** +C * u ** +w / A,
		Math.atan2(c, s)
	];
}
function he(e) {
	let t = e[0] * A, n = t > 0 ? (e[1] * A / (S * t ** +C)) ** T : 0, r = n * Math.cos(e[2]), i = n * Math.sin(e[2]), a = k[0] * r + k[1] * i, o = k[2] * r + k[3] * i, s = -O[0] * a / (Math.abs(a) - D[0]), c = -O[1] * o / (Math.abs(o) - D[1]), l = [
		0,
		0,
		0
	];
	for (let e = 0; e < 3; e++) l[e] = ie[e] * s + ae[e] * c + oe[e];
	let u = pe(l[2]);
	return [
		l[0] / u,
		l[1] / u,
		t > 0 ? ue(t) : 0
	];
}
function ge(e) {
	let t = e[0] * (e[1] ** +E + 1);
	return [
		e[2],
		t > 0 ? e[1] / t : 0,
		t
	];
}
function _e(e) {
	let t = e[1] * e[2];
	return [
		e[2] / (t ** +E + 1),
		t,
		e[0]
	];
}
function ve(e) {
	return fe(he(_e(e)));
}
function ye(t) {
	return e(a, t);
}
function be(t) {
	let n = e(p, ye(ve(t)));
	return [
		_(n[0]),
		_(n[1]),
		_(n[2])
	];
}
function j(e) {
	return e <= .0031308 ? 12.92 * e : 1.055 * e ** (1 / 2.4) - .055;
}
function xe(t) {
	let n = e(i, ye(ve(t)));
	return [
		j(n[0]),
		j(n[1]),
		j(n[2])
	];
}
function Se(t) {
	let n = e(i, ye(ve(t))), r = Math.max(n[0], n[1], n[2]);
	(n[0] > 1 || n[1] > 1 || n[2] > 1) && (n = [
		n[0] / r,
		n[1] / r,
		n[2] / r
	]);
	let a = (e) => e < 0 ? 0 : e > 1 ? 1 : e;
	return [
		a(j(n[0])),
		a(j(n[1])),
		a(j(n[2]))
	];
}
function Ce(t) {
	let n = e(o, e(r, t)), i = [
		Math.max(n[0], 0),
		Math.max(n[1], 0),
		Math.max(n[2], 0)
	];
	return i[0] + i[1] + i[2] <= 1e-6 ? [
		0,
		0,
		0
	] : me(de(i));
}
function we(e) {
	return ge(Ce(e));
}
function Te(e) {
	return e <= .04045 ? e / 12.92 : ((e + .055) / 1.055) ** 2.4;
}
function Ee(e) {
	return e <= .0031308 ? 12.92 * e : 1.055 * e ** (1 / 2.4) - .055;
}
//#endregion
//#region src/curve.ts
var M = [
	"saturation",
	"brightness",
	"hue"
], De = .01, Oe = .999, ke = 2 * Math.PI / 128, N = 2 * Math.PI;
function Ae() {
	return Array.from({ length: 8 }, (e, t) => ({
		x: t / 8,
		y: .5
	}));
}
function P(e) {
	return e.map((e) => ({
		x: e.x - Math.floor(e.x),
		y: e.y
	})).sort((e, t) => e.x - t.x);
}
function F(e, t) {
	if (e.length < 2) return .5;
	let n = P(e), r = n.length, i = Array(r);
	for (let e = 0; e < r - 1; e++) i[e] = (n[e + 1].y - n[e].y) / (n[e + 1].x - n[e].x);
	i[r - 1] = (n[0].y - n[r - 1].y) / (n[0].x - n[r - 1].x + 1);
	let a = Array(r);
	a[0] = i[r - 1] * i[0] <= 0 ? 0 : (i[r - 1] + i[0]) / 2;
	for (let e = 1; e < r; e++) a[e] = i[e - 1] * i[e] <= 0 ? 0 : (i[e - 1] + i[e]) / 2;
	for (let e = 0; e < r; e++) {
		let t = e + 1 < r ? e + 1 : 0;
		if (Math.abs(i[e]) < 1.1920929e-7) a[e] = 0, a[t] = 0;
		else {
			let n = a[e] / i[e], r = a[t] / i[e], o = n * n + r * r;
			o > 9 && (a[e] = 3 * n * i[e] / Math.sqrt(o), a[t] = 3 * r * i[e] / Math.sqrt(o));
		}
	}
	let o = t - Math.floor(t);
	o < n[0].x && (o += 1);
	let s = r - 1;
	for (let e = 0; e < r; e++) if (n[e].x > o) {
		s = e - 1;
		break;
	}
	let c = s + 1 < r ? s + 1 : 0, l = c > s ? n[c].x - n[s].x : n[c].x - (n[s].x - 1), u = (o - n[s].x) / l, d = u * u, f = d * u, p = f - 2 * d + u, m = -2 * f + 3 * d, h = f - d;
	return n[s].y + (n[c].y - n[s].y) * m + l * (a[s] * p + a[c] * h);
}
function I(e, t) {
	if (e === "hue") return (t - .5) * N;
	let n = t * 2;
	return n < 0 ? 0 : n > 2 ? 2 : n;
}
function je(e, t) {
	let n = e === "hue" ? t / N + .5 : t * .5;
	return n < 0 ? 0 : n > 1 ? 1 : n;
}
function Me(e) {
	for (; e < 0;) e += N;
	for (; e >= N;) e -= N;
	return e;
}
function Ne(e) {
	return Me(e + Math.PI) - Math.PI;
}
function Pe(e) {
	return Ne((360 * e + 20) * Math.PI / 180);
}
function L(e) {
	return Me(e - 20 * Math.PI / 180) / N;
}
function Fe(e, t) {
	let n = Math.abs(e - t);
	return Math.min(n, 1 - n);
}
function Ie(e, t, n) {
	if (e.length >= 20) return null;
	let r = e.length;
	if (e[0].x > t) r = 0;
	else for (let n = 1; n < e.length; n++) if (e[n].x > t) {
		r = n;
		break;
	}
	let i = r > 0 ? e[r - 1].x : e[e.length - 1].x - 1, a = r < e.length ? e[r].x : e[0].x + 1;
	if (t - i <= .01 || a - t <= .01) return null;
	let o = [...e];
	return o.splice(r, 0, {
		x: t,
		y: n
	}), {
		nodes: o,
		index: r
	};
}
function Le(e, t, n, r) {
	let i = e.length, a = n < 0 ? 0 : n > .999 ? Oe : n, o = r < 0 ? 0 : r > 1 ? 1 : r;
	if (t === 0) a + 1 - e[i - 1].x < .01 && (a = e[i - 1].x + De - 1);
	else if (t === i - 1) e[0].x + 1 - a < .01 && (a = e[0].x + 1 - De);
	else if (a - e[t - 1].x < .01 || e[t + 1].x - a < .01) return null;
	let s = [...e];
	return s[t] = {
		x: a,
		y: o
	}, s;
}
function Re(e, t) {
	if (e.length <= 2 || t < 0 || t >= e.length) return null;
	let n = [...e];
	return n.splice(t, 1), n;
}
function ze(e, t) {
	return e === "hue" ? (t === "coarse" ? 10 : t === "fine" ? 1 : 5) * Math.PI / 180 : t === "coarse" ? .1 : t === "fine" ? .02 : .05;
}
function Be(e, t, n, r, i) {
	let a = ze(t, i) * r, o = 2 * ke * ke;
	return e.map((e) => {
		let r = Fe(e.x, n), i = Math.exp(-(r * r) / o), s = I(t, e.y) + a * i;
		return s = t === "hue" ? s < -Math.PI ? -Math.PI : s > Math.PI ? Math.PI : s : s < 0 ? 0 : s > 2 ? 2 : s, {
			x: e.x,
			y: je(t, s)
		};
	});
}
//#endregion
//#region src/rings.ts
var R = [
	"shadows",
	"midtones",
	"highlights"
], z = {
	shadows: .15,
	midtones: .45,
	highlights: .75
}, Ve = (e) => e < 0 ? 0 : e > 1 ? 1 : e;
function He(e) {
	let t = 0, n = 1;
	for (let r = 0; r < 18; r++) {
		let r = .5 * (t + n), i = !0;
		for (let t = 0; t < 64; t++) {
			let n = xe([
				Pe(t / 64),
				r,
				e
			]);
			if (n[0] < 0 || n[0] > 1 || n[1] < 0 || n[1] > 1 || n[2] < 0 || n[2] > 1) {
				i = !1;
				break;
			}
		}
		i ? t = r : n = r;
	}
	return t;
}
var Ue = {
	shadows: He(z.shadows),
	midtones: He(z.midtones),
	highlights: He(z.highlights)
};
function We(e) {
	let t = be([
		0,
		0,
		Ve(e)
	]);
	return Ve((t[0] + t[1] + t[2]) / 3);
}
var Ge = .7;
function Ke(e) {
	let t = Math.round(e * Ge);
	return {
		width: e,
		height: t + 14 + 8,
		plotW: e - 8,
		plotH: t
	};
}
var B = (e) => e < 0 ? 0 : e > 1 ? 1 : e;
function qe(e, t, n) {
	return {
		x: B((t - 4) / e.plotW),
		y: B(1 - (n - 4) / e.plotH),
		onAxis: n > 4 + e.plotH
	};
}
function Je(e, t, n, r) {
	let i = -1, a = 100;
	return e.forEach((e, o) => {
		let s = n - (4 + e.x * t.plotW), c = r - (4 + (1 - e.y) * t.plotH), l = s * s + c * c;
		l < a && (a = l, i = o);
	}), i;
}
function Ye(e, t, n, r, i) {
	let a = Pe(t);
	switch (e) {
		case "hue": return [
			Ne(a + I(e, n)),
			i,
			r
		];
		case "brightness": return [
			a,
			i,
			B(r * I(e, n))
		];
		default: return [
			a,
			B(i * I(e, n)),
			r
		];
	}
}
function Xe(e, t) {
	let n = Ue[t];
	return e === "hue" ? n : B(n * 1.35);
}
var Ze = /* @__PURE__ */ new Map();
function Qe(e, t) {
	let n = `${e}/${t}`, r = Ze.get(n);
	if (r) return r;
	let i = /* @__PURE__ */ new Uint8ClampedArray(69120), a = z[e], o = Xe(t, e);
	for (let e = 0; e < 48; e++) {
		let n = (48 - e) / 48;
		for (let r = 0; r < 360; r++) {
			let s = Se(Ye(t, r / 359, n, a, o)), c = (e * 360 + r) * 4;
			i[c] = Math.round(s[0] * 255), i[c + 1] = Math.round(s[1] * 255), i[c + 2] = Math.round(s[2] * 255), i[c + 3] = 255;
		}
	}
	let s = {
		width: 360,
		height: 48,
		data: i
	};
	return Ze.set(n, s), s;
}
function $e(e, t, n = 36) {
	let r = z[e], i = Xe(t, e), a = [];
	for (let e = 0; e <= n; e++) {
		let t = e / n, o = Se([
			Pe(t),
			i,
			r
		]);
		a.push({
			at: t,
			css: `rgb(${Math.round(o[0] * 255)}, ${Math.round(o[1] * 255)}, ${Math.round(o[2] * 255)})`
		});
	}
	return a;
}
//#endregion
//#region src/field.ts
var et = [
	"tetrahedral",
	"trilinear",
	"pyramid"
];
//#endregion
//#region src/model.ts
function tt() {
	let e = {};
	for (let t of R) {
		e[t] = {};
		for (let n of M) e[t][n] = Ae();
	}
	return e;
}
var V = {
	curves: tt(),
	whiteLevel: 1,
	sigmaL: 50,
	sigmaRho: 1,
	sigmaTheta: .4,
	neutralProtection: .05,
	interpolation: 0
};
function nt(e) {
	for (let t of R) for (let n of M) if (e.curves[t][n].some((e) => e.y !== .5)) return !0;
	return !1;
}
//#endregion
//#region src/params.ts
var rt = "colour-equaliser";
function it(e) {
	let t = 0;
	for (let n = 0; n < e.length; n++) t = (t << 5) - t + e.charCodeAt(n) | 0;
	return (t >>> 0).toString(36).slice(0, 4);
}
function at(e, t) {
	let n = e;
	for (let r = 1; t.has(it(n)) && r < 1e3; r++) n = `${e}-${r}`;
	return n;
}
var H = at(`${rt}.rings`, /* @__PURE__ */ new Set()), ot = {
	saturation: "Saturation",
	brightness: "Brightness",
	hue: "Hue"
};
function st(e, t, n) {
	return `${H}.${e}${ot[t]}${n}`;
}
function ct(e, t) {
	return `${H}.${e}${ot[t]}Count`;
}
var U = Object.fromEntries([
	"whiteLevel",
	"sigmaL",
	"sigmaRho",
	"sigmaTheta",
	"neutralProtection",
	"interpolation",
	"on"
].map((e) => [e, `${H}.${e}`]));
function lt() {
	let e = [];
	for (let t of R) for (let n of M) {
		for (let r = 0; r < 10; r++) e.push(st(t, n, r));
		e.push(ct(t, n));
	}
	return e;
}
function ut(e) {
	let t = P(e), n = [];
	for (let e = 0; e < 10; e++) {
		let r = t[2 * e], i = t[2 * e + 1];
		n.push([
			r?.x ?? 0,
			r?.y ?? 0,
			i?.x ?? 0,
			i?.y ?? 0
		]);
	}
	return {
		chunks: n,
		count: t.length
	};
}
var dt = (e) => typeof e == "number" && Number.isFinite(e), ft = (e) => Array.isArray(e) && e.length === 4 && e.every(dt);
function pt(e, t) {
	let n = [];
	for (let r = 0; r < t; r++) {
		let t = e[r >> 1], i = (r & 1) * 2;
		n.push({
			x: t[i],
			y: t[i + 1]
		});
	}
	let r = P(n), i = [];
	for (let e of r) i.length > 0 && Math.abs(e.x - i[i.length - 1].x) < 1e-6 || i.push(e);
	return i;
}
function mt(e, t, n) {
	let r = e[ct(t, n)];
	if (!dt(r) || r < 2 || r > 20 || r !== Math.floor(r)) return null;
	let i = [];
	for (let a = 0; a < Math.ceil(r / 2); a++) {
		let r = e[st(t, n, a)];
		if (!ft(r)) return null;
		i.push(r);
	}
	let a = pt(i, r);
	return a.length >= 2 ? a : null;
}
function W(e, t, n) {
	let r = e[t];
	return dt(r) ? r : n;
}
function G(e) {
	let t = tt(), n = {};
	for (let r of R) {
		n[r] = {};
		for (let i of M) n[r][i] = mt(e, r, i) ?? t[r][i];
	}
	let r = Math.round(W(e, U.interpolation, V.interpolation));
	return {
		curves: n,
		whiteLevel: W(e, U.whiteLevel, V.whiteLevel),
		sigmaL: W(e, U.sigmaL, V.sigmaL),
		sigmaRho: W(e, U.sigmaRho, V.sigmaRho),
		sigmaTheta: W(e, U.sigmaTheta, V.sigmaTheta),
		neutralProtection: W(e, U.neutralProtection, V.neutralProtection),
		interpolation: r < 0 ? 0 : r > 2 ? 2 : r
	};
}
function K(e) {
	let t = {};
	for (let n of R) for (let r of M) {
		let { chunks: i, count: a } = ut(e.curves[n][r]);
		i.forEach((e, i) => {
			t[st(n, r, i)] = e;
		}), t[ct(n, r)] = a;
	}
	return t[U.whiteLevel] = e.whiteLevel, t[U.sigmaL] = e.sigmaL, t[U.sigmaRho] = e.sigmaRho, t[U.sigmaTheta] = e.sigmaTheta, t[U.neutralProtection] = e.neutralProtection, t[U.interpolation] = e.interpolation, t[U.on] = +!!nt(e), t;
}
function ht() {
	return K(V);
}
function gt(e) {
	if (!lt().some((t) => t in e)) return null;
	let t = K(G(e));
	return e[U.on] === t[U.on] ? null : t;
}
//#endregion
//#region src/runtime.ts
var _t = null;
function vt(e) {
	_t = e;
}
function q() {
	if (!_t) throw Error("[colour-equaliser] api() called before activate()");
	return _t;
}
function J(e, t, ...n) {
	return q().react.createElement(e, t, ...n);
}
//#endregion
//#region src/store.ts
var yt = null;
function bt() {
	yt = q().stores.create((e) => ({
		mode: null,
		samples: {
			input: null,
			output: null
		},
		cursor: null,
		picker: null,
		setMode: (t) => e({
			mode: t,
			cursor: null
		}),
		setSamples: (t) => e({ samples: t }),
		setCursor: (t) => e({ cursor: t }),
		setPicker: (t) => e({ picker: t })
	}));
}
function Y() {
	if (!yt) throw Error("[colour-equaliser] store() called before activate()");
	return yt;
}
var xt = /* @__PURE__ */ new Float32Array(256);
for (let e = 0; e < 256; e++) xt[e] = Te(e / 255);
var X = null;
function St(e) {
	let { width: t, height: n } = e;
	if (t < 2 || n < 2) return null;
	let r = Math.min(1, 320 / Math.max(t, n)), i = Math.max(1, Math.round(t * r)), a = Math.max(1, Math.round(n * r));
	X ||= new OffscreenCanvas(i, a), X.width !== i && (X.width = i), X.height !== a && (X.height = a);
	let o = X.getContext("2d", { willReadFrequently: !0 });
	return o ? (o.drawImage(e, 0, 0, i, a), {
		data: o.getImageData(0, 0, i, a).data,
		width: i,
		height: a
	}) : null;
}
function Ct(e, t, n) {
	if (t < 0 || t > 1 || n < 0 || n > 1) return null;
	let { data: r, width: i, height: a } = e, o = Math.min(i - 1, Math.floor(t * i)), s = Math.min(a - 1, Math.floor(n * a)), c = 0, l = 0, u = 0, d = 0;
	for (let e = Math.max(0, s - 2); e <= Math.min(a - 1, s + 2); e++) for (let t = Math.max(0, o - 2); t <= Math.min(i - 1, o + 2); t++) {
		let n = (e * i + t) * 4;
		c += xt[r[n]], l += xt[r[n + 1]], u += xt[r[n + 2]], d++;
	}
	return d === 0 ? null : [
		c / d,
		l / d,
		u / d
	];
}
function wt(e) {
	let t = (e) => Math.round(Ee(e < 0 ? 0 : e > 1 ? 1 : e) * 255);
	return `rgb(${t(e[0])}, ${t(e[1])}, ${t(e[2])})`;
}
function Tt(e) {
	let t = (e) => Math.min(100, Math.max(0, Math.round((1 - e) * 100)));
	if (e <= .15) return "100% shadows";
	if (e < .45) {
		let n = t((e - .15) / .3);
		return `${n}% shadows, ${100 - n}% midtones`;
	}
	if (e < .75) {
		let n = t((e - .45) / .3);
		return `${n}% midtones, ${100 - n}% highlights`;
	}
	return "100% highlights";
}
function Et(e) {
	let t = e.throttleMs ?? 150, n = !1, r = !1, i = !1, a = null, o = -Infinity, s = () => {
		a = null;
		let t = e.develop.getState();
		if (n || !t.photoId) return;
		r = !0, o = Date.now();
		let s = t.previewParams ?? t.params;
		Promise.all([e.captureOutput(s), e.renderInput(t.photoId, s, {
			...t.paramBag,
			[U.on]: 0
		})]).then(([t, r]) => {
			let i = (t) => {
				let r = t && !n ? e.readback(t) : null;
				return t?.close?.(), r;
			}, a = {
				output: i(t),
				input: i(r)
			};
			n || e.publish(a);
		}).catch(() => {
			n || e.publish({
				input: null,
				output: null
			});
		}).finally(() => {
			r = !1, i && !n && (i = !1, c());
		});
	}, c = () => {
		if (!n) {
			if (r) {
				i = !0;
				return;
			}
			a === null && (a = setTimeout(s, Math.max(0, t - (Date.now() - o))));
		}
	}, l = e.develop.subscribe((t, n) => {
		if (t.photoId !== n.photoId && !t.photoId) {
			i = !1, a !== null && (clearTimeout(a), a = null), e.publish({
				input: null,
				output: null
			});
			return;
		}
		t.photoId && (t.histogram !== n.histogram || t.photoId !== n.photoId || t.paramBag !== n.paramBag) && c();
	});
	return c(), () => {
		n = !0, l(), a !== null && clearTimeout(a), a = null;
	};
}
function Dt() {
	let e = q();
	return Et({
		develop: e.stores.useDevelopStore,
		captureOutput: (t) => e.develop.captureFrame(t),
		renderInput: (t, n, r) => e.develop.renderPhotoFrame(t, n, r),
		readback: St,
		publish: (e) => Y().getState().setSamples(e)
	});
}
//#endregion
//#region src/Graph.ts
var Ot = 240;
function kt(e) {
	let t = getComputedStyle(e).backgroundColor.match(/\d+(?:\.\d+)?/g);
	return !t || (Number(t[0]) + Number(t[1]) + Number(t[2])) / 765 < .5 ? {
		fg: "rgba(235, 235, 235, 0.92)",
		faint: "rgba(235, 235, 235, 0.28)",
		bg: "rgba(20, 20, 20, 0.9)"
	} : {
		fg: "rgba(25, 25, 25, 0.9)",
		faint: "rgba(25, 25, 25, 0.28)",
		bg: "rgba(245, 245, 245, 0.9)"
	};
}
var At = /* @__PURE__ */ new Map();
function jt(e, t) {
	let n = `${e}/${t}`, r = At.get(n);
	if (r) return r;
	let i = Qe(e, t), a = document.createElement("canvas");
	a.width = i.width, a.height = i.height;
	let o = a.getContext("2d");
	return o && o.putImageData(new ImageData(i.data, i.width, i.height), 0, 0), At.set(n, a), a;
}
function Mt(e, t, n, r) {
	let { plotW: i, plotH: a } = t, o = (e) => 4 + e * i, s = (e) => 4 + (1 - e) * a;
	e.clearRect(0, 0, t.width, t.height), e.drawImage(jt(r.ring, r.channel), 4, 4, i, a), e.lineWidth = .5, e.strokeStyle = n.faint;
	for (let t = 1; t < 8; t++) e.beginPath(), e.moveTo(o(t / 8), 4), e.lineTo(o(t / 8), 4 + a), e.moveTo(4, 4 + t / 8 * a), e.lineTo(4 + i, 4 + t / 8 * a), e.stroke();
	e.lineWidth = 1, e.strokeStyle = n.fg, e.beginPath(), e.moveTo(4, s(.5)), e.lineTo(4 + i, s(.5)), e.stroke();
	let c = e.createLinearGradient(4, 0, 4 + i, 0);
	for (let e of $e(r.ring, r.channel)) c.addColorStop(e.at, e.css);
	e.fillStyle = c, e.fillRect(4, 4 + a, i, 14);
	let l = a + 14;
	if (r.pickerHue !== null) {
		let t = o(L(r.pickerHue));
		e.lineWidth = 1.5, e.strokeStyle = n.fg, e.beginPath(), e.moveTo(t, 4), e.lineTo(t, 4 + l), e.stroke();
	}
	if (r.cursor) {
		let t = o(L(r.cursor.hue));
		e.lineWidth = 2.5, e.strokeStyle = "rgba(0, 0, 0, 0.75)", e.beginPath(), e.moveTo(t, 4), e.lineTo(t, 4 + l), e.stroke(), e.lineWidth = 1.25, e.strokeStyle = r.cursor.outputCss, e.beginPath(), e.moveTo(t, 4), e.lineTo(t, 4 + l), e.stroke();
	}
	e.save(), e.beginPath(), e.rect(4, 4, i, a), e.clip(), e.lineWidth = 2, e.strokeStyle = n.fg, e.beginPath();
	for (let t = 0; t < 360; t++) {
		let n = t / 359, i = F(r.nodes, n);
		t === 0 ? e.moveTo(o(n), s(i)) : e.lineTo(o(n), s(i));
	}
	if (e.stroke(), r.nodes.forEach((t, i) => {
		e.lineWidth = 3, e.beginPath(), e.arc(o(t.x - Math.floor(t.x)), s(t.y), i === r.selected ? 5 : 4, 0, 2 * Math.PI), e.strokeStyle = n.fg, e.stroke(), e.fillStyle = n.bg, e.fill();
	}), r.cursor) {
		let t = L(r.cursor.hue), n = o(t), i = s(F(r.nodes, t));
		if (e.lineWidth = 1.25, e.strokeStyle = "rgba(0, 0, 0, 0.4)", e.beginPath(), e.arc(n, i, 11, 0, 2 * Math.PI), e.stroke(), Math.abs(r.cursor.offset) > 1e-4) {
			e.lineWidth = 2.25, e.strokeStyle = r.cursor.outputCss, e.beginPath();
			let t = 2 * Math.PI * Math.abs(r.cursor.offset);
			e.arc(n, i, 11, -Math.PI / 2, -Math.PI / 2 + (r.cursor.offset > 0 ? t : -t), r.cursor.offset < 0), e.stroke();
		}
		e.beginPath(), e.arc(n, i, 7, 0, 2 * Math.PI), e.fillStyle = r.cursor.outputCss, e.fill(), e.strokeStyle = "rgba(0, 0, 0, 0.9)", e.stroke(), e.beginPath(), e.arc(n, i, 4, 0, 2 * Math.PI), e.fillStyle = r.cursor.inputCss, e.fill(), e.strokeStyle = "rgba(255, 255, 255, 0.8)", e.stroke();
	}
	e.restore();
}
function Nt(e, t, n) {
	let r = I(e, F(t, L(n))), i = e === "hue" ? r / Math.PI : r - 1;
	return i < -1 ? -1 : i > 1 ? 1 : i;
}
function Pt({ ring: e, channel: t }) {
	let { useEffect: n, useRef: r, useState: i } = q().react, a = q().stores.useDevelopStore, o = a((e) => e.paramBag), s = Y()((e) => e.cursor), c = Y()((e) => e.picker), l = G(o).curves[e][t], [u, d] = i(Ot), [f, p] = i(-1), [m, h] = i(0), g = r(null), _ = r(null), v = r(null), y = Ke(u);
	n(() => {
		let e = g.current;
		if (!e) return;
		let t = new ResizeObserver((e) => {
			let t = Math.round(e[0].contentRect.width);
			t > 40 && d(t);
		});
		return t.observe(e), () => t.disconnect();
	}, []), n(() => {
		let e = new MutationObserver(() => h((e) => e + 1));
		return e.observe(document.documentElement, { attributes: !0 }), e.observe(document.body, { attributes: !0 }), () => e.disconnect();
	}, []), n(() => {
		let n = _.current;
		if (!n) return;
		let r = window.devicePixelRatio || 1;
		n.width = Math.round(y.width * r), n.height = Math.round(y.height * r);
		let i = n.getContext("2d");
		i && (i.setTransform(r, 0, 0, r, 0, 0), Mt(i, y, kt(n), {
			ring: e,
			channel: t,
			nodes: l,
			selected: f,
			pickerHue: c?.hue ?? null,
			cursor: s ? {
				hue: s.hue,
				inputCss: wt(s.inputRgb),
				outputCss: wt(s.outputRgb),
				offset: Nt(t, l, s.hue)
			} : null
		}));
	}, [
		o,
		e,
		t,
		f,
		u,
		s,
		c,
		m
	]);
	let b = () => G(a.getState().paramBag), x = (n) => {
		let r = b();
		a.getState().setDynParams(K({
			...r,
			curves: {
				...r.curves,
				[e]: {
					...r.curves[e],
					[t]: n
				}
			}
		}));
	}, S = (e) => void a.getState().commitEdit(`Colour Equaliser ${e}`), C = (e) => {
		let t = e.currentTarget.getBoundingClientRect();
		return {
			px: (e.clientX - t.left) * y.width / t.width,
			py: (e.clientY - t.top) * y.height / t.height
		};
	}, w = (n) => {
		if (n.button !== 0) return;
		let { px: r, py: i } = C(n), a = b().curves[e][t];
		if (n.ctrlKey || n.metaKey) {
			let { x: e } = qe(y, r, i), t = Ie(a, e, F(a, e));
			t && (x(t.nodes), p(t.index), S("add node"));
			return;
		}
		let o = Je(a, y, r, i);
		p(o), o >= 0 && (n.currentTarget.setPointerCapture(n.pointerId), v.current = {
			node: o,
			moved: !1
		});
	}, T = (n) => {
		let { px: r, py: i } = C(n), a = b().curves[e][t], o = v.current;
		if (o) {
			let { x: e, y: t } = qe(y, r, i), n = Le(a, o.node, e, t);
			if (n) {
				let e = n[o.node];
				o.node = P(n).findIndex((t) => t.x === e.x - Math.floor(e.x) && t.y === e.y), o.moved = !0, x(n), p(o.node);
			}
			return;
		}
		p(Je(a, y, r, i));
	}, E = () => {
		let e = v.current;
		v.current = null, e?.moved && S("curve");
	}, ee = (n) => {
		n.preventDefault();
		let r = b().curves[e][t], i = Re(r, f);
		i && (x(i), p(-1), S("remove node"));
	}, te = () => {
		x(Ae()), p(-1), S("reset curve");
	}, ne = {
		width: y.width,
		height: y.height,
		display: "block",
		touchAction: "none",
		borderRadius: 4,
		background: q().ui.tokens.surface0,
		cursor: "crosshair"
	};
	return J("div", {
		ref: g,
		style: { width: "100%" }
	}, J("canvas", {
		ref: _,
		style: ne,
		onPointerDown: w,
		onPointerMove: T,
		onPointerUp: E,
		onPointerLeave: () => {
			v.current || p(-1);
		},
		onContextMenu: ee,
		onDoubleClick: te
	}));
}
//#endregion
//#region src/Panel.ts
var Ft = {
	ring: "ring",
	channel: "channel"
}, It = [...R, "options"], Lt = {
	shadows: "Shadows",
	midtones: "Midtones",
	highlights: "Highlights",
	options: "Options"
}, Rt = {
	saturation: "Saturation",
	brightness: "Brightness",
	hue: "Hue"
}, zt = [
	"Tetrahedral",
	"Trilinear",
	"Pyramid"
], Bt = "Drag a node · Ctrl+click adds one · right-click removes it · double-click resets the curve · Adjust on image: scroll over the photo (Shift coarse, Alt fine), right-click adds a node there", Vt = {
	margin: 0,
	fontSize: 10,
	lineHeight: 1.4,
	color: "var(--color-text-muted)"
};
function Ht() {
	let e = q().settings.get(Ft.ring, "shadows");
	return It.includes(e) ? e : "shadows";
}
function Ut() {
	let e = q().settings.get(Ft.channel, "saturation");
	return M.includes(e) ? e : "saturation";
}
function Wt() {
	let { useEffect: e, useState: t } = q().react, { Slider: n } = q().components, { Button: r, Select: i, SegmentedControl: a, Row: o, Stack: s } = q().ui, c = q().stores.useDevelopStore, l = c((e) => e.paramBag), u = Y()((e) => e.mode), d = Y()((e) => e.picker), [f, p] = t(Ht), [m, h] = t(Ut);
	e(() => Dt(), []), e(() => () => Y().getState().setMode(null), []);
	let g = G(l), _ = () => G(c.getState().paramBag), v = (e) => c.getState().setDynParams(K(e)), y = (e) => void c.getState().commitEdit(`Colour Equaliser ${e}`), b = (e, t, r, i, a) => J(n, {
		key: t,
		label: e,
		value: g[t],
		min: r,
		max: i,
		step: a,
		defaultValue: V[t],
		onChange: (e) => v({
			..._(),
			[t]: e
		}),
		onCommit: () => y(e.toLowerCase())
	}), x = J(a, {
		key: "pages",
		value: f,
		size: "sm",
		options: It.map((e) => ({
			value: e,
			label: Lt[e]
		})),
		onChange: (e) => {
			p(e), q().settings.set(Ft.ring, e);
		}
	});
	if (f === "options") return J(s, {
		gap: 6,
		style: { padding: "6px 8px 8px" }
	}, x, J("div", {
		key: "options",
		style: {
			display: "flex",
			flexDirection: "column",
			gap: 1
		}
	}, b("White level", "whiteLevel", -2, 8, .01), b("Brightness smoothing", "sigmaL", 1, 100, 1), b("Saturation smoothing", "sigmaRho", .01, 2, .01), b("Hue smoothing", "sigmaTheta", .01, 6.28, .01), b("Neutral protection", "neutralProtection", 0, 2, .01)), J(o, {
		key: "interpolation",
		gap: 6
	}, J("span", { style: {
		fontSize: 11,
		color: "var(--color-text-secondary)",
		whiteSpace: "nowrap"
	} }, "Interpolation"), J("div", { style: {
		flex: "1 1 auto",
		minWidth: 0
	} }, J(i, {
		value: String(g.interpolation),
		ariaLabel: "Interpolation",
		options: et.map((e, t) => ({
			value: String(t),
			label: zt[t]
		})),
		onChange: (e) => {
			v({
				..._(),
				interpolation: Number(e)
			}), y("interpolation");
		}
	}))));
	let S = f, C = J(a, {
		key: "channels",
		value: m,
		size: "sm",
		options: M.map((e) => ({
			value: e,
			label: Rt[e]
		})),
		onChange: (e) => {
			h(e), q().settings.set(Ft.channel, e);
		}
	}), w = (e) => Y().getState().setMode(u === e ? null : e), T = J(o, {
		key: "tools",
		gap: 6
	}, J(r, {
		size: "sm",
		active: u === "pick",
		title: "Mark a colour from the image on the graphs (Esc cancels)",
		onClick: () => w("pick")
	}, "Pick"), J("span", { style: {
		flex: "1 1 auto",
		minWidth: 0,
		fontSize: 10,
		color: "var(--color-text-muted)",
		overflow: "hidden",
		textOverflow: "ellipsis",
		whiteSpace: "nowrap"
	} }, d ? Tt(d.brightness) : "No sample"), J(r, {
		size: "sm",
		active: u === "adjust",
		title: "Adjust the active curve from the image: hover to mark its hue, scroll to shape the curve there, right-click to add a node (Esc ends)",
		onClick: () => w("adjust")
	}, "Adjust on image"));
	return J(s, {
		gap: 6,
		style: { padding: "6px 8px 8px" }
	}, x, C, J(Pt, {
		key: `${S}/${m}`,
		ring: S,
		channel: m
	}), T, J("p", {
		key: "hint",
		style: Vt
	}, Bt));
}
//#endregion
//#region src/Overlay.ts
var Gt = 300, Kt = 14;
function qt(e, t, n, r, i) {
	if (!i || n.width <= 0 || n.height <= 0 || i.w <= 0 || i.h <= 0) return null;
	let a = r / n.width, o = ((e - n.left) * a - i.x) / i.w, s = ((t - n.top) * a - i.y) / i.h;
	return o < 0 || o > 1 || s < 0 || s > 1 ? null : {
		x: o,
		y: s
	};
}
function Jt() {
	let e = Ht();
	return {
		ring: e === "options" ? "midtones" : e,
		channel: Ut()
	};
}
function Yt(e, t, n, r) {
	return {
		...e,
		curves: {
			...e.curves,
			[t]: {
				...e.curves[t],
				[n]: r
			}
		}
	};
}
function Xt(e) {
	return e.shiftKey ? "coarse" : e.altKey ? "fine" : "normal";
}
function Zt(e) {
	let { input: t, output: n } = Y().getState().samples;
	if (!t) return null;
	let r = Ct(t, e.x, e.y);
	if (!r) return null;
	let i = (n && Ct(n, e.x, e.y)) ?? r, a = we(r);
	return Number.isFinite(a[0]) ? {
		hue: Ne(a[0]),
		brightness: a[2] < 0 ? 0 : a[2] > 1 ? 1 : a[2],
		inputRgb: r,
		outputRgb: i
	} : null;
}
function Qt() {
	let { useEffect: e, useRef: t, useState: n } = q().react, r = q().stores.useDevelopStore, i = r((e) => e.paramBag), a = Y()((e) => e.mode), o = Y()((e) => e.cursor), s = q().develop.useDevelopOverlay(), c = t(null), [l, u] = n(!1), d = t(null);
	e(() => {
		if (a === null) return;
		let e = /* @__PURE__ */ new Set(), t = () => u(e.has("Control") || e.has("Meta") || e.has(" ")), n = (n) => {
			if (n.key === "Escape") {
				Y().getState().setMode(null);
				return;
			}
			e.add(n.key), t();
		}, r = (n) => {
			e.delete(n.key), t();
		}, i = () => {
			e.clear(), t();
		};
		return window.addEventListener("keydown", n), window.addEventListener("keyup", r), window.addEventListener("blur", i), () => {
			window.removeEventListener("keydown", n), window.removeEventListener("keyup", r), window.removeEventListener("blur", i), u(!1);
		};
	}, [a]);
	let f = () => {
		d.current !== null && window.clearTimeout(d.current), d.current = window.setTimeout(() => {
			d.current = null, r.getState().commitEdit("Colour Equaliser scroll");
		}, Gt);
	};
	if (e(() => () => {
		d.current !== null && (window.clearTimeout(d.current), d.current = null, r.getState().commitEdit("Colour Equaliser scroll"));
	}, []), e(() => {
		let e = c.current;
		if (!e || a !== "adjust") return;
		let t = (e) => {
			if (e.ctrlKey || e.metaKey) return;
			let t = Y().getState().cursor;
			if (!t || e.deltaY === 0) return;
			e.preventDefault(), e.stopPropagation();
			let { ring: n, channel: i } = Jt(), a = G(r.getState().paramBag), o = Be(a.curves[n][i], i, L(t.hue), e.deltaY < 0 ? 1 : -1, Xt(e));
			r.getState().setDynParams(K(Yt(a, n, i, o))), f();
		};
		return e.addEventListener("wheel", t, { passive: !1 }), () => e.removeEventListener("wheel", t);
	}, [a]), a === null) return null;
	let p = (e, t) => {
		let n = c.current;
		if (!n) return null;
		let r = n.getBoundingClientRect(), i = r.width > 0 ? n.clientWidth / r.width : 1;
		return {
			local: {
				x: (e - r.left) * i,
				y: (t - r.top) * i
			},
			uv: qt(e, t, r, n.clientWidth, s.rect)
		};
	}, m = (e) => {
		if (a !== "adjust") return;
		let t = p(e.clientX, e.clientY), n = t?.uv && Zt(t.uv);
		Y().getState().setCursor(t && n ? {
			hue: n.hue,
			inputRgb: n.inputRgb,
			outputRgb: n.outputRgb,
			local: t.local
		} : null);
	}, h = (e) => {
		if (e.button !== 0 || a !== "pick") return;
		e.preventDefault();
		let t = p(e.clientX, e.clientY), n = t?.uv && Zt(t.uv);
		n && (Y().getState().setPicker({
			hue: n.hue,
			brightness: n.brightness
		}), Y().getState().setMode(null));
	}, g = (e) => {
		if (a !== "adjust") return;
		e.preventDefault();
		let t = Y().getState().cursor;
		if (!t) return;
		let { ring: n, channel: i } = Jt(), o = G(r.getState().paramBag), s = o.curves[n][i], c = L(t.hue), l = Ie(s, c, F(s, c));
		l && (r.getState().setDynParams(K(Yt(o, n, i, l.nodes))), r.getState().commitEdit("Colour Equaliser add node"));
	}, _ = {
		position: "absolute",
		inset: 0,
		pointerEvents: l ? "none" : "auto",
		cursor: a === "pick" ? q().cursors.resolve("pick") : o ? "none" : "crosshair"
	}, v = null;
	if (a === "adjust" && o) {
		let { ring: e, channel: t } = Jt();
		v = $t(o, Nt(t, G(i).curves[e][t], o.hue));
	}
	return J("div", {
		ref: c,
		style: _,
		onPointerMove: m,
		onPointerDown: h,
		onContextMenu: g,
		onPointerLeave: () => Y().getState().setCursor(null)
	}, v);
}
function $t(e, t) {
	let n = Kt, r = n * .55, i = n * 1.55, a = 26.7, o = 57.4, s = o / 2, c = wt(e.outputRgb), l = wt(e.inputRgb), u = 2 * Math.PI * Math.abs(t), d = -Math.PI / 2 + (t > 0 ? u : -u), f = Math.abs(t) > 1e-4 ? J("path", {
		key: "arc",
		d: `M ${s} 7 A ${i} ${i} 0 ${+(u > Math.PI)} ${+(t > 0)} ${s + i * Math.cos(d)} ${s + i * Math.sin(d)}`,
		fill: "none",
		stroke: c,
		strokeWidth: 3
	}) : null, p = (e, t, n, r, i) => J("line", {
		key: i,
		x1: s + e,
		y1: s + t,
		x2: s + n,
		y2: s + r,
		stroke: "rgba(255, 255, 255, 0.6)",
		strokeWidth: 1.25
	});
	return J("svg", {
		width: o,
		height: o,
		style: {
			position: "absolute",
			left: e.local.x - s,
			top: e.local.y - s,
			pointerEvents: "none",
			overflow: "visible"
		}
	}, J("circle", {
		key: "intensity",
		cx: s,
		cy: s,
		r: i,
		fill: "none",
		stroke: "rgba(0, 0, 0, 0.35)",
		strokeWidth: 1.5
	}), f, p(-26.7, 0, -17.5, 0, "l"), p(17.5, 0, a, 0, "r"), p(0, -26.7, 0, -17.5, "t"), p(0, 17.5, 0, a, "b"), J("circle", {
		key: "outer",
		cx: s,
		cy: s,
		r: n,
		fill: c,
		stroke: "rgba(0, 0, 0, 0.9)",
		strokeWidth: 1.25
	}), J("circle", {
		key: "inner",
		cx: s,
		cy: s,
		r,
		fill: l,
		stroke: "rgba(255, 255, 255, 0.8)",
		strokeWidth: 1.25
	}));
}
//#endregion
//#region src/glsl.ts
function en(e) {
	let t = e.toPrecision(10);
	if (!t.includes("e")) return t.includes(".") ? t : `${t}.0`;
	let [n, r] = t.split("e");
	return `${n.includes(".") ? n : `${n}.0`}e${r}`;
}
var Z = en, tn = (e) => `vec2(${e.map(Z).join(", ")})`, nn = (e) => `vec3(${e.map(Z).join(", ")})`, rn = (e) => `mat3(${[
	0,
	3,
	6,
	1,
	4,
	7,
	2,
	5,
	8
].map((t) => Z(e[t])).join(", ")})`, an = Z(Math.PI), Q = Z(2 * Math.PI), on = `
float ceYOfLStar(float L) {
  return pow(${Z(b)} * L / (${Z(v)} - L), ${Z(x)});
}
float ceSafeDiv(float d) { return d >= 0.0 ? max(${Z(ce)}, d) : min(-${Z(ce)}, d); }
float ceWrap2Pi(float h) { return h - ${Q} * floor(h / ${Q}); }
float ceWrapHuePi(float h) { return ceWrap2Pi(h + ${an}) - ${an}; }
float ceWrapPi(float x) { return x - ${Q} * floor((x + ${an}) / ${Q}); }
// (J, C, H radians) -> xyY D65; black stays black rather than 0/0.
vec3 ceJchToXyY(vec3 jch) {
  float L = jch.x * ${Z(A)};
  float M = L > 0.0
    ? pow(jch.y * ${Z(A)} / (${Z(S)} * pow(L, ${Z(C)})), ${Z(T)})
    : 0.0;
  vec2 p = M * vec2(cos(jch.z), sin(jch.z));
  vec2 uvs = vec2(${Z(k[0])} * p.x + ${Z(k[1])} * p.y,
                  ${Z(k[2])} * p.x + ${Z(k[3])} * p.y);
  vec2 uv = -${tn(O)} * uvs / (abs(uvs) - ${tn(D)});
  vec3 xyD = ${nn(ie)} * uv.x + ${nn(ae)} * uv.y + ${nn(oe)};
  return vec3(xyD.xy / ceSafeDiv(xyD.z), L > 0.0 ? ceYOfLStar(L) : 0.0);
}
vec3 ceXyYToXyz(vec3 xyY) {
  if (xyY.y == 0.0) return vec3(0.0);
  return vec3(xyY.z * xyY.x / xyY.y, xyY.z, xyY.z * (1.0 - xyY.x - xyY.y) / xyY.y);
}
// (H radians, S, B) -> XYZ D65 at the graph white.
vec3 ceHsbToXyz(vec3 hsb) {
  float C = hsb.y * hsb.z;
  return ceXyYToXyz(ceJchToXyY(vec3(hsb.z / (pow(C, ${Z(E)}) + 1.0), C, hsb.x)));
}
float ceHlgOetf1(float E) {
  if (E <= 0.0) return 0.0;
  if (E <= ${Z(1 / 12)}) return sqrt(3.0 * E);
  return ${Z(g.a)} * log(12.0 * E - ${Z(g.b)}) + ${Z(g.c)};
}
vec3 ceHlgOetf(vec3 E) { return vec3(ceHlgOetf1(E.x), ceHlgOetf1(E.y), ceHlgOetf1(E.z)); }
float ceHlgEotf1(float e) {
  if (e <= 0.0) return 0.0;
  if (e <= 0.5) return e * e / 3.0;
  return (exp((e - ${Z(g.c)}) / ${Z(g.a)}) + ${Z(g.b)}) / 12.0;
}
vec3 ceHlgEotf(vec3 e) { return vec3(ceHlgEotf1(e.x), ceHlgEotf1(e.y), ceHlgEotf1(e.z)); }
// XYZ D65 -> the table's code values: CAT16 to D50, the profile's matrix, HLG.
vec3 ceXyzToLutRgb(vec3 xyz) {
  const mat3 cat16 = ${rn(a)};
  const mat3 toRec2020 = ${rn(p)};
  return ceHlgOetf(toRec2020 * (cat16 * xyz));
}
vec3 ceHsbToLutRgb(vec3 hsb) { return ceXyzToLutRgb(ceHsbToXyz(hsb)); }
// The grey-cylindrical frame: (L along the diagonal, rho, theta).
vec3 ceGrayCyl(vec3 rgb) {
  float L = (rgb.r + rgb.g + rgb.b) * ${Z(.5773502691896258)};
  float u = (rgb.r - rgb.g) * ${Z(.7071067811865475)};
  float v = (rgb.r + rgb.g) * ${Z(.408248290463863)} + rgb.b * ${Z(-.816496580927726)};
  return vec3(L, sqrt(u * u + v * v), atan(v, u));
}
vec3 ceGrayToRgb(float L, float u, float v) {
  float grey = L * ${Z(.5773502691896258)};
  float du = u * ${Z(.7071067811865475)};
  float dv = v * ${Z(.408248290463863)};
  return vec3(grey + du + dv, grey - du + dv, grey + v * ${Z(-.816496580927726)});
}
float ceShellDistance(vec3 axis, vec3 dir) {
  float distance = 1.0e30;
  for (int c = 0; c < 3; c++) {
    if (abs(dir[c]) < 1e-6) continue;
    float bound = dir[c] > 0.0 ? 1.0 : 0.0;
    float candidate = (bound - axis[c]) / dir[c];
    if (candidate > 0.0 && candidate < distance) distance = candidate;
  }
  return distance >= 1.0e30 ? 0.0 : distance;
}
// Keep a colour inside the unit cube along the ray from a grey on the diagonal.
vec3 ceShell(vec3 axis, vec3 rgb) {
  vec3 v = rgb - axis;
  if (length(v) < 1e-6) return rgb;
  float s = ceShellDistance(axis, v);
  if (s < 1.0) rgb = axis + s * v;
  return clamp(rgb, 0.0, 1.0);
}
float ceWendland(float d) {
  if (d >= 1.0) return 0.0;
  float t = 1.0 - d;
  return t * t * t * t * (4.0 * d + 1.0);
}
`, sn = (e, t) => `float ${e}(int ring) { return ring == 0 ? ${Z(t[0])} : (ring == 1 ? ${Z(t[1])} : ${Z(t[2])}); }`, cn = `
${sn("ceRingBrightness", R.map((e) => z[e]))}
${sn("ceRefSat", R.map((e) => Ue[e]))}
${sn("ceAxisRgb", R.map((e) => We(z[e])))}
float ceCurveXToHue(float x) { return ceWrapHuePi((360.0 * x + ${Z(20)}) * ${an} / 180.0); }
// Channel 2 (hue) reads a shift in radians; 0 and 1 (saturation, brightness) a gain in [0, 2].
float ceChannelValue(int channel, float y) {
  return channel == 2 ? (y - 0.5) * ${Q} : clamp(y * 2.0, 0.0, 2.0);
}
`, ln = R.flatMap((e) => M.map((t) => `${e}${ot[t]}`)), un = (e) => `vec4[10](${Array.from({ length: 10 }, (t, n) => `${e}${n}`).join(", ")})`, dn = ln.map((e, t) => `${t === 0 ? "if" : "else if"} (curve == ${t}) { n = ${un(e)}; count = ${e}Count; }`).join("\n  "), fn = `
// Node k of a curve packed two per vec4.
vec2 ceNode(vec4 n[10], int k) {
  vec4 c = n[k / 2];
  return (k - 2 * (k / 2)) == 0 ? c.xy : c.zw;
}
// Ansel's periodic monotone Hermite spline (period 1) over sorted nodes.
float ceHermite(vec4 n[10], int count, float x) {
  float px[20];
  float py[20];
  float D[20];
  float dy[20];
  for (int k = 0; k < 20; k++) {
    if (k >= count) break;
    vec2 p = ceNode(n, k);
    px[k] = p.x;
    py[k] = p.y;
  }
  for (int k = 0; k < 20; k++) {
    if (k >= count - 1) break;
    D[k] = (py[k + 1] - py[k]) / (px[k + 1] - px[k]);
  }
  D[count - 1] = (py[0] - py[count - 1]) / (px[0] - px[count - 1] + 1.0);
  dy[0] = D[count - 1] * D[0] <= 0.0 ? 0.0 : (D[count - 1] + D[0]) * 0.5;
  for (int k = 1; k < 20; k++) {
    if (k >= count) break;
    dy[k] = D[k - 1] * D[k] <= 0.0 ? 0.0 : (D[k - 1] + D[k]) * 0.5;
  }
  for (int k = 0; k < 20; k++) {
    if (k >= count) break;
    int k1 = k + 1 < count ? k + 1 : 0;
    if (abs(D[k]) < ${Z(se)}) {
      dy[k] = 0.0;
      dy[k1] = 0.0;
    } else {
      float a = dy[k] / D[k];
      float b = dy[k1] / D[k];
      float tau = a * a + b * b;
      if (tau > 9.0) {
        dy[k] = 3.0 * a * D[k] / sqrt(tau);
        dy[k1] = 3.0 * b * D[k] / sqrt(tau);
      }
    }
  }
  float t = x - floor(x);
  if (t < px[0]) t += 1.0;
  int n0 = count - 1;
  for (int k = 0; k < 20; k++) {
    if (k >= count) break;
    if (px[k] > t) { n0 = k - 1; break; }
  }
  int n1 = n0 + 1 < count ? n0 + 1 : 0;
  float h = n1 > n0 ? px[n1] - px[n0] : px[n1] - (px[n0] - 1.0);
  float u = (t - px[n0]) / h;
  float u2 = u * u;
  float u3 = u2 * u;
  float h10 = u3 - 2.0 * u2 + u;
  float h01 = -2.0 * u3 + 3.0 * u2;
  float h11 = u3 - u2;
  return py[n0] + (py[n1] - py[n0]) * h01 + h * (dy[n0] * h10 + dy[n1] * h11);
}
// Curve ring * 3 + channel (rings shadows, midtones, highlights; channels
// saturation, brightness, hue) sampled at x; 0.5 below two nodes.
float ceSample(int curve, float x) {
  vec4 n[10];
  int count = 0;
  ${dn}
  return count < 2 ? 0.5 : ceHermite(n, count, x);
}
`, pn = `
// The largest level <= 64 whose cube fits the target's texels, never below 2.
int ceLutLevel(int texels) {
  int l = min(64, int(floor(pow(float(texels), 1.0 / 3.0))) + 1);
  for (int k = 0; k < 3; k++) {
    if (l * l * l > texels) l--;
  }
  return max(2, l);
}
vec3 ceTexel(sampler2D lut, int w, int i) { return texelFetch(lut, ivec2(i - w * (i / w), i / w), 0).rgb; }
bool ceMarked(sampler2D lut, int w, int level) {
  return all(equal(ceTexel(lut, w, level * level * level), vec3(${Z(-1)}, ${Z(.5)}, ${Z(-1)})));
}
// lut3d.c over the displacement table: n in [0, 1]^3, the eight corners read
// once, then tetrahedral (mode 0), trilinear (1) or pyramid (2).
vec3 ceInterp(sampler2D lut, int w, int level, vec3 n, int mode) {
  vec3 scaled = n * float(level - 1);
  ivec3 idx = clamp(ivec3(scaled), ivec3(0), ivec3(level - 2));
  vec3 f = scaled - vec3(idx);
  int level2 = level * level;
  int color = idx.x + idx.y * level + idx.z * level2;
  vec3 c000 = ceTexel(lut, w, color);
  vec3 c100 = ceTexel(lut, w, color + 1);
  vec3 c010 = ceTexel(lut, w, color + level);
  vec3 c110 = ceTexel(lut, w, color + level + 1);
  vec3 c001 = ceTexel(lut, w, color + level2);
  vec3 c101 = ceTexel(lut, w, color + level2 + 1);
  vec3 c011 = ceTexel(lut, w, color + level + level2);
  vec3 c111 = ceTexel(lut, w, color + level + level2 + 1);
  float r = f.x;
  float g = f.y;
  float b = f.z;
  if (mode == 1) {
    vec3 x00 = mix(c000, c100, r);
    vec3 x10 = mix(c010, c110, r);
    vec3 x01 = mix(c001, c101, r);
    vec3 x11 = mix(c011, c111, r);
    return mix(mix(x00, x10, g), mix(x01, x11, g), b);
  }
  if (mode == 2) {
    if (g > r && b > r) return c000 + (c111 - c011) * r + (c010 - c000) * g + (c001 - c000) * b + (c011 - c001 - c010 + c000) * g * b;
    if (r > g && b > g) return c000 + (c100 - c000) * r + (c111 - c101) * g + (c001 - c000) * b + (c101 - c001 - c100 + c000) * r * b;
    return c000 + (c100 - c000) * r + (c010 - c000) * g + (c111 - c110) * b + (c110 - c100 - c010 + c000) * r * g;
  }
  if (r > g) {
    if (g > b) return (1.0 - r) * c000 + (r - g) * c100 + (g - b) * c110 + b * c111;
    if (r > b) return (1.0 - r) * c000 + (r - b) * c100 + (b - g) * c101 + g * c111;
    return (1.0 - b) * c000 + (b - r) * c001 + (r - g) * c101 + g * c111;
  }
  if (b > g) return (1.0 - b) * c000 + (b - g) * c001 + (g - r) * c011 + r * c111;
  if (b > r) return (1.0 - g) * c000 + (g - b) * c010 + (b - r) * c011 + r * c111;
  return (1.0 - g) * c000 + (g - r) * c010 + (r - b) * c110 + b * c111;
}
`, mn = `
{
  int w = int(1.0 / uTexel.x + 0.5);
  ivec2 px = ivec2(vUv / uTexel);
  int i = px.y * w + px.x;
  if (i >= 384) {
    c = vec3(0.0);
  } else {
    int a = i / 2;
    int ring = a / 64;
    int hs = a - ring * 64;
    float x = float(hs) / ${Z(64)};
    float hue = ceCurveXToHue(x);
    float shift = ceChannelValue(2, ceSample(ring * 3 + 2, x));
    float sat = ceChannelValue(0, ceSample(ring * 3 + 0, x));
    float bri = ceChannelValue(1, ceSample(ring * 3 + 1, x));
    float S = ceRefSat(ring);
    float B = ceRingBrightness(ring);
    vec3 axis = vec3(ceAxisRgb(ring));
    vec3 before = ceShell(axis, ceHsbToLutRgb(vec3(hue, S, B)));
    vec3 after = ceShell(axis, ceHsbToLutRgb(vec3(ceWrapHuePi(hue + shift), clamp(S * sat, 0.0, 1.0), clamp(B * bri, 0.0, 1.0))));
    vec3 p = ceGrayCyl(before);
    vec3 q = ceGrayCyl(after);
    float projected = p.y > 1e-6 ? q.y / p.y : 1.0;
    float scale = sat <= 1.0 ? sat : min(sat, projected);
    c = (i - 2 * a) == 0 ? p : vec3(q.x - p.x, scale, ceWrapPi(shift));
  }
}
`, hn = `
{
  int w = int(1.0 / uTexel.x + 0.5);
  int hgt = int(1.0 / uTexel.y + 0.5);
  int level = ceLutLevel(w * hgt);
  int n3 = level * level * level;
  ivec2 px = ivec2(vUv / uTexel);
  int i = px.y * w + px.x;
  if (i == n3) {
    c = vec3(${Z(-1)}, ${Z(.5)}, ${Z(-1)});
  } else if (i > n3) {
    c = vec3(0.0);
  } else {
    int r = i - level * (i / level);
    int g = (i / level) - level * (i / (level * level));
    int b = i / (level * level);
    vec3 x = vec3(r, g, b) / float(level - 1);
    vec3 cyl = ceGrayCyl(x);
    vec3 d = vec3(0.0);
    if (cyl.y > 1e-6) {
      float sigmaRhoSafe = max(sigmaRho, 1e-6);
      float invL = 1.0 / max(sigmaL * 0.01, 1e-6);
      float invR = 1.0 / sigmaRhoSafe;
      float invT = 1.0 / max(sigmaTheta, 1e-6);
      float rho0 = max(neutralProtection, 0.0) * sigmaRhoSafe;
      float sw = 0.0;
      float sdL = 0.0;
      float ssc = 0.0;
      float sdt = 0.0;
      for (int a = 0; a < 192; a++) {
        int t0 = 2 * a;
        vec3 anc = readPrev((vec2(t0 - w * (t0 / w), t0 / w) + 0.5) * uTexel);
        float dL = (cyl.x - anc.x) * invL;
        float dr = (cyl.y - anc.y) * invR;
        float dh = ceWrapPi(cyl.z - anc.z) * invT;
        float d2 = dL * dL + dr * dr + dh * dh;
        if (d2 >= 1.0) continue;
        int t1 = t0 + 1;
        vec3 del = readPrev((vec2(t1 - w * (t1 / w), t1 / w) + 0.5) * uTexel);
        float wgt = ceWendland(sqrt(d2));
        sw += wgt;
        sdL += wgt * del.x;
        ssc += wgt * del.y;
        sdt += wgt * del.z;
      }
      for (int s = 0; s < 64; s++) {
        float dL = (cyl.x - float(s) / ${Z(63)} * ${Z(Math.sqrt(3))}) * invL;
        float dr = cyl.y * invR;
        float dh = ceWrapPi(cyl.z) * invT;
        float d2 = dL * dL + dr * dr + dh * dh;
        if (d2 >= 1.0) continue;
        float wgt = ceWendland(sqrt(d2)) / ${Z(64)};
        sw += wgt;
        ssc += wgt;
      }
      if (sw > ${Z(ce)}) {
        float tdL = sdL / sw;
        float sc = ssc / sw;
        float tdt = sdt / sw;
        if (!(abs(tdL) <= 1e-6 && abs(sc - 1.0) <= 1e-6 && abs(tdt) <= 1e-6)) {
          float t = rho0 > 0.0 ? clamp(cyl.y / rho0, 0.0, 1.0) : 1.0;
          float alpha = t * t * (3.0 - 2.0 * t);
          float L = cyl.x + alpha * tdL;
          float rho = cyl.y * max(1.0 + alpha * (sc - 1.0), 0.0);
          float th = cyl.z + alpha * tdt;
          vec3 target = ceShell(vec3(L * ${Z(.5773502691896258)}), ceGrayToRgb(L, rho * cos(th), rho * sin(th)));
          d = target - x;
        }
      }
    }
    c = clamp(x + d, 0.0, 1.0) - x;
  }
}
`;
function gn(e) {
	return `
{
  if (on > 0.5) {
    ivec2 sz = textureSize(${e}, 0);
    int level = ceLutLevel(sz.x * sz.y);
    if (ceMarked(${e}, sz.x, level)) {
      const mat3 toRec2020 = ${rn(m)};
      const mat3 toSrgb = ${rn(h)};
      float white = exp2(whiteLevel);
      vec3 e = ceHlgOetf(toRec2020 * (lin / white));
      vec3 n = clamp(e, 0.0, 1.0);
      lin = white * (toSrgb * ceHlgEotf(n + ceInterp(${e}, sz.x, level, n, interpolation) + (e - n)));
    }
  }
}
`;
}
function _n(e) {
	return `u_${it(e)}_stageResult`;
}
function vn() {
	let e = [], { chunks: t } = ut(Ae());
	for (let n of R) for (let r of M) {
		let i = `${n}${ot[r]}`;
		for (let n = 0; n < 10; n++) e.push({
			key: `${i}${n}`,
			glslType: "vec4",
			default: [...t[n]]
		});
		e.push({
			key: `${i}Count`,
			glslType: "int",
			default: 8
		});
	}
	return e;
}
function yn() {
	return {
		glsl: mn,
		helpers: `${on}\n${cn}\n${fn}`,
		iterations: 1,
		uniforms: vn()
	};
}
var $ = V;
function bn() {
	return {
		glsl: hn,
		helpers: `${on}\n${pn}`,
		iterations: 1,
		uniforms: [
			{
				key: "sigmaL",
				glslType: "float",
				default: $.sigmaL,
				range: {
					min: 1,
					max: 100,
					step: 1
				},
				label: "brightness smoothing"
			},
			{
				key: "sigmaRho",
				glslType: "float",
				default: $.sigmaRho,
				range: {
					min: .01,
					max: 2,
					step: .01
				},
				label: "saturation smoothing"
			},
			{
				key: "sigmaTheta",
				glslType: "float",
				default: $.sigmaTheta,
				range: {
					min: .01,
					max: 6.28318531,
					step: .01
				},
				label: "hue smoothing"
			},
			{
				key: "neutralProtection",
				glslType: "float",
				default: $.neutralProtection,
				range: {
					min: 0,
					max: 2,
					step: .01
				},
				label: "neutral protection"
			}
		]
	};
}
function xn() {
	return {
		id: H,
		name: "Colour Equaliser",
		phase: "scene-linear",
		priority: 85,
		glsl: gn(_n(H)),
		helpers: `${on}\n${pn}`,
		uniforms: [
			{
				key: "whiteLevel",
				glslType: "float",
				default: $.whiteLevel,
				range: {
					min: -2,
					max: 8,
					step: .01
				},
				label: "white level"
			},
			{
				key: "interpolation",
				glslType: "int",
				default: $.interpolation,
				range: {
					min: 0,
					max: 2,
					step: 1
				},
				label: "interpolation"
			},
			{
				key: "on",
				glslType: "float",
				default: 0
			}
		],
		passes: [yn(), bn()],
		presetScope: "global"
	};
}
function Sn() {
	return [xn()];
}
//#endregion
//#region src/index.ts
var Cn = `${rt}.panel`, wn = `${rt}.overlay`, Tn = null;
function En() {
	let e = q().stores.useDevelopStore.getState();
	e.setDynParams(ht()), e.commitEdit("Colour Equaliser reset");
}
function Dn(e) {
	vt(e), bt();
	for (let t of Sn()) e.registerProcessingStage(t);
	e.registerPanel({
		id: Cn,
		title: "Colour Equaliser",
		component: Wt,
		defaultDock: {
			module: "develop",
			direction: "right",
			order: 7,
			width: 268
		},
		onReset: En
	}), e.registerSlot({
		id: wn,
		slot: "develop-canvas-overlay",
		component: Qt,
		order: 60
	}), Tn = e.stores.useDevelopStore.subscribe((e, t) => {
		if (e.paramBag === t.paramBag) return;
		let n = gt(e.paramBag);
		n && e.setDynParams(n);
	});
}
function On() {
	Tn?.(), Tn = null;
	try {
		Y().getState().setMode(null);
		let e = q();
		for (let t of Sn()) e.unregisterProcessingStage(t.id);
		e.unregisterSlot(wn);
	} catch {}
}
//#endregion
export { Dn as activate, On as deactivate };

//# sourceMappingURL=index.js.map