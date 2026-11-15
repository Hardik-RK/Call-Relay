package dev.quickdial.ui

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Shapes
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.ReadOnlyComposable
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontVariation
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import dev.quickdial.R

/*
 * Design tokens for the app. The palette follows the same layered, cool-neutral language as the
 * author's web projects: a quiet base, panels that sit one step above it, hairline borders instead
 * of shadows, and a single desaturated blue accent. The source tokens are OKLCH; the values here
 * were converted to sRGB once with a small script (see docs/ANDROID-DESIGN.md) so nothing is
 * computed at runtime.
 */
@Immutable
class QdColors(
    val dark: Boolean,
    val base: Color,
    val panel: Color,
    val inset: Color,
    val raised: Color,
    val fg: Color,
    val muted: Color,
    val faint: Color,
    val line: Color,
    val lineStrong: Color,
    val primary: Color,
    val primaryPress: Color,
    val onPrimary: Color,
    val accentText: Color,
    val accentSoft: Color,
    val success: Color,
    val successText: Color,
    val call: Color,
    val onCall: Color,
    val warning: Color,
    val warningText: Color,
    val danger: Color,
    val dangerText: Color,
    val hover: Color,
    val ledOff: Color,
)

val LightQdColors = QdColors(
    dark = false,
    base = Color(0xFFF1F2F4), panel = Color(0xFFFEFEFF), inset = Color(0xFFF3F4F6), raised = Color(0xFFFEFEFF),
    fg = Color(0xFF111418), muted = Color(0xFF53555A), faint = Color(0xFF7E8084),
    line = Color(0x171F2227), lineStrong = Color(0x291F2227),
    primary = Color(0xFF0D6ABB), primaryPress = Color(0xFF005BAB), onPrimary = Color(0xFFFAFCFE),
    accentText = Color(0xFF0061B2), accentSoft = Color(0x140D6ABB),
    success = Color(0xFF008B4E), successText = Color(0xFF005E31),
    call = Color(0xFF007A42), onCall = Color(0xFFFFFFFF),
    warning = Color(0xFFE69825), warningText = Color(0xFF934F00),
    danger = Color(0xFFB71824), dangerText = Color(0xFFA50D1C),
    hover = Color(0x0B1F2227), ledOff = Color(0x21292E36),
)

val DarkQdColors = QdColors(
    dark = true,
    base = Color(0xFF0A0B0D), panel = Color(0xFF101113), inset = Color(0xFF08080A), raised = Color(0xFF19191B),
    fg = Color(0xFFEBEBEB), muted = Color(0xFFA0A1A4), faint = Color(0xFF737477),
    line = Color(0x11FFFFFF), lineStrong = Color(0x1CFFFFFF),
    primary = Color(0xFF3471B2), primaryPress = Color(0xFF4380C2), onPrimary = Color(0xFFFCFCFC),
    accentText = Color(0xFF8BBCEF), accentSoft = Color(0x1A8BBCEF),
    success = Color(0xFF60BB83), successText = Color(0xFF88D1A2),
    call = Color(0xFF60BB83), onCall = Color(0xFF04210F),
    warning = Color(0xFFE8B45E), warningText = Color(0xFFF0C781),
    danger = Color(0xFFF66D67), dangerText = Color(0xFFFF958D),
    hover = Color(0x09FFFFFF), ledOff = Color(0x14FFFFFF),
)

object QdRadius {
    val control = 10.dp
    val panel = 12.dp
    val sheet = 14.dp
}

@OptIn(androidx.compose.ui.text.ExperimentalTextApi::class)
private val InterTight = FontFamily(
    listOf(400, 500, 600, 700).map { w ->
        Font(
            R.font.inter_tight, FontWeight(w),
            variationSettings = FontVariation.Settings(FontVariation.weight(w)),
        )
    },
)

val QdMono = FontFamily(
    Font(R.font.jetbrains_mono_regular, FontWeight.Normal),
    Font(R.font.jetbrains_mono_bold, FontWeight.Bold),
)

