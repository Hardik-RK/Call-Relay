package dev.quickdial.ui

import android.os.Build
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsFocusedAsState
import androidx.compose.foundation.selection.toggleable
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import androidx.compose.foundation.Image
import androidx.compose.ui.graphics.ColorFilter
import dev.quickdial.Country
import dev.quickdial.PhoneFailure
import dev.quickdial.PhoneNumbers
import dev.quickdial.PhoneResult
import dev.quickdial.R
import dev.quickdial.ServerUrl

const val PAIRING_CODE_LENGTH = 8

/** Maps the service's free-text status onto a pill: label, tone. Pure so it can be unit tested. */
fun statusPill(status: String): Pair<String, Tone> = when {
    status.startsWith("Connected") -> "Listening" to Tone.Success
    status.startsWith("Not listening") -> "Not listening" to Tone.Neutral
    status.contains("unreachable", ignoreCase = true) -> "Retrying" to Tone.Warning
    status.startsWith("Unpaired") || status.startsWith("Stopped") -> "Stopped" to Tone.Danger
    else -> "Connecting" to Tone.Accent
}

/** Second line under the status headline; avoids repeating the headline word for word. */
fun statusDetail(status: String): String =
    if (status.startsWith("Not listening")) "Requests from the web page will not reach this phone." else status

/** Page chrome: wordmark on the left, optional trailing slot (status pill) on the right. */
@Composable
fun AppHeader(trailing: (@Composable () -> Unit)? = null) {
    val c = Qd.colors
    Row(
        Modifier.fillMaxWidth().heightIn(min = 48.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Box(
            Modifier.size(28.dp).clip(RoundedCornerShape(8.dp)).background(c.primary),
            contentAlignment = Alignment.Center,
        ) {
            Image(
                painterResource(R.drawable.ic_call), contentDescription = null,
                modifier = Modifier.size(16.dp), colorFilter = ColorFilter.tint(c.onPrimary),
            )
        }
        Text(
            "Quick Dial", style = Qd.type.title, color = c.fg,
            modifier = Modifier.weight(1f).semantics { heading() },
        )
        trailing?.invoke()
    }
}

// ---------------------------------------------------------------------------------------------
// Pair screen
// ---------------------------------------------------------------------------------------------

@Composable
fun PairScreen(
    url: String,
    code: String,
    error: String?,
    busy: Boolean,
    onUrl: (String) -> Unit,
    onCode: (String) -> Unit,
    onPair: () -> Unit,
) {
    val c = Qd.colors
    val normalized = remember(url) { ServerUrl.normalize(url) }
    val (urlHelper, urlTone) = when {
        url.isBlank() -> "Shown next to the pairing code on the web page. Example: 192.168.1.20:8787" to Tone.Neutral
        normalized == null -> "That does not look like a server address." to Tone.Danger
        else -> "Will connect to $normalized" to Tone.Success
    }
    val remaining = PAIRING_CODE_LENGTH - code.length
    val codeHelper = when {
        remaining > 0 -> "$remaining more ${if (remaining == 1) "character" else "characters"}. Letters and digits only."
        else -> "Code complete."
    }
    val ready = !busy && normalized != null && code.length == PAIRING_CODE_LENGTH

    Column(verticalArrangement = Arrangement.spacedBy(16.dp)) {
        AppHeader()
        Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text("Pair this phone", style = Qd.type.headline, color = c.fg, modifier = Modifier.semantics { heading() })
            Text(
                "Open the web page, press \"Pair a phone\", then enter the server address and the 8-character code it shows.",
                style = Qd.type.body, color = c.muted,
            )
        }
        Panel {
            Column(verticalArrangement = Arrangement.spacedBy(20.dp)) {
                val urlSource = remember { MutableInteractionSource() }
                val urlFocused by urlSource.collectIsFocusedAsState()
                FieldFrame("Server address", urlHelper, urlTone, focused = urlFocused) {
                    BasicTextField(
                        value = url, onValueChange = onUrl, singleLine = true,
                        interactionSource = urlSource,
                        textStyle = Qd.type.mono.copy(color = c.fg),
                        cursorBrush = SolidColor(c.primary),
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Uri),
                        modifier = Modifier.fillMaxWidth().semantics { contentDescription = "Server address" },
                        decorationBox = { inner ->
                            Box(Modifier.heightIn(min = 46.dp), contentAlignment = Alignment.CenterStart) {
                                if (url.isEmpty()) Text("192.168.1.20:8787", style = Qd.type.mono, color = c.muted)
                                inner()
                            }
                        },
                    )
                }
                PairingCodeField(code, codeHelper, onCode)
            }
        }
        if (error != null) {
            Panel(
                modifier = Modifier.semantics { liveRegion = LiveRegionMode.Assertive },
                padding = PaddingValues(horizontal = 14.dp, vertical = 12.dp),
            ) {
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp), verticalAlignment = Alignment.Top) {
                    Box(Modifier.padding(top = 6.dp)) { StatusDot(c.danger) }
                    Text(error, style = Qd.type.body, color = c.dangerText)
                }
            }
        }
        PrimaryButton(
            text = if (busy) "Pairing..." else "Pair",
            onClick = onPair, enabled = ready, modifier = Modifier.fillMaxWidth(),
        )
    }
}

