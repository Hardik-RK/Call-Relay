# Android app design notes

The app's look follows the layered, cool-neutral language of the author's other web work, rebuilt natively in Compose. Nothing is copied from those projects: only the idea (quiet base, one step up for panels, hairline borders instead of shadows, one desaturated blue accent, mono numerals) and the colour values.

## Where things live

| File | What it holds |
|---|---|
| `ui/Theme.kt` | Colour tokens (light and dark, follows the system), radii (10 / 12 / 14 dp), the type scale, fonts, the Material theme mapping |
| `ui/Components.kt` | `Panel`, `SectionHeader`, `PrimaryButton`, `SecondaryButton`, `StatusPill`, `SegmentedControl`, `ChoiceChip`, `KeypadKey`, `LedNumber`, `EmptyPanel`, `QdToastHost`, `FieldFrame` |
| `ui/Screens.kt` | Stateless `PairScreen`, `HomeScreen`, `ConfirmCallDialog`, plus `@Preview` functions in light and dark |
| `MainActivity.kt` | Holds state and behaviour (permissions, dialer, pairing) and feeds the screens |

## Colours

Source tokens are OKLCH. `android/tools/oklch-to-srgb.js` converts them to sRGB once (`node android/tools/oklch-to-srgb.js`), and the hex values are pasted into `Theme.kt`. Translucent hairlines (`line`, `lineStrong`, `accentSoft`) keep their alpha.

Contrast choices: body text uses `fg` or `muted` only (both above 4.5:1 on `panel` and `base` in both schemes). `faint` is used for disabled and decorative things, never for information. The green call key uses a darker green in light mode (white label, about 5.6:1) and a light green with a dark label in dark mode. Colour is never the only signal: pills and helper lines say the state in words.

## Fonts

Inter Tight (variable) and JetBrains Mono (regular, bold), both SIL OFL 1.1, are bundled in `res/font`. Licence texts are in `android/FONT-LICENSES.md`. The web UI's dot-matrix numeral face is not bundled (only a woff2 copy exists, which Android cannot load), so the dial display uses bold JetBrains Mono.

## Accessibility

Touch targets are 48 dp or more (chips are a 36 dp pill inside a 48 dp hit area). Keys, chips and the segmented control carry descriptions and roles. The number display speaks its digits one by one. Status and validation lines are live regions. The layout respects system insets (edge to edge) and scrolls.