/** Tight type scale, mirroring the web UI: 12 / 13 / 14 / 16 / 20 / 24 with Inter Tight, mono for numerals. */
@Immutable
class QdType(
    val caption: TextStyle,
    val label: TextStyle,
    val body: TextStyle,
    val bodyStrong: TextStyle,
    val title: TextStyle,
    val headline: TextStyle,
    val mono: TextStyle,
    val monoSmall: TextStyle,
    val led: TextStyle,
    val ledBig: TextStyle,
)

private val QdTypeDefault = QdType(
    caption = TextStyle(fontFamily = InterTight, fontWeight = FontWeight.Medium, fontSize = 12.sp, lineHeight = 16.sp, letterSpacing = 0.3.sp),
    label = TextStyle(fontFamily = InterTight, fontWeight = FontWeight.Medium, fontSize = 13.sp, lineHeight = 18.sp),
    body = TextStyle(fontFamily = InterTight, fontWeight = FontWeight.Normal, fontSize = 14.sp, lineHeight = 20.sp),
    bodyStrong = TextStyle(fontFamily = InterTight, fontWeight = FontWeight.SemiBold, fontSize = 14.sp, lineHeight = 20.sp),
    title = TextStyle(fontFamily = InterTight, fontWeight = FontWeight.SemiBold, fontSize = 16.sp, lineHeight = 22.sp),
    headline = TextStyle(fontFamily = InterTight, fontWeight = FontWeight.SemiBold, fontSize = 22.sp, lineHeight = 28.sp, letterSpacing = (-0.2).sp),
    mono = TextStyle(fontFamily = QdMono, fontWeight = FontWeight.Normal, fontSize = 14.sp, lineHeight = 20.sp),
    monoSmall = TextStyle(fontFamily = QdMono, fontWeight = FontWeight.Normal, fontSize = 12.sp, lineHeight = 16.sp),
    led = TextStyle(fontFamily = QdMono, fontWeight = FontWeight.Bold, fontSize = 30.sp, lineHeight = 38.sp, letterSpacing = 1.sp),
    ledBig = TextStyle(fontFamily = QdMono, fontWeight = FontWeight.Bold, fontSize = 34.sp, lineHeight = 44.sp, letterSpacing = 1.sp),
)

private val LocalQdColors = staticCompositionLocalOf { LightQdColors }
private val LocalQdType = staticCompositionLocalOf { QdTypeDefault }

object Qd {
    val colors: QdColors
        @Composable @ReadOnlyComposable get() = LocalQdColors.current
    val type: QdType
        @Composable @ReadOnlyComposable get() = LocalQdType.current
}

@Composable
fun QuickDialTheme(dark: Boolean = isSystemInDarkTheme(), content: @Composable () -> Unit) {
    val c = if (dark) DarkQdColors else LightQdColors
    val scheme = if (dark) {
        darkColorScheme(
            primary = c.primary, onPrimary = c.onPrimary, background = c.base, onBackground = c.fg,
            surface = c.panel, onSurface = c.fg, surfaceVariant = c.inset, onSurfaceVariant = c.muted,
            outline = c.lineStrong, error = c.danger,
        )
    } else {
        lightColorScheme(
            primary = c.primary, onPrimary = c.onPrimary, background = c.base, onBackground = c.fg,
            surface = c.panel, onSurface = c.fg, surfaceVariant = c.inset, onSurfaceVariant = c.muted,
            outline = c.lineStrong, error = c.danger,
        )
    }
    val t = QdTypeDefault
    CompositionLocalProvider(LocalQdColors provides c, LocalQdType provides t) {
        MaterialTheme(
            colorScheme = scheme,
            shapes = Shapes(
                small = RoundedCornerShape(QdRadius.control),
                medium = RoundedCornerShape(QdRadius.panel),
                large = RoundedCornerShape(QdRadius.sheet),
            ),
            typography = Typography(
                bodyLarge = t.body, bodyMedium = t.body, bodySmall = t.caption,
                titleMedium = t.title, titleLarge = t.headline, labelLarge = t.label,
            ),
            content = content,
        )
    }
}