/** Eight mono cells in two groups of four over one real text field, so paste and IME input just work. */
@Composable
private fun PairingCodeField(code: String, helper: String, onCode: (String) -> Unit) {
    val c = Qd.colors
    val source = remember { MutableInteractionSource() }
    val focused by source.collectIsFocusedAsState()
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Text("Pairing code", style = Qd.type.label, color = c.fg)
        BasicTextField(
            value = code,
            onValueChange = { onCode(it.filter { ch -> ch.isLetterOrDigit() }.uppercase().take(PAIRING_CODE_LENGTH)) },
            singleLine = true,
            interactionSource = source,
            cursorBrush = SolidColor(androidx.compose.ui.graphics.Color.Transparent),
            textStyle = Qd.type.mono.copy(color = androidx.compose.ui.graphics.Color.Transparent),
            keyboardOptions = KeyboardOptions(
                keyboardType = KeyboardType.Ascii,
                capitalization = androidx.compose.ui.text.input.KeyboardCapitalization.Characters,
            ),
            modifier = Modifier.fillMaxWidth().semantics { contentDescription = "Pairing code, 8 characters" },
            decorationBox = { inner ->
                Box {
                    Box(Modifier.size(1.dp)) { inner() }
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.Center, verticalAlignment = Alignment.CenterVertically) {
                        for (i in 0 until PAIRING_CODE_LENGTH) {
                            if (i == 4) Spacer(Modifier.width(14.dp))
                            else if (i > 0) Spacer(Modifier.width(5.dp))
                            val active = focused && i == code.length.coerceAtMost(PAIRING_CODE_LENGTH - 1)
                            val shape = RoundedCornerShape(QdRadius.control)
                            Box(
                                Modifier
                                    .width(34.dp).height(52.dp)
                                    .clip(shape)
                                    .background(c.inset)
                                    .border(if (active) 2.dp else 1.dp, if (active) c.primary else c.lineStrong, shape),
                                contentAlignment = Alignment.Center,
                            ) {
                                Text(
                                    code.getOrNull(i)?.toString() ?: "",
                                    style = Qd.type.led.copy(fontSize = 22.sp, lineHeight = 26.sp, letterSpacing = 0.sp),
                                    color = c.fg,
                                )
                            }
                        }
                    }
                }
            },
        )
        Text(helper, style = Qd.type.caption.copy(letterSpacing = 0.sp), color = c.muted)
    }
}

// ---------------------------------------------------------------------------------------------
// Home screen
// ---------------------------------------------------------------------------------------------

private const val KEYPAD_EXACT_ONLY = "*#"

