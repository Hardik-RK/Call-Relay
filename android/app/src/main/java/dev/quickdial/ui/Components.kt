package dev.quickdial.ui

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.selection.selectableGroup
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Snackbar
import androidx.compose.material3.SnackbarData
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

private val MinTouch = 48.dp

/** A layer one step above the page: flat fill and a 1dp hairline, no elevation. */
@Composable
fun Panel(
    modifier: Modifier = Modifier,
    inset: Boolean = false,
    padding: PaddingValues = PaddingValues(16.dp),
    content: @Composable () -> Unit,
) {
    val c = Qd.colors
    val shape = RoundedCornerShape(QdRadius.panel)
    Box(
        modifier
            .fillMaxWidth()
            .clip(shape)
            .background(if (inset) c.inset else c.panel)
            .border(1.dp, c.line, shape)
            .padding(padding),
    ) { content() }
}

/** Small muted heading above a group, announced as a heading by TalkBack. */
@Composable
fun SectionHeader(text: String, modifier: Modifier = Modifier, trailing: (@Composable () -> Unit)? = null) {
    Row(modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
        Text(
            text.uppercase(),
            style = Qd.type.caption.copy(letterSpacing = 0.8.sp),
            color = Qd.colors.muted,
            modifier = Modifier.weight(1f).semantics { heading() },
        )
        trailing?.invoke()
    }
}

private fun Modifier.pressable(
    enabled: Boolean,
    role: Role,
    onClick: () -> Unit,
    source: MutableInteractionSource,
): Modifier = this.clickable(
    interactionSource = source, indication = null, enabled = enabled, role = role, onClick = onClick,
)

@Composable
private fun ButtonBase(
    onClick: () -> Unit,
    modifier: Modifier,
    enabled: Boolean,
    container: Color,
    pressed: Color,
    border: Color?,
    content: @Composable RowScope.() -> Unit,
) {
    val source = remember { MutableInteractionSource() }
    val isPressed by source.collectIsPressedAsState()
    val shape = RoundedCornerShape(QdRadius.control)
    Row(
        modifier
            .heightIn(min = MinTouch)
            .clip(shape)
            .background(if (isPressed && enabled) pressed else container)
            .then(if (border != null) Modifier.border(1.dp, border, shape) else Modifier)
            .pressable(enabled, Role.Button, onClick, source)
            .padding(horizontal = 16.dp, vertical = 10.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp, Alignment.CenterHorizontally),
        verticalAlignment = Alignment.CenterVertically,
        content = content,
    )
}

@Composable
fun PrimaryButton(
    text: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    container: Color = Qd.colors.primary,
    pressed: Color = Qd.colors.primaryPress,
    contentColor: Color = Qd.colors.onPrimary,
) {
    val c = Qd.colors
    ButtonBase(
        onClick, modifier, enabled,
        container = if (enabled) container else c.inset,
        pressed = pressed,
        border = if (enabled) null else c.line,
    ) {
        Text(
            text, style = Qd.type.bodyStrong,
            color = if (enabled) contentColor else c.muted,
            maxLines = 1, overflow = TextOverflow.Ellipsis,
        )
    }
}

@Composable
fun SecondaryButton(
    text: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    danger: Boolean = false,
) {
    val c = Qd.colors
    ButtonBase(
        onClick, modifier, enabled,
        container = c.panel, pressed = c.hover.compositeOver(c.panel),
        border = c.lineStrong,
    ) {
        Text(
            text, style = Qd.type.bodyStrong,
            color = when {
                !enabled -> c.muted
                danger -> c.dangerText
                else -> c.fg
            },
            maxLines = 1, overflow = TextOverflow.Ellipsis, textAlign = TextAlign.Center,
        )
    }
}

enum class Tone { Neutral, Accent, Success, Warning, Danger }

/** Dot plus label in a soft tinted capsule. Colour is never the only signal: the text says the state. */
@Composable
fun StatusPill(text: String, tone: Tone, modifier: Modifier = Modifier) {
    val c = Qd.colors
    val (dot, fill, ink) = when (tone) {
        Tone.Neutral -> Triple(c.faint, c.hover, c.muted)
        Tone.Accent -> Triple(c.primary, c.accentSoft, c.accentText)
        Tone.Success -> Triple(c.success, c.success.copy(alpha = 0.12f), c.successText)
        Tone.Warning -> Triple(c.warning, c.warning.copy(alpha = 0.16f), c.warningText)
        Tone.Danger -> Triple(c.danger, c.danger.copy(alpha = 0.12f), c.dangerText)
    }
    Row(
        modifier
            .clip(CircleShape)
            .background(fill)
            .padding(horizontal = 10.dp, vertical = 5.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        StatusDot(dot)
        Text(text, style = Qd.type.caption, color = ink, maxLines = 1)
    }
}

@Composable
fun StatusDot(color: Color, size: Dp = 8.dp) {
    Box(Modifier.size(size).clip(CircleShape).background(color).clearAndSetSemantics {})
}

/** Two or three exclusive options in an inset track; the selected one lifts onto a raised chip. */
@Composable
fun SegmentedControl(
    options: List<String>,
    selectedIndex: Int,
    onSelect: (Int) -> Unit,
    label: String,
    modifier: Modifier = Modifier,
) {
    val c = Qd.colors
    val trackShape = RoundedCornerShape(QdRadius.control)
    Row(
        modifier
            .fillMaxWidth()
            .semantics { contentDescription = label }
            .clip(trackShape)
            .background(c.inset)
            .border(1.dp, c.line, trackShape)
            .padding(3.dp)
            .selectableGroup(),
        horizontalArrangement = Arrangement.spacedBy(3.dp),
    ) {
        options.forEachIndexed { i, text ->
            val selected = i == selectedIndex
            val shape = RoundedCornerShape(QdRadius.control - 3.dp)
            Box(
                Modifier
                    .weight(1f)
                    .heightIn(min = 42.dp)
                    .clip(shape)
                    .background(if (selected) c.raised else Color.Transparent)
                    .then(if (selected) Modifier.border(1.dp, c.lineStrong, shape) else Modifier)
                    .selectable(selected = selected, role = Role.RadioButton, onClick = { onSelect(i) }),
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    text,
                    style = if (selected) Qd.type.bodyStrong else Qd.type.body,
                    color = if (selected) c.fg else c.muted,
                    maxLines = 1,
                )
            }
        }
    }
}

