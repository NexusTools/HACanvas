/**
 * Evaluates a cubic-Bezier timing curve $B(s) = (B_x(s), B_y(s))$ with $P_0=(0,0)$, $P_1=(x_1,y_1)$,
 * $P_2=(x_2,y_2)$, $P_3=(1,1)$ at normalized time $t \in [0, 1]$.
 * Supports overshoot ($y_1, y_2 \notin [0, 1]$).
 */
export function evaluateCubicBezierEasing(
    t: number,
    cp: [number, number, number, number]
): number {
    if (t <= 0) return 0;
    if (t >= 1) return 1;
    const x1 = Math.max(0, Math.min(1, cp[0]));
    const y1 = cp[1];
    const x2 = Math.max(0, Math.min(1, cp[2]));
    const y2 = cp[3];
    if (Math.abs(x1 - y1) < 1e-5 && Math.abs(x2 - y2) < 1e-5) {
        return t;
    }

    const sampleX = (s: number): number => {
        const inv = 1 - s;
        return 3 * inv * inv * s * x1 + 3 * inv * s * s * x2 + s * s * s;
    };
    const sampleDerivX = (s: number): number => {
        const inv = 1 - s;
        return 3 * inv * inv * x1 + 6 * inv * s * (x2 - x1) + 3 * s * s * (1 - x2);
    };
    const sampleY = (s: number): number => {
        const inv = 1 - s;
        return 3 * inv * inv * s * y1 + 3 * inv * s * s * y2 + s * s * s;
    };

    // Newton-Raphson with bisection fallback
    let s = t;
    for (let i = 0; i < 8; i++) {
        const err = sampleX(s) - t;
        if (Math.abs(err) < 1e-6) break;
        const d = sampleDerivX(s);
        if (Math.abs(d) < 1e-6) break;
        s -= err / d;
        if (s < 0 || s > 1) break;
    }
    if (s < 0 || s > 1 || Math.abs(sampleX(s) - t) > 1e-4) {
        let lo = 0;
        let hi = 1;
        s = t;
        for (let i = 0; i < 14; i++) {
            const mid = (lo + hi) * 0.5;
            const xMid = sampleX(mid);
            if (Math.abs(xMid - t) < 1e-6) {
                s = mid;
                break;
            }
            if (t > xMid) lo = mid;
            else hi = mid;
            s = mid;
        }
    }
    return sampleY(Math.max(0, Math.min(1, s)));
}