@Composable
fun HomeScreen(
    status: String,
    serverUrl: String,
    listening: Boolean,
    country: Country,
    exactMode: Boolean,
    number: String,
    onListening: (Boolean) -> Unit,
    onCountry: (Country) -> Unit,
    onExactMode: (Boolean) -> Unit,
    onNumber: (String) -> Unit,
    onPaste: () -> Unit,
    onCall: (String) -> Unit,
    onBattery: () -> Unit,
    onFullScreen: (() -> Unit)?,
    onUnpair: () -> Unit,
) {
    val c = Qd.colors
    val (pillText, pillTone) = statusPill(status)
    val parsed = when {
        number.isBlank() -> null
        exactMode -> if (PhoneNumbers.isDialString(number)) PhoneResult.Ok(number.trim()) else PhoneResult.Failed(PhoneFailure.INVALID_CHARACTERS)
        else -> PhoneNumbers.normalize(number, country)
    }

    Column(verticalArrangement = Arrangement.spacedBy(14.dp)) {
        AppHeader { StatusPill(pillText, pillTone) }

        // Connection
        Panel {
            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    StatusDot(
                        when (pillTone) {
                            Tone.Success -> c.success
                            Tone.Warning -> c.warning
                            Tone.Danger -> c.danger
                            Tone.Accent -> c.primary
                            Tone.Neutral -> c.faint
                        },
                        size = 10.dp,
                    )
                    Column(Modifier.weight(1f).semantics(mergeDescendants = true) { liveRegion = LiveRegionMode.Polite }) {
                        Text(pillText, style = Qd.type.title, color = c.fg)
                        Text(statusDetail(status), style = Qd.type.label, color = c.muted)
                    }
                }
                Text(
                    serverUrl, style = Qd.type.monoSmall, color = c.muted,
                    maxLines = 1, overflow = TextOverflow.Ellipsis,
                    modifier = Modifier
                        .fillMaxWidth().clip(RoundedCornerShape(8.dp)).background(c.inset)
                        .padding(horizontal = 10.dp, vertical = 8.dp)
                        .semantics { contentDescription = "Paired with server $serverUrl" },
                )
                HairlineDivider()
                Row(
                    Modifier
                        .fillMaxWidth().heightIn(min = 48.dp)
                        .toggleable(value = listening, role = Role.Switch, onValueChange = onListening),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    Text("Receive calls from the web page", style = Qd.type.body, color = c.fg, modifier = Modifier.weight(1f))
                    Switch(
                        checked = listening, onCheckedChange = null,
                        colors = SwitchDefaults.colors(
                            checkedTrackColor = c.primary, checkedThumbColor = c.onPrimary, checkedBorderColor = c.primary,
                            uncheckedTrackColor = c.inset, uncheckedThumbColor = c.muted, uncheckedBorderColor = c.lineStrong,
                        ),
                    )
                }
            }
        }

        // Dial
        Panel(padding = PaddingValues(14.dp)) {
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                SectionHeader("Call a number") {
                    Box(
                        Modifier
                            .heightIn(min = 48.dp).clip(RoundedCornerShape(QdRadius.control))
                            .clickable(role = Role.Button, onClick = onPaste)
                            .padding(horizontal = 10.dp),
                        contentAlignment = Alignment.Center,
                    ) { Text("Paste", style = Qd.type.bodyStrong, color = c.accentText) }
                }
                SegmentedControl(
                    options = listOf("Number", "Exactly as typed"),
                    selectedIndex = if (exactMode) 1 else 0,
                    onSelect = { onExactMode(it == 1) },
                    label = "Dial mode",
                )
                if (!exactMode) {
                    Row(
                        Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(8.dp, Alignment.CenterHorizontally),
                    ) {
                        Country.entries.forEach { ct ->
                            ChoiceChip(
                                ct.code, selected = ct == country, onClick = { onCountry(ct) },
                                description = "Default country ${ct.code}, plus ${ct.dial.removePrefix("+")}",
                            )
                        }
                    }
                }
                Panel(inset = true, padding = PaddingValues(horizontal = 12.dp, vertical = 14.dp)) {
                    Column(Modifier.fillMaxWidth(), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(4.dp)) {
                        LedNumber(number, placeholder = if (exactMode) "Dial string" else "Phone number")
                        val (line, tone) = when (parsed) {
                            is PhoneResult.Ok -> (if (exactMode) "Will dial exactly ${parsed.e164}" else "Will dial ${parsed.e164}") to Tone.Success
                            is PhoneResult.Failed -> describe(parsed.reason) to Tone.Danger
                            null -> (if (exactMode) "Short codes, extensions, * and # are sent as typed." else "Digits are fine. Add + for another country.") to Tone.Neutral
                        }
                        Text(
                            line, style = Qd.type.label, textAlign = TextAlign.Center,
                            color = when (tone) { Tone.Success -> c.successText; Tone.Danger -> c.dangerText; else -> c.muted },
                            modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite },
                        )
                    }
                }
                Keypad(
                    exactMode = exactMode,
                    canCall = parsed is PhoneResult.Ok,
                    onKey = { if (number.length < PhoneNumbers.MAX_DIAL_STRING) onNumber(number + it) },
                    onBackspace = { onNumber(number.dropLast(1)) },
                    onClear = { onNumber("") },
                    onCall = { (parsed as? PhoneResult.Ok)?.let { onCall(it.e164) } },
                )
            }
        }

        // Requests from the web page
        SectionHeader("Requests", Modifier.padding(top = 4.dp))
        EmptyPanel(
            title = if (listening) "Waiting for the web page" else "Not receiving requests",
            body = if (listening) "When you press Call on the web page, a confirmation appears here and as a notification."
            else "Turn on \"Receive calls from the web page\" to get confirmation prompts here.",
        )

        // Reliability
        SectionHeader("Reliability", Modifier.padding(top = 4.dp))
        Panel {
            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Text(
                    "Android may stop the background connection to save battery. If calls from the web page " +
                        "arrive late or not at all, allow this app to run unrestricted.",
                    style = Qd.type.body, color = c.muted,
                )
                SecondaryButton("Battery settings", onBattery, Modifier.fillMaxWidth())
                if (Build.VERSION.SDK_INT >= 34 && onFullScreen != null) {
                    SecondaryButton("Lock-screen prompt settings", onFullScreen, Modifier.fillMaxWidth())
                }
            }
        }

        SecondaryButton("Unpair this phone", onUnpair, Modifier.fillMaxWidth(), danger = true)
    }
}

