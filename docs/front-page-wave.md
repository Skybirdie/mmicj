# SkyMedia Front Page — CSS Wave Prototype

This document explains the current lower-wave experiment so the geometry can be tuned without replacing it with an image asset.

## Files involved

### `css/front-page.css`
This is the main file for the visual geometry.

It controls:

- the full-screen Front Page stage (`#frontPage` / `#frontStage`)
- the centerpiece (`.front-door-center`)
- the three lower wave doors (`.front-wave .front-door`)
- the 15px spacing between the three doors
- responsive sizing
- the clipped shape of each door

### `js/frontPage.js`
This creates the actual clickable door elements and assigns the category/item data to them. It does **not** draw the wave.

The relevant function is `createDoor()`. It creates a `<button>` and gives it the `data-front-position` value used by CSS:

- `bottom-left`
- `bottom-middle`
- `bottom-right`

Therefore the CSS can change the geometry without changing the content-selection code.

### `index.html`
This supplies the structural containers:

```html
<section id="frontPage">
    <img id="frontBackground" ...>
    <div id="frontStage"></div>
    <div id="frontWave"></div>
    <nav id="frontNavigation"></nav>
</section>
```

The stylesheet is loaded with:

```html
<link rel="stylesheet" href="css/front-page.css">
```

## How the wave was constructed

### 1. The wave is only 20% of the viewport height

```css
.front-wave {
    position:absolute;
    left:0;
    right:0;
    bottom:0;
    height:min(20dvh, 220px);
}
```

`20dvh` means 20% of the dynamic viewport height. The 220px limit prevents the wave from becoming excessively tall on very large screens.

### 2. The wave is divided into three equal doors

```css
display:grid;
grid-template-columns:repeat(3, minmax(0,1fr));
gap:15px;
```

Each door gets one third of the available width, with exactly 15px between them.

### 3. Instead of many polygon points, the wave uses cubic Bezier curves

The preferred CSS syntax is:

```css
clip-path:shape(
    from ...,
    curve to ... with ...,
    curve to ... with ...,
    line to ...,
    line to ...,
    close
);
```

A cubic curve has only:

- a starting point
- an ending point
- two control points

This is why the result is much smoother than a polygon containing many sampled points.

### 4. The three doors are sections of one mathematical wave

The wave was defined first in global coordinates using seven knots:

| Global X | Global Y |
|---:|---:|
| 0% | 15% |
| 16.667% | 10% |
| 33.333% | 30% |
| 50% | 20% |
| 66.667% | 45% |
| 83.333% | 35% |
| 100% | 60% |

For Y, a larger number means farther down the screen.

So the wave starts relatively high, rises slightly, dips, rises again, dips farther, rises again, and finally ends lower on the right.

### 5. The seven knots become six cubic segments

There are two cubic segments inside each door:

```text
LEFT       MIDDLE       RIGHT
  P1 ─ P2     P3 ─ P4     P5 ─ P6
     \            \            \
      \            \            \
       P2──────────P3──────────P4 ...
```

More precisely, each third has local X coordinates of:

```text
0% → 50% → 100%
```

The first 50% is the first global curve; the second 50% is the second global curve.

### 6. Control points were generated from neighboring knots

The control points use a Catmull-Rom-style tangent construction. The purpose is not merely to make each curve individually smooth; it is to make the tangent entering a knot agree with the tangent leaving it.

That gives **C1 continuity** at the internal joins.

For example, the first two global curves use approximately:

```text
Curve 1
start:  0%, 15%
control: 8.333%, 14.167%
control: 38.889%, 7.5%
end:    50%, 10%

Curve 2
start:  50%, 10%
control: 61.111%, 12.5%
control: 88.889%, 28.333%
end:    100%, 30%
```

The next door starts from that same global `100%, 30%` point conceptually, then continues with the next two curves.

The physical 15px gap means the curves do not literally touch, but their mathematical endpoints and slopes still correspond.

## How to tweak the wave

The easiest values to change are the Y values in the comments at the top of the waveform section in `front-page.css`:

```text
x:    0    1/6   1/3   1/2   2/3   5/6   1
y:   15     10    30     20    45    35   60
```

Think of them as the height of the top edge at seven positions across the entire screen.

- Smaller Y = higher
- Larger Y = lower

For example:

```text
15  10  30  20  45  35  60
```

is relatively energetic.

A calmer wave could use something like:

```text
18  13  28  22  40  36  52
```

The actual Bezier control points would then need to be recalculated to preserve the smooth tangent relationship. That recalculation is preferable to manually adding lots of points.

## Centerpiece

The centerpiece is no longer tied to the background artwork's aspect ratio.

It is centered against the actual viewport:

```css
left:50%;
top:50%;
transform:translate(-50%,-50%);
```

Its target size is:

```css
width:min(75dvh, 82vw);
height:min(75dvh, 82vw);
aspect-ratio:1 / 1;
```

So on a normal landscape screen it is approximately 75% of screen height and perfectly square.

On an unusually narrow portrait screen, the viewport width becomes the physical limit. That prevents the square from being wider than the screen while keeping it as close as possible to the requested 75% height.

Its corners are controlled here:

```css
border-radius:clamp(28px, 8%, 110px);
```

If you want a more circular/soft square, increase the percentage or the maximum. If you want a squarer appearance, reduce them.

## Important architectural point

The wave geometry is independent of the content-selection logic.

The Front Page JavaScript decides **what** each door represents. CSS decides **what shape** that door has.

That means we can continue experimenting with:

- wave height
- wave depth
- number of curves
- left/right slope
- corner softness
- gaps
- centerpiece size

without rewriting the category/date-selection system.
