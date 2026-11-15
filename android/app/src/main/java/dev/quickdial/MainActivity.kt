package dev.quickdial

import android.Manifest
import android.content.ActivityNotFoundException
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.Settings as AndroidSettings
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

class MainActivity : ComponentActivity() {
    private lateinit var settings: Settings
    private var pendingCall: Pair<String?, String>? = null

    private val callPermission = registerForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        pendingCall?.let { (id, number) -> launchDialer(id, number, useCall = granted) }
        pendingCall = null
    }

    private val notificationPermission = registerForActivityResult(ActivityResultContracts.RequestPermission()) {}

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        settings = Settings(this)
        // Lets the "Call?" prompt show over the lock screen when it arrives as a full-screen intent.
        setShowWhenLocked(true)
        setTurnScreenOn(true)

        setContent {
            val dark = isSystemInDarkTheme()
            MaterialTheme(
                colorScheme = if (dark) darkColorScheme(primary = Color(0xFF3ECFA6), onPrimary = Color(0xFF04281F))
                else lightColorScheme(primary = Color(0xFF0B6B57)),
            ) {
                Surface(Modifier.fillMaxSize()) { App() }
            }
        }
        if (savedInstanceState == null) handleIntent(intent)
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        handleIntent(intent)
    }

    override fun onStart() {
        super.onStart()
        AppState.activityVisible = true
    }

    override fun onStop() {
        AppState.activityVisible = false
        super.onStop()
    }

    // ---- notification entry points ----------------------------------------------------------

    private fun handleIntent(intent: Intent?) {
        val id = intent?.getStringExtra(Notifier.EXTRA_ID) ?: return
        val number = intent.getStringExtra(Notifier.EXTRA_NUMBER) ?: return
        // These extras came from our own PendingIntent, but treat them like any other input.
        if (!PhoneNumbers.isE164(number)) return
        when (intent.action) {
            Notifier.ACTION_CONFIRM -> {
                Notifier.cancelRequest(this, id)
                AppState.resolve(id)
                startCall(id, number)
            }
            Notifier.ACTION_REVIEW -> {
                Notifier.cancelRequest(this, id)
                AppState.offer(DialCommand(id, number))
            }
        }
        // Do not replay this intent after a rotation or when the activity is recreated.
        setIntent(Intent())
    }

    // ---- placing a call ----------------------------------------------------------------------

    /** ACTION_CALL when we hold CALL_PHONE, otherwise ACTION_DIAL (the user presses the green button). */
    fun startCall(callId: String?, number: String) {
        val granted = ContextCompat.checkSelfPermission(this, Manifest.permission.CALL_PHONE) == PackageManager.PERMISSION_GRANTED
        when {
            granted -> launchDialer(callId, number, useCall = true)
            !settings.callPermissionAsked -> {
                settings.callPermissionAsked = true
                pendingCall = callId to number
                callPermission.launch(Manifest.permission.CALL_PHONE)
            }
            else -> launchDialer(callId, number, useCall = false)
        }
    }

    private fun launchDialer(callId: String?, number: String, useCall: Boolean) {
        val action = if (useCall) Intent.ACTION_CALL else Intent.ACTION_DIAL
        try {
            startActivity(Intent(action, Uri.fromParts("tel", number, null)))
            callId?.let { Reporter.report(this, it, "dialing") }
        } catch (e: SecurityException) {
            if (useCall) launchDialer(callId, number, useCall = false) else fail(callId, "not allowed to open the dialer")
        } catch (e: ActivityNotFoundException) {
            fail(callId, "no dialer app on this phone")
        }
    }

    private fun fail(callId: String?, reason: String) {
        Toast.makeText(this, "Could not start the call: $reason", Toast.LENGTH_LONG).show()
        callId?.let { Reporter.report(this, it, "failed", reason) }
    }

    // ---- UI ----------------------------------------------------------------------------------

    @Composable
    private fun App() {
        var paired by remember { mutableStateOf(settings.isPaired) }
        val status by AppState.status.collectAsState()
        // The service clears pairing itself when the server revokes this phone.
        LaunchedEffect(status) { paired = settings.isPaired }

        val prompts by AppState.prompts.collectAsState()
        Column(
            Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(20.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            Text("Quick Dial", style = MaterialTheme.typography.headlineMedium)
            if (paired) HomeScreen(status, onUnpaired = { paired = false })
            else PairScreen(onPaired = { paired = true })
        }
        prompts.firstOrNull()?.let { cmd -> ConfirmDialog(cmd) }
    }

    @Composable
    private fun ConfirmDialog(cmd: DialCommand) {
        AlertDialog(
            onDismissRequest = {},
            title = { Text("Call this number?") },
            text = { Text(cmd.number, style = MaterialTheme.typography.titleLarge) },
            confirmButton = {
                Button(onClick = {
                    AppState.resolve(cmd.id)
                    startCall(cmd.id, cmd.number)
                }) { Text("Call") }
            },
            dismissButton = {
                TextButton(onClick = {
                    AppState.resolve(cmd.id)
                    Reporter.report(this, cmd.id, "failed", "declined on phone")
                }) { Text("Decline") }
            },
        )
    }

    @Composable
    private fun PairScreen(onPaired: () -> Unit) {
        var url by remember { mutableStateOf("") }
        var code by remember { mutableStateOf("") }
        var error by remember { mutableStateOf<String?>(null) }
        var busy by remember { mutableStateOf(false) }
        val scope = rememberCoroutineScope()

        Text(
            "Open the web page, press \"Pair a phone\", then enter the server address and the code it shows.",
            style = MaterialTheme.typography.bodyMedium,
        )
        OutlinedTextField(
            value = url, onValueChange = { url = it }, label = { Text("Server address") },
            placeholder = { Text("192.168.1.20:8787") }, singleLine = true,
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Uri),
            modifier = Modifier.fillMaxWidth(),
        )
        OutlinedTextField(
            value = code, onValueChange = { code = it.uppercase() }, label = { Text("Pairing code") },
            placeholder = { Text("ABCD-EFGH") }, singleLine = true, modifier = Modifier.fillMaxWidth(),
        )
        error?.let { Text(it, color = MaterialTheme.colorScheme.error) }
        Button(
            enabled = !busy && url.isNotBlank() && code.isNotBlank(),
            modifier = Modifier.fillMaxWidth(),
            onClick = {
                val base = ServerUrl.normalize(url)
                if (base == null) {
                    error = "That does not look like a server address."
                    return@Button
                }
                busy = true
                error = null
                scope.launch {
                    val result = withContext(Dispatchers.IO) { runCatching { Api(base).pair(code.trim()) } }
                    busy = false
                    result.onSuccess { token ->
                        settings.serverUrl = base
                        settings.token = token
                        settings.listening = true
                        askNotificationPermission()
                        PollService.start(this@MainActivity)
                        onPaired()
                    }.onFailure { e ->
                        error = if (e is ApiException) e.message else "Could not reach the server. Check the address and that both devices are on the same network."
                    }
                }
            },
        ) { Text(if (busy) "Pairing..." else "Pair") }
    }

    @Composable
    private fun HomeScreen(status: String, onUnpaired: () -> Unit) {
        var listening by remember { mutableStateOf(settings.listening) }
        var country by remember { mutableStateOf(settings.country) }
        var number by remember { mutableStateOf("") }
        val scope = rememberCoroutineScope()
        val parsed = if (number.isBlank()) null else PhoneNumbers.normalize(number, country)

        // Resume listening when the app is reopened (the service does not survive a reboot).
        LaunchedEffect(Unit) { if (settings.listening) PollService.start(this@MainActivity) }

        Card(Modifier.fillMaxWidth()) {
            Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text("Paired with ${settings.serverUrl}", style = MaterialTheme.typography.bodyMedium)
                Text(status, style = MaterialTheme.typography.titleMedium)
                Row(horizontalArrangement = Arrangement.spacedBy(12.dp), verticalAlignment = androidx.compose.ui.Alignment.CenterVertically) {
                    Switch(checked = listening, onCheckedChange = { on ->
                        listening = on
                        settings.listening = on
                        if (on) {
                            askNotificationPermission()
                            PollService.start(this@MainActivity)
                        } else {
                            PollService.stop(this@MainActivity)
                            AppState.status.value = "Not listening"
                        }
                    })
                    Text("Receive calls from the web page")
                }
            }
        }

        Card(Modifier.fillMaxWidth()) {
            Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text("Call a number", style = MaterialTheme.typography.titleMedium)
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Country.entries.forEach { c ->
                        FilterChip(selected = c == country, onClick = { country = c; settings.country = c }, label = { Text(c.code) })
                    }
                }
                OutlinedTextField(
                    value = number, onValueChange = { number = it }, label = { Text("Phone number") },
                    singleLine = true, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Phone),
                    modifier = Modifier.fillMaxWidth(),
                )
                when (parsed) {
                    is PhoneResult.Ok -> Text("Will dial ${parsed.e164}")
                    is PhoneResult.Failed -> Text(describe(parsed.reason), color = MaterialTheme.colorScheme.error)
                    null -> Text("Digits, spaces and dashes are fine.")
                }
                Button(
                    enabled = parsed is PhoneResult.Ok,
                    modifier = Modifier.fillMaxWidth(),
                    onClick = { (parsed as? PhoneResult.Ok)?.let { startCall(null, it.e164) } },
                ) { Text("Call") }
            }
        }

        Card(Modifier.fillMaxWidth()) {
            Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text("Reliability", style = MaterialTheme.typography.titleMedium)
                Text(
                    "Android may stop the background connection to save battery. If calls from the web page " +
                        "arrive late or not at all, allow this app to run unrestricted.",
                    style = MaterialTheme.typography.bodySmall,
                )
                OutlinedButton(onClick = { open(Intent(AndroidSettings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS)) }) {
                    Text("Battery settings")
                }
                if (Build.VERSION.SDK_INT >= 34) {
                    OutlinedButton(onClick = {
                        open(Intent(AndroidSettings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT, Uri.parse("package:$packageName")))
                    }) { Text("Lock-screen prompt settings") }
                }
            }
        }

        OutlinedButton(
            modifier = Modifier.fillMaxWidth(),
            onClick = {
                scope.launch {
                    val url = settings.serverUrl
                    val token = settings.token
                    PollService.stop(this@MainActivity)
                    if (url != null && token != null) {
                        withContext(Dispatchers.IO) { runCatching { Api(url, token).unpair() } }
                    }
                    settings.clearPairing()
                    AppState.status.value = "Not listening"
                    onUnpaired()
                }
            },
        ) { Text("Unpair this phone") }
    }

    private fun describe(reason: PhoneFailure): String = when (reason) {
        PhoneFailure.EMPTY -> "Enter a phone number."
        PhoneFailure.INVALID_CHARACTERS -> "Use digits, spaces, dashes and an optional leading +."
        PhoneFailure.TOO_SHORT -> "That number is too short."
        PhoneFailure.TOO_LONG -> "That number is too long."
        PhoneFailure.INVALID_FOR_COUNTRY -> "That does not look like a valid number for its country."
    }

    private fun askNotificationPermission() {
        if (Build.VERSION.SDK_INT >= 33 &&
            ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
        ) {
            notificationPermission.launch(Manifest.permission.POST_NOTIFICATIONS)
        }
    }

    private fun open(intent: Intent) {
        try {
            startActivity(intent)
        } catch (_: ActivityNotFoundException) {
            Toast.makeText(this, "This setting is not available on this phone.", Toast.LENGTH_SHORT).show()
        }
    }
}