@Composable
private fun HairlineDivider() {
    Box(Modifier.fillMaxWidth().height(1.dp).background(Qd.colors.line))
}

private val PadRows = listOf(
    listOf("1", "2", "3"), listOf("4", "5", "6"), listOf("7", "8", "9"), listOf("*", "0", "#"),
)

@Composable
private fun Keypad(
    exactMode: Boolean,
    canCall: Boolean,
    onKey: (String) -> Unit,
    onBackspace: () -> Unit,
    onClear: () -> Unit,
    onCall: () -> Unit,
) {
    val c = Qd.colors
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        PadRows.forEach { row ->
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                row.forEach { key ->
                    val enabled = exactMode || key !in KEYPAD_EXACT_ONLY.map { it.toString() }
                    KeypadKey(
                        label = key,
                        description = when (key) { "*" -> "star"; "#" -> "hash"; else -> key },
                        onClick = { onKey(key) },
                        enabled = enabled,
                        modifier = Modifier.weight(1f),
                    )
                }
            }
        }
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            KeypadKey("+", "plus", { onKey("+") }, Modifier.weight(1f))
            KeypadKey(
                label = "Call", description = if (canCall) "Call" else "Call, unavailable until the number is valid",
                onClick = onCall, enabled = canCall, modifier = Modifier.weight(1f),
                container = if (canCall) c.call else c.panel,
                pressed = c.call.copy(alpha = 0.85f),
                border = !canCall,
            ) {
                Image(
                    painterResource(R.drawable.ic_call), contentDescription = null, modifier = Modifier.size(24.dp),
                    colorFilter = ColorFilter.tint(if (canCall) c.onCall else c.faint),
                )
            }
            KeypadKey(
                label = "", description = "Delete last digit", onClick = onBackspace,
                onLongClick = onClear, modifier = Modifier.weight(1f),
            ) {
                Image(
                    painterResource(R.drawable.ic_backspace), contentDescription = null, modifier = Modifier.size(24.dp),
                    colorFilter = ColorFilter.tint(c.fg),
                )
            }
        }
    }
}

fun describe(reason: PhoneFailure): String = when (reason) {
    PhoneFailure.EMPTY -> "Enter a phone number."
    PhoneFailure.INVALID_CHARACTERS -> "Use digits, spaces, dashes and an optional leading +."
    PhoneFailure.TOO_SHORT -> "That number is too short."
    PhoneFailure.TOO_LONG -> "That number is too long."
    PhoneFailure.INVALID_FOR_COUNTRY -> "That does not look like a valid number for its country."
}