/** A chip-sized choice (country codes). The visible pill is 36dp high inside a 48dp hit area. */
@Composable
fun ChoiceChip(text: String, selected: Boolean, onClick: () -> Unit, description: String, modifier: Modifier = Modifier) {
    val c = Qd.colors
    Box(
        modifier
            .heightIn(min = MinTouch)
            .selectable(selected = selected, role = Role.RadioButton, onClick = onClick)
            .semantics { contentDescription = description },
        contentAlignment = Alignment.Center,
    ) {
        Box(
            Modifier
                .heightIn(min = 36.dp)
                .clip(CircleShape)
                .background(if (selected) c.accentSoft else Color.Transparent)
                .border(1.dp, if (selected) c.primary else c.lineStrong, CircleShape)
                .padding(horizontal = 16.dp),
            contentAlignment = Alignment.Center,
        ) {
            Text(
                text, style = Qd.type.label.copy(fontFamily = QdMono),
                color = if (selected) c.accentText else c.muted,
            )
        }
    }
}

/**
 * The dial display: fixed-width mono digits that shrink to fit. It is the app's stand-in for the web
 * UI's dot-matrix numerals (that face is not bundled here), kept in a dark-on-light "readout" well.
 */
@Composable
fun LedNumber(
    text: String,
    placeholder: String,
    modifier: Modifier = Modifier,
    style: TextStyle = Qd.type.ledBig,
    description: String? = null,
) {
    val c = Qd.colors
    val empty = text.isEmpty()
    val shown = if (empty) placeholder else text
    val size = if (empty) style.fontSize * 0.55f else when {
        shown.length <= 12 -> style.fontSize
        shown.length <= 17 -> style.fontSize * 0.8f
        shown.length <= 22 -> style.fontSize * 0.64f
        else -> style.fontSize * 0.52f
    }
    Text(
        shown,
        modifier = modifier.fillMaxWidth().semantics {
            contentDescription = description ?: if (empty) "No number entered" else text.toSpokenDigits()
        },
        style = style.copy(fontSize = size, lineHeight = size * 1.25f),
        color = if (empty) c.faint else c.fg,
        textAlign = TextAlign.Center,
        maxLines = 1,
        softWrap = false,
    )
}

fun String.toSpokenDigits(): String = map {
    when (it) {
        '+' -> "plus"
        '*' -> "star"
        '#' -> "hash"
        else -> it.toString()
    }
}.joinToString(" ")

/** A calm placeholder for a section with nothing in it yet. */
@Composable
fun EmptyPanel(title: String, body: String = "", modifier: Modifier = Modifier) {
    val c = Qd.colors
    Panel(modifier, inset = true) {
        Column(Modifier.fillMaxWidth(), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text(title, style = Qd.type.bodyStrong, color = c.fg, textAlign = TextAlign.Center)
            if (body.isNotEmpty()) Text(body, style = Qd.type.label, color = c.muted, textAlign = TextAlign.Center)
        }
    }
}

/** Snackbar host styled as a small raised toast with a hairline border. */
@Composable
fun QdToastHost(state: SnackbarHostState, modifier: Modifier = Modifier) {
    SnackbarHost(state, modifier) { data: SnackbarData ->
        val c = Qd.colors
        Snackbar(
            modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp),
            shape = RoundedCornerShape(QdRadius.control),
            containerColor = c.raised,
            contentColor = c.fg,
            actionContentColor = c.accentText,
            action = null,
        ) { Text(data.visuals.message, style = Qd.type.body) }
    }
}

/** Plain field chrome shared by the text inputs: label above, hairline box, helper line below. */
@Composable
fun FieldFrame(
    label: String,
    helper: String?,
    helperTone: Tone,
    modifier: Modifier = Modifier,
    focused: Boolean = false,
    content: @Composable () -> Unit,
) {
    val c = Qd.colors
    Column(modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Text(label, style = Qd.type.label, color = c.fg)
        val shape = RoundedCornerShape(QdRadius.control)
        Box(
            Modifier
                .fillMaxWidth()
                .heightIn(min = MinTouch)
                .clip(shape)
                .background(c.inset)
                .border(
                    BorderStroke(if (focused) 2.dp else 1.dp, if (focused) c.primary else if (helperTone == Tone.Danger) c.danger else c.lineStrong),
                    shape,
                )
                .padding(horizontal = 14.dp),
            contentAlignment = Alignment.CenterStart,
        ) { content() }
        if (helper != null) {
            Text(
                helper, style = Qd.type.caption.copy(letterSpacing = 0.sp),
                color = when (helperTone) {
                    Tone.Danger -> c.dangerText
                    Tone.Success -> c.successText
                    else -> c.muted
                },
            )
        }
    }
}

private fun Color.compositeOver(background: Color): Color {
    val a = alpha
    return Color(
        red = red * a + background.red * (1 - a),
        green = green * a + background.green * (1 - a),
        blue = blue * a + background.blue * (1 - a),
        alpha = 1f,
    )
}