// ---------------------------------------------------------------------------------------------
// Confirm dialog
// ---------------------------------------------------------------------------------------------

@Composable
fun ConfirmCallDialog(number: String, exact: Boolean, onCall: () -> Unit, onDecline: () -> Unit) {
    val c = Qd.colors
    Dialog(
        onDismissRequest = {},
        properties = DialogProperties(dismissOnBackPress = false, dismissOnClickOutside = false),
    ) {
        Panel(padding = PaddingValues(20.dp)) {
            Column(verticalArrangement = Arrangement.spacedBy(16.dp)) {
                Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Text(
                        "FROM THE WEB PAGE", style = Qd.type.caption.copy(letterSpacing = 0.8.sp), color = c.accentText,
                    )
                    Text("Call this number?", style = Qd.type.headline, color = c.fg, modifier = Modifier.semantics { heading() })
                }
                Panel(inset = true, padding = PaddingValues(horizontal = 10.dp, vertical = 18.dp)) {
                    Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.fillMaxWidth()) {
                        LedNumber(number, placeholder = "", description = number.toSpokenDigits())
                        if (exact) {
                            Text("Dialled exactly as sent", style = Qd.type.caption, color = c.muted)
                        }
                    }
                }
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    SecondaryButton("Decline", onDecline, Modifier.weight(1f))
                    PrimaryButton(
                        "Call", onCall, Modifier.weight(1f),
                        container = c.call, pressed = c.call.copy(alpha = 0.85f), contentColor = c.onCall,
                    )
                }
            }
        }
    }
}

// ---------------------------------------------------------------------------------------------
// Previews (light and dark) for every screen
// ---------------------------------------------------------------------------------------------

@Composable
private fun PreviewPage(dark: Boolean, content: @Composable () -> Unit) {
    QuickDialTheme(dark) {
        Box(Modifier.background(Qd.colors.base).padding(16.dp)) { content() }
    }
}

@Preview(name = "Pair light", widthDp = 360, heightDp = 640)
@Composable
private fun PairLightPreview() = PreviewPage(false) { PairScreen("192.168.1.20:8787", "ABCD", "That code is wrong, expired or already used.", false, {}, {}, {}) }

@Preview(name = "Pair dark", widthDp = 360, heightDp = 640)
@Composable
private fun PairDarkPreview() = PreviewPage(true) { PairScreen("", "", null, false, {}, {}, {}) }

@Preview(name = "Home light", widthDp = 360, heightDp = 1100)
@Composable
private fun HomeLightPreview() = PreviewPage(false) {
    HomeScreen("Connected, waiting for calls", "http://192.168.1.20:8787", true, Country.IN, false, "98765 43210", {}, {}, {}, {}, {}, {}, {}, {}, {})
}

@Preview(name = "Home dark", widthDp = 360, heightDp = 1100)
@Composable
private fun HomeDarkPreview() = PreviewPage(true) {
    HomeScreen("Server unreachable, retrying", "http://192.168.1.20:8787", true, Country.IN, true, "*#06#", {}, {}, {}, {}, {}, {}, {}, {}, {})
}

@Preview(name = "Confirm light", widthDp = 360, heightDp = 420)
@Composable
private fun ConfirmLightPreview() = PreviewPage(false) { ConfirmCallDialogBody("+919876543210") }

@Preview(name = "Confirm dark", widthDp = 360, heightDp = 420)
@Composable
private fun ConfirmDarkPreview() = PreviewPage(true) { ConfirmCallDialogBody("+919876543210") }

@Composable
private fun ConfirmCallDialogBody(number: String) {
    // The Dialog window does not draw in a preview, so show the same content inline.
    val c = Qd.colors
    Panel(padding = PaddingValues(20.dp)) {
        Column(verticalArrangement = Arrangement.spacedBy(16.dp)) {
            Text("Call this number?", style = Qd.type.headline, color = c.fg)
            Panel(inset = true) { LedNumber(number, "") }
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                SecondaryButton("Decline", {}, Modifier.weight(1f))
                PrimaryButton("Call", {}, Modifier.weight(1f), container = c.call, contentColor = c.onCall)
            }
        }
    }
}
